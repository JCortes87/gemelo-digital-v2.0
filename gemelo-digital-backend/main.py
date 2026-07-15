from __future__ import annotations
import os
import json
import base64
import hmac
import hashlib
import secrets
import urllib.parse
import asyncio
from datetime import datetime, timezone
from typing import Optional

import httpx
import logging

from fastapi import FastAPI, Request, Query, Depends, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.state import (
    TOKENS,               # dict vacío — solo para imports legacy
    save_session,
    get_session,
    delete_session,
    get_access_token,
)
from app.api.gemelo import router as gemelo_router
from app.api.lti_keys import get_jwks
from app.api import lti
from app.api import admin as admin_api
from app.security import SESSION_SECRET, require_debug_enabled
from app.rate_limit import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# ── Capa Postgres (Fase 3: integración manual, scheduler OFF) ─────────────────
from sqlalchemy import text
from app.db.session import engine
from app.services.brightspace_client import BrightspaceClient, get_brightspace_client
from app.services.sync_service import SyncService
from app.services.gemelo_db_service import build_course_overview_from_db

logger = logging.getLogger("uvicorn.error")

# ──────────────────────────────────────────────────────────────────────────────
# App
# ──────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Gemelo Digital - Backend")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.on_event("startup")
async def _startup_usage_tables():
    """Crea (si no existen) las tablas de tracking de uso: known_users y
    login_events. Idempotente y best-effort — un fallo aquí no tumba la app."""
    try:
        from app.services.usage_tracking import ensure_tables
        await asyncio.to_thread(ensure_tables)
    except Exception as e:
        logger.warning("startup usage tables falló: %s", str(e)[:200])

app.include_router(lti.router)
app.include_router(gemelo_router)
app.include_router(admin_api.router)

