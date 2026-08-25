# app/api/lti.py
# LTI 1.3 (OIDC login initiation + launch) — MVP serio para Brightspace

import logging
import os
import time
import json
import base64
import hmac
import hashlib
import secrets
import urllib.parse
from typing import Any, Dict, Optional, List

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse
from jose import jwt
from jose.exceptions import JWTError

router = APIRouter(prefix="/lti", tags=["LTI"])
logger = logging.getLogger("uvicorn.error")

# =========================
# ENV / Config
# =========================
TOOL_BASE_URL = os.getenv("TOOL_BASE_URL", "").rstrip("/")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", TOOL_BASE_URL).rstrip("/")

LTI_ISSUER = os.getenv("LTI_ISSUER", "https://cesa.brightspace.com").rstrip("/")
LTI_AUTH_ENDPOINT = os.getenv("LTI_AUTH_ENDPOINT", "https://cesa.brightspace.com/d2l/lti/authenticate")
LTI_JWKS_URL = os.getenv("LTI_JWKS_URL", "https://cesa.brightspace.com/d2l/.well-known/jwks")
LTI_CLIENT_ID = os.getenv("LTI_CLIENT_ID", "")
LTI_DEPLOYMENT_ID = os.getenv("LTI_DEPLOYMENT_ID", "").strip()  # opcional

from app.security import LTI_STATE_SECRET, SESSION_SECRET

STATE_STORE: Dict[str, Dict[str, Any]] = {}
JWKS_CACHE: Dict[str, Any] = {"ts": 0, "jwks": None}
JWKS_TTL_SECONDS = 3600

STATE_TTL_SECONDS = 300
COOKIE_MAX_AGE = 60 * 60 * 8


# =========================
# Helpers
# =========================
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

def _b64url_decode(s: str) -> bytes:
    pad = "=" * ((4 - (len(s) % 4)) % 4)
    return base64.urlsafe_b64decode(s + pad)

def _sign(data: str, secret: str) -> str:
    sig = hmac.new(secret.encode("utf-8"), data.encode("utf-8"), hashlib.sha256).digest()
    return _b64url(sig)

def _make_signed_blob(payload: Dict[str, Any], secret: str) -> str:
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    token = _b64url(raw.encode("utf-8"))
    sig = _sign(token, secret)
    return f"{token}.{sig}"

def _read_signed_blob(blob: str, secret: str) -> Optional[Dict[str, Any]]:
    try:
        token, sig = blob.split(".", 1)
        if not hmac.compare_digest(sig, _sign(token, secret)):
            return None
        raw = _b64url_decode(token).decode("utf-8")
        return json.loads(raw)
    except Exception:
        return None

def _make_state(payload: Dict[str, Any]) -> str:
    return _make_signed_blob(payload, LTI_STATE_SECRET)

def _read_state(state: str) -> Optional[Dict[str, Any]]:
    return _read_signed_blob(state, LTI_STATE_SECRET)

def _make_session_cookie(payload: Dict[str, Any]) -> str:
    return _make_signed_blob(payload, SESSION_SECRET)

def _parse_session_cookie(cookie_val: str) -> Optional[Dict[str, Any]]:
    return _read_signed_blob(cookie_val, SESSION_SECRET)

def _cleanup_state_store(now: int) -> None:
    dead = [k for k, v in STATE_STORE.items() if now - int(v.get("ts", 0)) > STATE_TTL_SECONDS]
    for k in dead:
        STATE_STORE.pop(k, None)

def _tool_is_https() -> bool:
    return TOOL_BASE_URL.lower().startswith("https://")

async def _get_platform_jwks(force: bool = False) -> Dict[str, Any]:
    now = int(time.time())
    if (not force) and JWKS_CACHE["jwks"] is not None and (now - JWKS_CACHE["ts"]) < JWKS_TTL_SECONDS:
        return JWKS_CACHE["jwks"]

    if not LTI_JWKS_URL:
        raise RuntimeError("Falta LTI_JWKS_URL (JWKS de Brightspace)")

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(LTI_JWKS_URL)
        r.raise_for_status()
        jwks = r.json()

    JWKS_CACHE["ts"] = now
    JWKS_CACHE["jwks"] = jwks
    return jwks

def _pick_key_from_jwks(jwks: Dict[str, Any], kid: str) -> Dict[str, Any]:
    for k in (jwks.get("keys") or []):
        if k.get("kid") == kid:
            return k
    raise RuntimeError(f"No se encontró kid={kid} en JWKS plataforma")

