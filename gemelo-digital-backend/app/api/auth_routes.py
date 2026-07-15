"""Rutas OAuth 2.0 de Brightspace (extraidas de main.py)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import urllib.parse
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse

from app.security import SESSION_SECRET
from app.state import TOKENS, save_session, get_session, delete_session, get_access_token
from app.api.deps import (
    BRIGHTSPACE_BASE_URL, LP_VERSION, LE_VERSION,
    BRIGHTSPACE_AUTH_URL, BRIGHTSPACE_TOKEN_URL,
    CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SCOPE, FRONTEND_BASE,
    SESSION_COOKIE, SESSION_MAX_AGE, _tool_is_https,
    _get_session_id, _require_session, _require_token_from_request,
    _auth_headers, _bs_get, _get_whoami_id,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter()



# ──────────────────────────────────────────────────────────────────────────────
# OAuth 2.0 — Login por usuario (Microsoft → Brightspace)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/auth/brightspace/login")
def brightspace_login(
    next: str | None = Query(default=None, description="URL de retorno tras login"),
    org_unit_id: str | None = Query(default=None, description="Curso a preseleccionar"),
):
    """
    Inicia el flujo OAuth 2.0 (PKCE-less, authorization_code).
    Microsoft SSO está configurado en Brightspace como IdP, así que
    Brightspace redirige automáticamente a Microsoft si la sesión no está activa.
    """
    if not CLIENT_ID or not REDIRECT_URI:
        return JSONResponse(
            status_code=500,
            content={
                "error": "Faltan BRIGHTSPACE_CLIENT_ID y/o BRIGHTSPACE_REDIRECT_URI"
            },
        )

    # Codificar estado para retornar tras el callback
    state_payload = secrets.token_urlsafe(24)
    # Guardamos next y org_unit_id en un mini-state firmado
    raw = json.dumps({"s": state_payload, "next": next or "", "ou": org_unit_id or ""})
    sig = hmac.new(SESSION_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()[:16]
    state = base64.urlsafe_b64encode(f"{raw}|||{sig}".encode()).decode().rstrip("=")

    params = {
        "client_id":     CLIENT_ID,
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         SCOPE,
        "state":         state,
        # NOTA: NO incluimos prompt=login aqui.
        # Con prompt=login, Brightspace siempre fuerza SSO con Microsoft, lo que
        # rompe el flujo cuando el usuario ya tiene sesion en Brightspace pero el
        # SAML RelayState no preservo el estado OAuth en el primer intento
        # (termina en d2l/home en lugar del callback). Sin el parametro, si ya
        # hay sesion en Brightspace el OAuth completa instantaneamente sin SSO.
    }
    url = f"{BRIGHTSPACE_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url)


@router.get("/auth/brightspace/callback")
async def brightspace_callback(request: Request):
    """
    Callback de Brightspace OAuth.
    - Intercambia el código por un access_token.
    - Guarda el token en SESSION_STORE keyed por un session_id único.
    - Establece cookie httponly con el session_id.
    - Redirige al frontend con ?orgUnitId= si venía de LTI.
    """
    code   = request.query_params.get("code")
    state  = request.query_params.get("state")
    error  = request.query_params.get("error")
    error_desc = request.query_params.get("error_description")

    if error:
        return JSONResponse(
            status_code=400,
            content={"error": error, "description": error_desc},
        )
    if not code:
        return JSONResponse(status_code=400, content={"error": "Falta code en callback"})
    if not CLIENT_ID or not CLIENT_SECRET or not REDIRECT_URI:
        return JSONResponse(
            status_code=500,
            content={"error": "Configuración OAuth incompleta en el servidor"},
        )

    # Decodificar state para recuperar next/org_unit_id
    next_url = ""
    org_unit_id = ""
    if state:
        try:
            pad = "=" * ((4 - len(state) % 4) % 4)
            raw_full = base64.urlsafe_b64decode(state + pad).decode()
            raw, sig = raw_full.rsplit("|||", 1)
            expected = hmac.new(
                SESSION_SECRET.encode(), raw.encode(), hashlib.sha256
            ).hexdigest()[:16]
            if hmac.compare_digest(sig, expected):
                payload = json.loads(raw)
                next_url    = payload.get("next", "")
                org_unit_id = payload.get("ou", "")
            else:
                logger.warning("OAuth callback: firma de state inválida; se ignora next/ou")
        except Exception:
            pass

    # Intercambiar code por token
    data = {
        "grant_type":    "authorization_code",
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri":  REDIRECT_URI,
        "code":          code,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(BRIGHTSPACE_TOKEN_URL, data=data)

    if resp.status_code != 200:
        return JSONResponse(
            status_code=resp.status_code,
            content={"error": "Token exchange falló", "detail": resp.text[:500]},
        )

    token_json = resp.json()
    access_token = token_json.get("access_token")
    if not access_token:
        return JSONResponse(
            status_code=500,
            content={"error": "Brightspace no devolvió access_token"},
        )

    # Obtener info del usuario para enriquecer la sesión
    headers = {"Authorization": f"Bearer {access_token}"}
    uid, user_name, user_email = None, None, None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/whoami",
                headers=headers,
            )
            if r.status_code == 200:
                w = r.json()
                uid        = str(w.get("Identifier") or w.get("UserId") or "")
                user_name  = w.get("FirstName", "") + " " + w.get("LastName", "")
                user_email = w.get("UniqueName") or w.get("EmailAddress") or ""
    except Exception as e:
        logger.warning("whoami falló al crear sesión: %s", e)

    # Detect system-level role (e.g. Super Administrator) from /users/{uid}
    system_role = None
    if uid:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/{uid}",
                    headers=headers,
                )
                if r.status_code == 200:
                    u = r.json()
                    role_id = str(u.get("RoleId") or "")
                    if role_id == "105":
                        system_role = "Super Administrator"
                    elif role_id == "116":
                        system_role = "Administrator"
        except Exception as e:
            logger.warning("user role detection failed: %s", e)

    # Crear sesión
    session_id = secrets.token_urlsafe(32)
    save_session(session_id, {
        **token_json,
        "user_id":    uid,
        "user_name":  (user_name or "").strip(),
        "user_email": user_email,
        "role": system_role,
        "all_roles": [system_role] if system_role else [],
    })
    logger.info("Sesión creada para user_id=%s name=%s", uid, user_name)

    # Registrar al usuario para poder enviarle anuncios/notificaciones (opción B).
    try:
        from app.services.user_registry import record_user
        record_user(uid, (user_name or "").strip(), user_email, system_role)
    except Exception as _e:
        logger.warning("record_user falló: %s", str(_e)[:120])

    # Persistir el login en Postgres (historial de uso — sobrevive redeploys).
    try:
        import asyncio as _asyncio
        from app.services.usage_tracking import record_login
        await _asyncio.to_thread(
            record_login, uid, (user_name or "").strip(), user_email, system_role
        )
    except Exception as _e:
        logger.warning("record_login (db) falló: %s", str(_e)[:120])

    # Construir redirect al frontend
    front = FRONTEND_BASE or ""

    # Hash fragment (#) — nunca va al servidor, nunca se cachea,
    # JavaScript lo lee instantáneamente sin depender de cookies cross-domain.
    # Formato: #gemelo:SESSION_ID:orgUnitId:first_login
    hash_ou  = org_unit_id or ""
    hash_frag = f"#gemelo:{session_id}:{hash_ou}:1"

    if next_url and next_url.startswith("/") and not next_url.startswith("//"):
        redirect_to = f"{front}{next_url}{hash_frag}"
    elif org_unit_id:
        redirect_to = f"{front}/{hash_frag}"
    else:
        redirect_to = f"{front}/{hash_frag}"

    response = RedirectResponse(url=redirect_to, status_code=302)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_id,
        httponly=True,
        secure=True,         # siempre True — gemelo.cesa.edu.co es HTTPS
        samesite="none",     # none requerido: frontend y backend son dominios distintos
        max_age=SESSION_MAX_AGE,
        path="/",
    )
    return response


@router.get("/auth/me")
async def auth_me(request: Request):
    """
    Devuelve la identidad del usuario autenticado.
    Acepta el session_id via (en orden de prioridad):
    1. Header Authorization: Bearer <session_id>
    2. Cookie gemelo_session_id
    (El query param ?sid= se eliminó: filtraba el session id en logs,
    historial y referrers.)
    """
    def _session_response(session: dict, method: str) -> JSONResponse:
        return JSONResponse({
            "authenticated": True,
            "user_id":    session.get("user_id"),
            "user_name":  session.get("user_name"),
            "user_email": session.get("user_email"),
            "role":       session.get("role"),
            "all_roles":  session.get("all_roles") or [],
            "iat":        session.get("iat"),
            "auth_method": method,
        })

    # 1. Header Authorization: Bearer <session_id>
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        sid_from_header = auth_header[7:].strip()
        if sid_from_header:
            session = get_session(sid_from_header)
            if session:
                return _session_response(session, "bearer")

    # 3. Cookie OAuth session
    sid = _get_session_id(request)
    if sid:
        session = get_session(sid)
        if session:
            return JSONResponse({
                "authenticated": True,
                "user_id":    session.get("user_id"),
                "user_name":  session.get("user_name"),
                "user_email": session.get("user_email"),
                "role":       session.get("role"),
                "all_roles":  session.get("all_roles") or [],
                "iat":        session.get("iat"),
                "auth_method": "oauth",
            })

    # 3. LTI session fallback (no tiene access_token, pero confirma identidad)
    from app.api import lti as _lti
    lti_cookie = request.cookies.get("gemelo_lti_session")
    if lti_cookie:
        lti_sess = _lti._parse_session_cookie(lti_cookie)
        if lti_sess:
            return JSONResponse({
                "authenticated": False,   # sin token → debe hacer OAuth
                "lti_detected": True,
                "user_name":  lti_sess.get("name"),
                "user_email": lti_sess.get("email"),
                "org_unit_id": lti_sess.get("orgUnitId"),
                "auth_method": "lti_pending_oauth",
            })

    return JSONResponse({"authenticated": False})


@router.post("/auth/logout")
async def auth_logout(request: Request):
    """Cierra la sesión del usuario y limpia la cookie."""
    sid = _get_session_id(request)
    if sid:
        delete_session(sid)
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response

