# app/services/content_store.py
"""
Persistencia de anuncios y reportes de error en Postgres.

Antes vivían en el filesystem del contenedor (announcements.json /
bug_reports.jsonl) y se perdían en cada redeploy de ECS. Ahora van a las
tablas announcements / bug_reports (mismo patrón best-effort que
usage_tracking: los errores de BD se registran pero nunca rompen el flujo;
el llamador puede caer al archivo como fallback).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.db.models import Announcement, BugReport
from app.db.session import SessionLocal

logger = logging.getLogger("uvicorn.error")


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    return dt.replace(tzinfo=timezone.utc).isoformat()


def _ann_to_dict(a: Announcement) -> Dict[str, Any]:
    # Mismo shape que el JSON legacy para no romper el frontend
    return {
        "id": a.id,
        "ts": _iso(a.ts),
        "subject": a.subject,
        "message": a.message,
        "tag": a.tag or "Anuncio",
        "author": a.author or "Administrador",
        "emailSent": bool(a.email_sent),
        "recipientCount": int(a.recipient_count or 0),
    }


def save_announcement(
    subject: str,
    message: str,
    tag: Optional[str],
    author: Optional[str],
    email_sent: bool,
    recipient_count: int,
) -> Optional[Dict[str, Any]]:
    """Inserta el anuncio. Devuelve el dict (shape legacy) o None si la BD falló."""
    db = None
    try:
        db = SessionLocal()
        ann = Announcement(
            ts=datetime.now(timezone.utc).replace(tzinfo=None),
            subject=subject,
            message=message,
            tag=tag,
            author=author,
            email_sent=bool(email_sent),
            recipient_count=int(recipient_count or 0),
        )
        db.add(ann)
        db.commit()
        db.refresh(ann)
        return _ann_to_dict(ann)
    except Exception as e:
        logger.warning("content_store.save_announcement falló: %s", str(e)[:200])
        try:
            if db:
                db.rollback()
        except Exception:
            pass
        return None
    finally:
        try:
            if db:
                db.close()
        except Exception:
            pass


def list_announcements(limit: int = 20) -> Optional[List[Dict[str, Any]]]:
    """Anuncios más recientes primero. None si la BD falló (para fallback)."""
    db = None
    try:
        db = SessionLocal()
        rows = db.execute(
            select(Announcement).order_by(Announcement.ts.desc()).limit(int(limit))
        ).scalars().all()
        return [_ann_to_dict(a) for a in rows]
    except Exception as e:
        logger.warning("content_store.list_announcements falló: %s", str(e)[:200])
        return None
    finally:
        try:
            if db:
                db.close()
        except Exception:
            pass


def save_bug_report(
    title: str,
    severity: str,
    description: str,
    user_id: Optional[str],
    user_name: Optional[str],
    user_email: Optional[str],
    context: Optional[Dict[str, Any]],
) -> bool:
    """Inserta el reporte. True si quedó en BD; False si falló (fallback a archivo)."""
    db = None
    try:
        db = SessionLocal()
        db.add(BugReport(
            ts=datetime.now(timezone.utc).replace(tzinfo=None),
            title=(title or "")[:255],
            severity=(severity or "")[:20],
            description=description,
            user_id=str(user_id) if user_id else None,
            user_name=user_name,
            user_email=user_email,
            context=json.dumps(context or {}, ensure_ascii=False),
        ))
        db.commit()
        return True
    except Exception as e:
        logger.warning("content_store.save_bug_report falló: %s", str(e)[:200])
        try:
            if db:
                db.rollback()
        except Exception:
            pass
        return False
    finally:
        try:
            if db:
                db.close()
        except Exception:
            pass