def _is_instructor(roles: List[str]) -> bool:
    r = " ".join([str(x).lower() for x in roles])
    return ("instructor" in r) or ("teachingassistant" in r) or ("faculty" in r)

def _extract_context(claims: Dict[str, Any]) -> Dict[str, Any]:
    ctx = claims.get("https://purl.imsglobal.org/spec/lti/claim/context") or {}
    roles = claims.get("https://purl.imsglobal.org/spec/lti/claim/roles") or []
    return {
        "orgUnitId": ctx.get("id"),
        "contextTitle": ctx.get("title"),
        "roles": roles,
        "isInstructor": _is_instructor(roles),
        "userSub": claims.get("sub"),
        "name": claims.get("name") or "",
        "email": claims.get("email") or "",
    }

async def _collect_params(request: Request) -> Dict[str, str]:
    """
    Unifica query + body x-www-form-urlencoded sin depender de request.form()
    (Safari/iframe a veces devuelve form vacío).
    """
    params: Dict[str, str] = {}

    for k, v in request.query_params.multi_items():
        if v is not None:
            params[k] = str(v)

    ct = (request.headers.get("content-type") or "").lower()
    try:
        body = await request.body()
    except Exception:
        body = b""

    if body and "application/x-www-form-urlencoded" in ct:
        parsed = urllib.parse.parse_qs(body.decode("utf-8"), keep_blank_values=True)
        for k, vs in parsed.items():
            if vs:
                params[k] = str(vs[0])

    cleaned: Dict[str, str] = {}
    for k, v in params.items():
        vv = (v or "").strip()
        if vv != "":
            cleaned[k] = vv
    return cleaned


# =========================
# Endpoints
# =========================

@router.api_route("/login", methods=["GET", "POST"])
async def lti_login(request: Request):
    if not TOOL_BASE_URL:
        return JSONResponse({"detail": "Falta TOOL_BASE_URL (https público)"}, status_code=500)
    if not LTI_CLIENT_ID:
        return JSONResponse({"detail": "Falta LTI_CLIENT_ID"}, status_code=500)

    p = await _collect_params(request)
    now = int(time.time())
    _cleanup_state_store(now)

    iss = (p.get("iss") or "").rstrip("/")
    login_hint = p.get("login_hint")
    target_link_uri = p.get("target_link_uri") or f"{TOOL_BASE_URL}/lti/launch"
    lti_message_hint = p.get("lti_message_hint")
    lti_storage_target = p.get("lti_storage_target")  # _parent, etc.
    client_id = p.get("client_id") or LTI_CLIENT_ID

    if iss and iss != LTI_ISSUER:
        return JSONResponse({"detail": f"issuer inválido: {iss}", "received": p}, status_code=400)

    if not login_hint:
        return JSONResponse(
            {
                "detail": "missing login_hint",
                "received_keys": sorted(list(p.keys())),
                "action": "Brightspace debe llamar /lti/login con login_hint (OIDC). Si estás entrando directo o el enlace no está como Tool Provider correcto, no vendrá.",
            },
            status_code=400,
        )

    nonce = secrets.token_urlsafe(24)
    state_payload = {
        "nonce": nonce,
        "ts": now,
        "target_link_uri": target_link_uri,
        "client_id": client_id,
        "iss": LTI_ISSUER,
        "lti_storage_target": lti_storage_target,
    }
    state = _make_state(state_payload)
    STATE_STORE[state] = {"nonce": nonce, "ts": now}

    redirect_uri = f"{TOOL_BASE_URL}/lti/launch"

    params = {
        "scope": "openid",
        "response_type": "id_token",
        "response_mode": "form_post",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "login_hint": login_hint,
        "state": state,
        "nonce": nonce,
        "prompt": "none",
        "target_link_uri": target_link_uri,
    }

    if lti_message_hint:
        params["lti_message_hint"] = lti_message_hint
    if lti_storage_target:
        params["lti_storage_target"] = lti_storage_target

    url = f"{LTI_AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=url, status_code=302)


