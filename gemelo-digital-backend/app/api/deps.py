"""Config compartida y helpers de sesion/proxy Brightspace (extraidos de main.py)."""
from __future__ import annotations

import copy
import hashlib
import json
import os
import time

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

    NOTA seguridad: ya NO se acepta ?sid= en query string — un token en la URL
    queda expuesto en historial del navegador, logs y headers Referer. Las
    descargas del frontend usan fetch + Authorization (apiDownload en api.js).
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


# ──────────────────────────────────────────────────────────────────────────────
# Caché TTL corta para GETs repetidos a Brightspace (#11)
#
# Cada refresh del dashboard repetía llamadas idénticas (whoami, enrollments,
# orgstructure/semestres). Estos datos cambian muy poco → una caché en memoria
# de 5 minutos elimina la mayoría de round-trips a Brightspace.
#
# - La clave incluye un hash del token: cada usuario tiene su propia entrada
#   (nunca se filtra la respuesta de un usuario a otro).
# - Solo se cachean respuestas 200. Los errores siempre se re-consultan.
# - Se devuelve una copia profunda para que los handlers puedan mutar el
#   resultado sin corromper la entrada cacheada.
# - Uso EXPLÍCITO (opt-in): solo los endpoints estables llaman _bs_get_cached;
#   notas, entregas y datos "vivos" siguen usando _bs_get directo.
# ──────────────────────────────────────────────────────────────────────────────
_BS_CACHE: dict[str, tuple[float, int, object]] = {}
_BS_CACHE_MAX = 1000
BS_CACHE_TTL_S = 300.0  # 5 minutos


def _bs_cache_key(url: str, headers: dict, params: dict | None) -> str:
    tok = str(headers.get("Authorization", ""))
    tok_hash = hashlib.sha256(tok.encode("utf-8")).hexdigest()[:16]
    return f"{tok_hash}|{url}|{json.dumps(params or {}, sort_keys=True, default=str)}"


async def _bs_get_cached(
    url: str,
    headers: dict,
    params: dict | None = None,
    ttl: float = BS_CACHE_TTL_S,
    timeout: int = 30,
) -> tuple[int, dict | list]:
    key = _bs_cache_key(url, headers, params)
    now = time.monotonic()
    hit = _BS_CACHE.get(key)
    if hit and (now - hit[0]) < ttl:
        return hit[1], copy.deepcopy(hit[2])

    status, body = await _bs_get(url, headers, params, timeout)
    if status == 200:
        if len(_BS_CACHE) >= _BS_CACHE_MAX:
            # Purga de expirados; si sigue llena (tráfico inusual), se vacía.
            expired = [k for k, v in _BS_CACHE.items() if (now - v[0]) >= ttl]
            for k in expired:
                _BS_CACHE.pop(k, None)
            if len(_BS_CACHE) >= _BS_CACHE_MAX:
                _BS_CACHE.clear()
        _BS_CACHE[key] = (now, status, copy.deepcopy(body))
    return status, body


async def _get_whoami_id(headers: dict) -> tuple[str | None, JSONResponse | None]:
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/whoami"
    # whoami es estable durante la vida del token → cacheable 5 min
    status, data = await _bs_get_cached(url, headers)
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

