"""Config compartida y helpers de sesion/proxy Brightspace (extraidos de main.py)."""
from __future__ import annotations

import os

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.state import get_session, get_access_token

# ──────────────────────────────────────────────────────────────────────────────
# Configuración Brightspace OAuth
# ──────────────────────────────────────────────────────────────────────────────
BRIGHTSPACE_BASE_URL  = (os.getenv("BRIGHTSPACE_BASE_URL",  "") or "").rstrip("/")
LP_VERSION            = os.getenv("BRIGHTSPACE_LP_VERSION", "1.50")
LE_VERSION            = os.getenv("BRIGHTSPACE_LE_VERSION",  "1.92")

BRIGHTSPACE_AUTH_URL  = os.getenv("BRIGHTSPACE_AUTH_URL",  "https://auth.brightspace.com/oauth2/auth")
BRIGHTSPACE_TOKEN_URL = os.getenv("BRIGHTSPACE_TOKEN_URL", "https://auth.brightspace.com/core/connect/token")

CLIENT_ID     = os.getenv("BRIGHTSPACE_CLIENT_ID",     "")
CLIENT_SECRET = os.getenv("BRIGHTSPACE_CLIENT_SECRET", "")
REDIRECT_URI  = os.getenv("BRIGHTSPACE_REDIRECT_URI",  "")
SCOPE         = os.getenv("BRIGHTSPACE_SCOPE",         "core:*:* Application:*:* Data:*:* enrollment:own_enrollment:read enrollment:orgunit:read users:own_profile:read users:profile:read grades:gradeobjects:read grades:gradevalues:read grades:own_grades:read grades:gradeschemes:read grades:gradesettings:read grades:gradestatistics:read grades:gradecategories:read outcomes:sets:read outcomes:sets:export outcomes:sets:import outcomes:sets:manage outcomes:alignments:read outcomes:alignments:manage content:modules:readonly content:topics:readonly content:toc:read content:completions:read rubrics:objects:read rubrics:assessments:read dropbox:folders:read discussions:forums:readonly discussions:topics:readonly quizzing:quizzes:read quizzing:attempts:read organizations:organization:read orgunits:course:read role:detail:read")
FRONTEND_BASE = os.getenv("FRONTEND_BASE_URL",         "").rstrip("/")

# Cookie config
SESSION_COOKIE   = "gemelo_session_id"
SESSION_MAX_AGE  = 60 * 60 * 8     # 8 horas
_tool_is_https   = lambda: (os.getenv("TOOL_BASE_URL", "") or "").lower().startswith("https://")


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────
def _get_session_id(request: Request) -> str | None:
    return request.cookies.get(SESSION_COOKIE)


def _require_session(request: Request):
    """
    Dependency FastAPI: extrae y valida la sesión del usuario.
    Lanza 401 si no está autenticado.
    """
    sid = _get_session_id(request)
    if not sid:
        raise HTTPException(
            status_code=401,
            detail="No autenticado. Inicia sesión en /auth/brightspace/login",
        )
    session = get_session(sid)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Sesión expirada o inválida. Vuelve a iniciar sesión.",
        )
    return session


def _require_token_from_request(request: Request) -> tuple[str, JSONResponse | None]:
    """
    Versión legacy-compatible: devuelve (token, None) o (None, JSONResponse 401).
    Acepta sesión via:
    1. Authorization: Bearer <session_id> header
    2. Cookie gemelo_session_id
    3. Query param ?sid= (útil para <img> / <a download> que no pueden setear headers)
    """
    # 1. Header Authorization: Bearer <session_id>
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        sid_from_header = auth_header[7:].strip()
        if sid_from_header:
            token = get_access_token(sid_from_header)
            if token:
                return token, None

    # 2. Cookie
    sid = _get_session_id(request)
    if sid:
        token = get_access_token(sid)
        if token:
            return token, None

    # 3. Query param (for <img> src, downloads, etc.)
    sid_query = request.query_params.get("sid")
    if sid_query:
        token = get_access_token(sid_query.strip())
        if token:
            return token, None

    return None, JSONResponse(
        status_code=401,
        content={
            "error": (
                "No autenticado. "
                "Inicia sesión en /auth/brightspace/login "
                "o accede desde Brightspace mediante LTI."
            )
        },
    )


def _auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


async def _bs_get(
    url: str,
    headers: dict,
    params: dict | None = None,
    timeout: int = 30,
) -> tuple[int, dict | list]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(url, headers=headers, params=params or {})
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:500]}
    return r.status_code, body


async def _get_whoami_id(headers: dict) -> tuple[str | None, JSONResponse | None]:
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/whoami"
    status, data = await _bs_get(url, headers)
    if status != 200:
        return None, JSONResponse(
            status_code=502,
            content={"error": "whoami falló", "status": status, "detail": data},
        )
    uid = data.get("Identifier") or data.get("UserId") or data.get("userId")
    if not uid:
        return None, JSONResponse(
            status_code=502,
            content={"error": "whoami no devolvió Identifier", "data": data},
        )
    return str(uid), None