@router.post("/launch")
async def lti_launch(request: Request):
    if not TOOL_BASE_URL:
        return JSONResponse({"detail": "Falta TOOL_BASE_URL"}, status_code=500)
    if not LTI_CLIENT_ID:
        return JSONResponse({"detail": "Falta LTI_CLIENT_ID"}, status_code=500)

    p = await _collect_params(request)
    id_token = p.get("id_token")
    state = p.get("state")

    if not id_token:
        return JSONResponse({"detail": "missing id_token", "received_keys": sorted(list(p.keys()))}, status_code=400)
    if not state:
        return JSONResponse({"detail": "missing state", "received_keys": sorted(list(p.keys()))}, status_code=400)

    state_payload = _read_state(state)
    if not state_payload:
        return JSONResponse({"detail": "invalid state signature"}, status_code=400)

    now = int(time.time())
    if now - int(state_payload.get("ts", 0)) > STATE_TTL_SECONDS:
        return JSONResponse({"detail": "state expired"}, status_code=400)

    try:
        header = jwt.get_unverified_header(id_token)
        kid = header.get("kid")
        alg = header.get("alg") or "RS256"
    except Exception:
        return JSONResponse({"detail": "invalid jwt header"}, status_code=400)
    if not kid:
        return JSONResponse({"detail": "missing kid in jwt header"}, status_code=400)
    try:
        unverified = jwt.get_unverified_claims(id_token)
        # Solo a nivel debug: los metadatos del JWT no deben ir a los logs
        # normales de producción.
        logger.debug("LTI header kid/alg: %s %s", kid, alg)
        logger.debug("LTI claims iss/aud: %s %s", unverified.get("iss"), unverified.get("aud"))
    except Exception as e:
        logger.debug("Error leyendo claims sin verificar: %s", str(e))
    try:
        jwks = await _get_platform_jwks(force=False)
        keys = jwks.get("keys") or []
        if not any(k.get("kid") == kid for k in keys):
            # fuerza refresh por rotación de llaves
            jwks = await _get_platform_jwks(force=True)
        key = _pick_key_from_jwks(jwks, kid)
        claims = jwt.decode(
            id_token,
            key,
            algorithms=[alg],
            audience=state_payload.get("client_id") or LTI_CLIENT_ID,
            issuer=LTI_ISSUER,
            options={
                "verify_at_hash": False,
                "leeway": 120,          # tolerancia 2 minutos
            },
        )
    except JWTError as e:
        return JSONResponse({"detail": "jwt validation failed", "error": str(e)}, status_code=401)
    except Exception as e:
        return JSONResponse({"detail": "launch failed", "error": str(e)}, status_code=500)

    if claims.get("nonce") != state_payload.get("nonce"):
        return JSONResponse({"detail": "nonce mismatch"}, status_code=401)

    if LTI_DEPLOYMENT_ID:
        dep = claims.get("https://purl.imsglobal.org/spec/lti/claim/deployment_id")
        if dep and dep != LTI_DEPLOYMENT_ID:
            return JSONResponse({"detail": "deployment_id mismatch", "got": dep}, status_code=401)

    ctx = _extract_context(claims)

    session = {
        "orgUnitId": ctx.get("orgUnitId"),
        "contextTitle": ctx.get("contextTitle"),
        "roles": ctx.get("roles"),
        "isInstructor": ctx.get("isInstructor"),
        "userSub": ctx.get("userSub"),
        "name": ctx.get("name"),
        "email": ctx.get("email"),
        "iat": now,
        "iss": LTI_ISSUER,
        "aud": state_payload.get("client_id") or LTI_CLIENT_ID,
    }

    cookie_val = _make_session_cookie(session)

    org = session.get("orgUnitId") or ""

    # Redirigir al flujo OAuth con el orgUnitId del curso como parámetro de estado.
    # OAuth obtendrá el access_token y redirigirá al frontend con ?orgUnitId={org}.
    # Esto garantiza que el docente llegue directamente al curso correcto sin
    # tener que seleccionarlo manualmente.
    oauth_url = f"{TOOL_BASE_URL}/auth/brightspace/login"
    if org:
        oauth_url += f"?org_unit_id={org}"

    resp = RedirectResponse(url=oauth_url, status_code=302)

    # Guardamos la sesión LTI como referencia adicional (rol, nombre del contexto, etc.)
    # aunque el token real de API viene del flujo OAuth.
    resp.set_cookie(
        key="gemelo_lti_session",
        value=cookie_val,
        httponly=True,
        secure=_tool_is_https(),
        samesite="none",
        max_age=COOKIE_MAX_AGE,
        path="/",
    )
    return resp


@router.get("/session")
async def lti_session(request: Request):
    cookie_val = request.cookies.get("gemelo_session")
    if not cookie_val:
        return JSONResponse({"authenticated": False}, status_code=200)

    sess = _parse_session_cookie(cookie_val)
    if not sess:
        return JSONResponse({"authenticated": False}, status_code=200)

    return JSONResponse({"authenticated": True, "session": sess}, status_code=200)