# ──────────────────────────────────────────────────────────────────────────────
# CORS
# ──────────────────────────────────────────────────────────────────────────────
ALLOWED_ORIGIN_REGEX = (
    r"^https:\/\/(.*\.)?cesa\.edu\.co$"
    r"|^http:\/\/localhost(:\d+)?$"
    r"|^http:\/\/127\.0\.0\.1(:\d+)?$"
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Añade headers de seguridad y permite que Brightspace embeba la herramienta en iframe.
    """
    async def dispatch(self, request: StarletteRequest, call_next):
        response: StarletteResponse = await call_next(request)
        # Permitir embedding desde Brightspace CESA
        response.headers["Content-Security-Policy"] = (
            "frame-ancestors 'self' https://cesa.brightspace.com https://*.brightspace.com"
        )
        # Quitar X-Frame-Options si lo pone uvicorn/starlette por defecto
        try:
            del response.headers["X-Frame-Options"]
        except KeyError:
            pass
        # Evita filtrar URLs con ?sid= (descargas/avatares) vía header Referer
        response.headers["Referrer-Policy"] = "same-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)


# ──────────────────────────────────────────────────────────────────────────────
# Config OAuth/Brightspace compartida y routers extraidos (app/api/)
# ──────────────────────────────────────────────────────────────────────────────
from app.api.deps import (  # noqa: E402
    BRIGHTSPACE_BASE_URL, LP_VERSION, LE_VERSION,
    CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, _get_session_id,
)
from app.api.auth_routes import router as auth_router  # noqa: E402
from app.api.brightspace_proxy import router as brightspace_proxy_router  # noqa: E402

app.include_router(auth_router)
app.include_router(brightspace_proxy_router)

# ──────────────────────────────────────────────────────────────────────────────
# Static frontend
# ──────────────────────────────────────────────────────────────────────────────
FRONTEND_DIST = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend_dist")
)
if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


# ──────────────────────────────────────────────────────────────────────────────
# Health / Debug
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    # Liveness superficial (lo usa el load balancer). Chequeos profundos en /health/deep
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


@app.get("/health/deep")
async def health_deep():
    """
    Readiness profundo: valida conectividad a Postgres y Brightspace.
    No usar como health check del ALB (una caída de Brightspace tumbaría el servicio).
    """
    import time as _t

    checks: dict[str, dict] = {}

    def _db_ping():
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

    t0 = _t.monotonic()
    try:
        await asyncio.wait_for(asyncio.to_thread(_db_ping), timeout=5.0)
        checks["postgres"] = {"ok": True, "ms": round((_t.monotonic() - t0) * 1000)}
    except Exception as e:
        checks["postgres"] = {"ok": False, "ms": round((_t.monotonic() - t0) * 1000), "error": str(e)[:200]}

    t0 = _t.monotonic()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{BRIGHTSPACE_BASE_URL}/d2l/api/versions/")
        checks["brightspace"] = {
            "ok": r.status_code < 500,
            "status": r.status_code,
            "ms": round((_t.monotonic() - t0) * 1000),
        }
    except Exception as e:
        checks["brightspace"] = {"ok": False, "ms": round((_t.monotonic() - t0) * 1000), "error": str(e)[:200]}

    all_ok = all(c.get("ok") for c in checks.values())
    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={
            "status": "ok" if all_ok else "degraded",
            "checks": checks,
            "ts": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.get("/debug/runtime", dependencies=[Depends(require_debug_enabled)])
def debug_runtime():
    from app.state import SESSION_STORE
    return {
        "brightspace_base_url": BRIGHTSPACE_BASE_URL,
        "lp_version":  LP_VERSION,
        "le_version":  LE_VERSION,
        "active_sessions": len(SESSION_STORE),
        "has_client_id": bool(CLIENT_ID),
        "has_client_secret": bool(CLIENT_SECRET),
        "redirect_uri": REDIRECT_URI,
    }


@app.get("/debug/tokens", dependencies=[Depends(require_debug_enabled)])
def debug_tokens(request: Request):
    """Solo para debugging — nunca exponer en producción info sensible."""
    sid = _get_session_id(request)
    from app.state import get_session as _gs
    s = _gs(sid) if sid else None
    return {
        "has_session_cookie": bool(sid),
        "session_valid": bool(s),
        "user_id":   s.get("user_id")    if s else None,
        "user_name": s.get("user_name")  if s else None,
        "scope":     s.get("scope")      if s else None,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Postgres: conectividad, sync manual, read-path DB (Fase 3 — scheduler OFF)
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/debug/db", dependencies=[Depends(require_debug_enabled)])
def debug_db():
    """Ping de conectividad a Postgres."""
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1")).scalar()
    return {"db_ok": result == 1}


@app.post("/debug/sync/classlist/{orgUnitId}", dependencies=[Depends(require_debug_enabled)])
async def debug_sync_classlist(
    orgUnitId: int,
    bs: BrightspaceClient = Depends(get_brightspace_client),
):
    """Sync manual de classlist (estudiantes + enrollments). Requiere sesión activa."""
    svc = SyncService(bs)
    return await svc.sync_classlist(orgUnitId)


@app.post("/debug/sync/master/{orgUnitId}", dependencies=[Depends(require_debug_enabled)])
async def debug_sync_master(
    orgUnitId: int,
    bs: BrightspaceClient = Depends(get_brightspace_client),
):
    """Sync completo del curso. Requiere sesión activa."""
    svc = SyncService(bs)
    return await svc.sync_master(orgUnitId)


@app.post("/debug/sync/student-metrics/{orgUnitId}", dependencies=[Depends(require_debug_enabled)])
async def debug_sync_student_metrics(
    orgUnitId: int,
    bs: BrightspaceClient = Depends(get_brightspace_client),
):
    """Calcula y persiste snapshots de métricas por estudiante. Requiere sesión activa."""
    svc = SyncService(bs)
    return await svc.sync_student_metric_snapshots(orgUnitId)


@app.get("/debug/course/{orgUnitId}/overview-db", dependencies=[Depends(require_debug_enabled)])
async def debug_overview_db(orgUnitId: int):
    """Overview del curso leído directamente de Postgres (L2 read-path DB-first)."""
    return await build_course_overview_from_db(orgUnitId)


# ──────────────────────────────────────────────────────────────────────────────
# JWKS (LTI)
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/.well-known/jwks.json")
def well_known_jwks():
    return get_jwks()


# ──────────────────────────────────────────────────────────────────────────────
# Error handler
# ──────────────────────────────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )

# ──────────────────────────────────────────────────────────────────────────────
# ElevenLabs Speech Endpoints
# ──────────────────────────────────────────────────────────────────────────────
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_BASE    = "https://api.elevenlabs.io/v1"

# Voz neural en español latinoamericano — Valentina (multilingual)
# Se puede sobreescribir con variable de entorno ELEVENLABS_VOICE_ID
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "pFZP5JQG7iQjIQuC4Bku")
ELEVENLABS_MODEL    = os.getenv("ELEVENLABS_MODEL",    "eleven_multilingual_v2")


@app.post("/speech/tts")
async def speech_tts(request: Request):
    """
    Convierte texto a audio usando ElevenLabs TTS.
    Body: { "text": "...", "voice_id": "..." (opcional) }
    Retorna: audio/mpeg (MP3)
    """
    if not ELEVENLABS_API_KEY:
        return JSONResponse(status_code=503, content={"error": "ElevenLabs no configurado"})

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Body inválido"})

    text     = (body.get("text") or "").strip()
    voice_id = body.get("voice_id") or ELEVENLABS_VOICE_ID

    if not text:
        return JSONResponse(status_code=400, content={"error": "Falta el texto"})

    # Límite de caracteres por petición
    text = text[:3000]

    payload = {
        "text":             text,
        "model_id":         ELEVENLABS_MODEL,
        "voice_settings":   {
            "stability":        0.50,
            "similarity_boost": 0.80,
            "style":            0.20,
            "use_speaker_boost": True,
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{ELEVENLABS_BASE}/text-to-speech/{voice_id}",
            headers={
                "xi-api-key":   ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
                "Accept":       "audio/mpeg",
            },
            json=payload,
        )

    if r.status_code != 200:
        return JSONResponse(
            status_code=r.status_code,
            content={"error": "ElevenLabs TTS error", "detail": r.text[:300]},
        )

    from fastapi.responses import Response as FastResponse
    return FastResponse(
        content=r.content,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/speech/stt")
async def speech_stt(request: Request):
    """
    Convierte audio a texto usando ElevenLabs STT.
    Body: multipart/form-data con campo "audio" (WebM/WAV/MP3)
    Retorna: { "text": "..." }
    """
    if not ELEVENLABS_API_KEY:
        return JSONResponse(status_code=503, content={"error": "ElevenLabs no configurado"})

    from fastapi import UploadFile, Form
    try:
        form   = await request.form()
        audio  = form.get("audio")
        if audio is None:
            return JSONResponse(status_code=400, content={"error": "Falta el campo audio"})
        audio_bytes = await audio.read()
        filename    = getattr(audio, "filename", "audio.webm") or "audio.webm"
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": f"Error leyendo audio: {e}"})

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{ELEVENLABS_BASE}/speech-to-text",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
            files={"file": (filename, audio_bytes, "audio/webm")},
            data={"model_id": "scribe_v1", "language_code": "es"},
        )

    if r.status_code != 200:
        return JSONResponse(
            status_code=r.status_code,
            content={"error": "ElevenLabs STT error", "detail": r.text[:300]},
        )

    result = r.json()
    text   = result.get("text") or result.get("transcript") or ""
    return JSONResponse({"text": text.strip()})


@app.get("/speech/voices")
async def speech_voices():
    """Lista las voces disponibles en ElevenLabs (para selección futura)."""
    if not ELEVENLABS_API_KEY:
        return JSONResponse(status_code=503, content={"error": "ElevenLabs no configurado"})

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{ELEVENLABS_BASE}/voices",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
        )

    if r.status_code != 200:
        return JSONResponse(status_code=r.status_code, content={"error": r.text[:200]})

    voices = r.json().get("voices") or []
    return {"voices": [{"id": v["voice_id"], "name": v["name"]} for v in voices]}

# ──────────────────────────────────────────────────────────────────────────────
# SPA fallback
# ──────────────────────────────────────────────────────────────────────────────
if os.path.isdir(FRONTEND_DIST):
    @app.get("/")
    def serve_index():
        index = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(index) if os.path.exists(index) else JSONResponse({"status": "no index.html"})

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        index = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(index) if os.path.exists(index) else JSONResponse({"status": "no index.html"})