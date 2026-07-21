# app/api/gemelo_admin.py
"""Sub-router de administracion: bug reports, anuncios, usage, audiencia.
Extraido de gemelo.py (refactor #15). Sin prefix: se monta bajo /gemelo.

NOTA: tests/test_roles.py monkeypatchea _session_from_request y
_SUPERADMIN_IDS de ESTE modulo.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from app.rate_limit import limiter
from app.api.gemelo_shared import logger

router = APIRouter()

import os as _os
import json as _json
import time as _time_mod
from datetime import datetime, timezone
from pydantic import BaseModel

from app.state import get_session as _get_session
from app.services.brightspace_client import _extract_session_id_any
from app.services.email_service import send_email, smtp_configured
from app.services.user_registry import (
    list_emails as _list_emails,
    list_users as _list_users,
    record_user as _record_user,
)

# Correo del administrador que recibe los reportes de error.
BUG_REPORT_EMAIL = _os.getenv("BUG_REPORT_EMAIL", "desarrolloprofesoral@cesa.edu.co")
# IDs de super-administrador autorizados (mismo default que el frontend: 5427).
_SUPERADMIN_IDS = {
    s.strip() for s in _os.getenv("SUPERADMIN_IDS", "5427").split(",") if s.strip()
}

_DATA_DIR = _os.getenv("GEMELO_DATA_DIR") or _os.path.dirname(
    _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
)
_BUG_REPORTS_FILE = _os.path.join(_DATA_DIR, "bug_reports.jsonl")
_ANNOUNCEMENTS_FILE = _os.path.join(_DATA_DIR, "announcements.json")


def _session_from_request(request: Request) -> Dict[str, Any]:
    """Devuelve la sesión (dict) del request, o {} si no hay/expiró."""
    try:
        sid = _extract_session_id_any(request)
        if not sid:
            return {}
        return _get_session(sid) or {}
    except Exception:
        return {}


def _append_jsonl(path: str, record: Dict[str, Any]) -> None:
    """Agrega una línea JSON al archivo (best-effort, silencia errores)."""
    try:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(_json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as e:
        logger.warning("no se pudo persistir en %s: %s", path, str(e)[:120])


class BugReportIn(BaseModel):
    title: Optional[str] = ""
    description: str
    severity: Optional[str] = "media"
    context: Optional[Dict[str, Any]] = None  # url, navegador, pantalla, etc.


@router.post("/bug-report")
@limiter.limit("5/minute")
async def submit_bug_report(payload: BugReportIn, request: Request):
    """
    Recibe un reporte de error del usuario, lo persiste y lo envía por
    correo al administrador. Si SMTP no está configurado, igual persiste y
    devuelve delivered=false para que el frontend caiga a un mailto.
    """
    desc = (payload.description or "").strip()
    if not desc:
        raise HTTPException(status_code=422, detail="La descripción es obligatoria.")

    sess = _session_from_request(request)
    reporter = {
        "user_id": sess.get("user_id"),
        "user_name": sess.get("user_name"),
        "user_email": sess.get("user_email"),
    }
    ctx = payload.context or {}
    now_iso = datetime.now(timezone.utc).isoformat()
    severity = (payload.severity or "media").strip().lower()
    title = (payload.title or "").strip() or "Reporte de error"

    # Persistir en Postgres (sobrevive redeploys); fallback a JSONL si BD falla
    import asyncio as _asyncio
    from app.services import content_store as _content_store
    saved_db = False
    try:
        saved_db = await _asyncio.to_thread(
            _content_store.save_bug_report,
            title, severity, desc,
            reporter.get("user_id"), reporter.get("user_name"), reporter.get("user_email"),
            ctx,
        )
    except Exception:
        saved_db = False
    if not saved_db:
        record = {
            "ts": now_iso,
            "title": title,
            "severity": severity,
            "description": desc,
            "reporter": reporter,
            "context": ctx,
        }
        _append_jsonl(_BUG_REPORTS_FILE, record)

    # Cuerpo del correo
    ctx_lines = "\n".join(f"  {k}: {v}" for k, v in ctx.items()) or "  (sin contexto)"
    body_text = (
        f"Nuevo reporte de error en G.D\n\n"
        f"Título: {title}\n"
        f"Severidad: {severity.upper()}\n"
        f"Fecha: {now_iso}\n\n"
        f"Reportado por:\n"
        f"  Nombre: {reporter.get('user_name') or '(desconocido)'}\n"
        f"  ID: {reporter.get('user_id') or '(desconocido)'}\n"
        f"  Email: {reporter.get('user_email') or '(desconocido)'}\n\n"
        f"Descripción:\n{desc}\n\n"
        f"Contexto técnico:\n{ctx_lines}\n"
    )

    delivered = False
    error = None
    if smtp_configured():
        res = send_email(
            to=[BUG_REPORT_EMAIL],
            subject=f"[G.D Bug] {title}",
            body_text=body_text,
            reply_to=reporter.get("user_email") or None,
        )
        delivered = bool(res.get("ok"))
        error = res.get("error")
    else:
        error = "smtp_no_configurado"

    return {
        "ok": True,
        "delivered": delivered,
        "reason": error,
        "adminEmail": BUG_REPORT_EMAIL,
    }


_ADMIN_ROLES = {"Super Administrator", "Administrator"}


def _require_super_admin(request: Request) -> Dict[str, Any]:
    """
    Verifica que la sesión pertenezca a un super-admin. Autoriza si el
    user_id está en SUPERADMIN_IDS o si el rol de sistema es Admin/Super Admin.
    Lanza 403 si no.
    """
    sess = _session_from_request(request)
    uid = str(sess.get("user_id") or "")
    role = str(sess.get("role") or "")
    if (uid and uid in _SUPERADMIN_IDS) or (role in _ADMIN_ROLES):
        return sess
    raise HTTPException(status_code=403, detail="Solo el administrador puede hacer esto.")


def _load_announcements() -> List[Dict[str, Any]]:
    try:
        with open(_ANNOUNCEMENTS_FILE, encoding="utf-8") as fh:
            data = _json.load(fh)
        return data if isinstance(data, list) else []
    except FileNotFoundError:
        return []
    except Exception:
        return []


def _save_announcements(items: List[Dict[str, Any]]) -> None:
    try:
        tmp = _ANNOUNCEMENTS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            _json.dump(items, fh, ensure_ascii=False)
        _os.replace(tmp, _ANNOUNCEMENTS_FILE)
    except Exception as e:
        logger.warning("no se pudo guardar anuncios: %s", str(e)[:120])


class AnnouncementIn(BaseModel):
    subject: str
    message: str
    audience: Optional[str] = "all"         # "all" (todos los usuarios) | "manual"
    recipients: Optional[List[str]] = None  # emails cuando audience="manual"
    tag: Optional[str] = "Anuncio"          # Anuncio | Actualización | Importante
    send_email: Optional[bool] = True       # si false, solo publica in-app
    preview: Optional[bool] = False         # si true, no envía ni guarda


def _resolve_recipients(payload: "AnnouncementIn") -> List[str]:
    """Resuelve la lista de correos según la audiencia elegida.

    Los estudiantes NO reciben correo: ven los anuncios solo dentro del
    portal. Por eso 'all' excluye a quienes están marcados como "student".
    """
    if (payload.audience or "all") == "all":
        return _list_emails(exclude_students=True)
    return [r.strip() for r in (payload.recipients or []) if r and r.strip()]


@router.get("/admin/known-users")
@limiter.limit("30/minute")
async def admin_known_users(request: Request):
    """Usuarios que han iniciado sesión en G.D (para elegir destinatarios). Solo super-admin."""
    _require_super_admin(request)
    users = _list_users(with_email_only=False)
    emails = _list_emails()
    return {"total": len(users), "withEmail": len(emails), "users": users}


@router.get("/admin/usage/summary")
@limiter.limit("30/minute")
async def admin_usage_summary(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
):
    """
    Métricas de uso de la plataforma para el Panel de Administración:
    quiénes han ingresado, cuándo, serie diaria de logins y últimos accesos.
    Fuente: Postgres (login_events / known_users). Solo super-admin.
    """
    _require_super_admin(request)
    import asyncio as _asyncio
    from app.services.usage_tracking import usage_summary as _usage_summary
    try:
        return await _asyncio.to_thread(_usage_summary, days)
    except Exception as e:
        logger.warning("admin_usage_summary falló: %s", str(e)[:200])
        raise HTTPException(
            status_code=503,
            detail="No se pudo consultar el historial de uso (BD no disponible).",
        )


@router.post("/admin/announcement")
@limiter.limit("5/minute")
async def create_announcement(payload: AnnouncementIn, request: Request):
    """
    Publica un anuncio del administrador y (opcionalmente) lo envía por
    correo a los destinatarios (via BCC para no exponer emails).
    Solo super-admin. `preview=true` valida sin enviar ni guardar.
    """
    sess = _require_super_admin(request)
    subject = (payload.subject or "").strip()
    message = (payload.message or "").strip()
    if not subject or not message:
        raise HTTPException(status_code=422, detail="Asunto y mensaje son obligatorios.")

    recipients = _resolve_recipients(payload)

    if payload.preview:
        return {
            "ok": True, "preview": True,
            "recipientCount": len(recipients),
            "smtpConfigured": smtp_configured(),
        }

    sent = {"ok": False, "recipients": 0, "error": None}
    if payload.send_email and recipients:
        if not smtp_configured():
            sent["error"] = "smtp_no_configurado"
        else:
            from_name = _os.getenv("SMTP_FROM_NAME", "G.D CESA")
            html = (
                f"<div style='font-family:Arial,sans-serif;max-width:560px'>"
                f"<h2 style='color:#0b5fff'>{subject}</h2>"
                f"<div style='white-space:pre-wrap;font-size:15px;line-height:1.6'>{message}</div>"
                f"<hr style='border:none;border-top:1px solid #eee;margin:24px 0'>"
                f"<p style='font-size:12px;color:#888'>Este mensaje fue enviado por el administrador de G.D · CESA.</p>"
                f"</div>"
            )
            res = send_email(
                to=[],  # broadcast oculto
                bcc=recipients,
                subject=subject,
                body_text=message,
                body_html=html,
            )
            sent = {"ok": bool(res.get("ok")), "recipients": res.get("recipients", 0), "error": res.get("error")}

    # Persistir el anuncio en Postgres (sobrevive redeploys);
    # fallback al JSON en filesystem solo si la BD falla.
    import asyncio as _asyncio
    from app.services import content_store as _content_store
    ann = None
    try:
        ann = await _asyncio.to_thread(
            _content_store.save_announcement,
            subject, message,
            (payload.tag or "Anuncio").strip(),
            sess.get("user_name") or "Administrador",
            sent["ok"], sent["recipients"],
        )
    except Exception:
        ann = None
    if ann is None:
        ann = {
            "id": int(_time_mod.time() * 1000),
            "ts": datetime.now(timezone.utc).isoformat(),
            "subject": subject,
            "message": message,
            "tag": (payload.tag or "Anuncio").strip(),
            "author": sess.get("user_name") or "Administrador",
            "emailSent": sent["ok"],
            "recipientCount": sent["recipients"],
        }
        items = _load_announcements()
        items.insert(0, ann)
        _save_announcements(items[:100])  # conservar los 100 más recientes

    return {"ok": True, "announcement": ann, "email": sent}


@router.get("/announcements")
async def list_announcements(limit: int = Query(default=20, ge=1, le=100)):
    """Anuncios recientes del administrador para mostrar dentro de la app.
    Fuente: Postgres; fallback al JSON local si la BD no responde."""
    import asyncio as _asyncio
    from app.services import content_store as _content_store
    items = None
    try:
        items = await _asyncio.to_thread(_content_store.list_announcements, limit)
    except Exception:
        items = None
    if items is None:
        items = _load_announcements()[:limit]
    return {"items": items}


class AudienceIn(BaseModel):
    audience: str  # "student" | "staff"


@router.post("/audience")
async def set_audience(payload: AudienceIn, request: Request):
    """
    Marca el canal de notificación del usuario según el portal que usa:
    "student" (solo in-app, sin correo) o "staff" (sí recibe correo).
    Lo llama el frontend tras conocer el rol. Best-effort.
    """
    aud = (payload.audience or "").strip().lower()
    if aud not in ("student", "staff"):
        raise HTTPException(status_code=422, detail="audience debe ser 'student' o 'staff'.")
    sess = _session_from_request(request)
    uid = sess.get("user_id")
    if not uid:
        return {"ok": False, "reason": "sin_sesion"}
    try:
        _record_user(
            uid,
            (sess.get("user_name") or "").strip(),
            sess.get("user_email"),
            sess.get("role"),
            audience=aud,
        )
        # También en Postgres (persistente entre redeploys). Best-effort.
        try:
            import asyncio as _asyncio
            from app.services.usage_tracking import set_audience as _set_audience_db
            await _asyncio.to_thread(_set_audience_db, uid, aud)
        except Exception:
            pass
        return {"ok": True, "audience": aud}
    except Exception as e:
        logger.warning("set_audience falló: %s", str(e)[:120])
        return {"ok": False, "reason": "error"}
