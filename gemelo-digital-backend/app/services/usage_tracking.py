# app/services/usage_tracking.py
"""
Tracking persistente de uso de G.D en Postgres.

Complementa a user_registry.py (JSON efímero en el fs del contenedor):
- known_users:  quién ha usado la plataforma (último acceso, # ingresos).
- login_events: historial completo — un registro por cada login OAuth.

Todas las escrituras son best-effort: nunca lanzan excepción hacia el
flujo de autenticación. Las lecturas alimentan el Panel de Administración
(GET /gemelo/admin/usage/summary).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select

from app.db.models import KnownUser, LoginEvent
from app.db.session import SessionLocal, engine

logger = logging.getLogger("uvicorn.error")


def ensure_tables() -> None:
    """Crea known_users / login_events / app_sessions / announcements /
    bug_reports si no existen (idempotente, no toca las demás tablas).
    Se llama en el startup de la app."""
    try:
        from app.db.base import Base
        from app.db.models import Announcement, AppSession, BugReport
        Base.metadata.create_all(
            bind=engine,
            tables=[
                KnownUser.__table__,
                LoginEvent.__table__,
                AppSession.__table__,
                Announcement.__table__,
                BugReport.__table__,
            ],
            checkfirst=True,
        )
        logger.info(
            "usage_tracking: tablas known_users/login_events/app_sessions/"
            "announcements/bug_reports verificadas"
        )
    except Exception as e:
        logger.warning("usage_tracking.ensure_tables falló: %s", str(e)[:200])


def _utcnow() -> datetime:
    # naive UTC — consistente con datetime.utcnow usado en el resto de modelos
    return datetime.now(timezone.utc).replace(tzinfo=None)


def record_login(
    user_id: Optional[str],
    name: Optional[str] = None,
    email: Optional[str] = None,
    role: Optional[str] = None,
) -> None:
    """Registra un login: inserta un LoginEvent y hace upsert del KnownUser.
    Best-effort: silencia cualquier error (la BD nunca debe romper el login)."""
    uid = str(user_id or "").strip()
    if not uid:
        return
    now = _utcnow()
    db = None
    try:
        db = SessionLocal()
        db.add(LoginEvent(user_id=uid, name=name, email=email, role=role, logged_in_at=now))

        ku = db.execute(select(KnownUser).where(KnownUser.user_id == uid)).scalar_one_or_none()
        if ku is None:
            ku = KnownUser(user_id=uid, first_seen=now, login_count=0)
            db.add(ku)
        if name:
            ku.name = name
        if email:
            ku.email = email
        if role:
            ku.role = role
        ku.last_seen = now
        ku.login_count = int(ku.login_count or 0) + 1
        db.commit()
    except Exception as e:
        logger.warning("usage_tracking.record_login falló: %s", str(e)[:200])
        try:
            if db:
                db.rollback()
        except Exception:
            pass
    finally:
        try:
            if db:
                db.close()
        except Exception:
            pass


def set_audience(user_id: Optional[str], audience: Optional[str]) -> None:
    """Actualiza el canal del usuario ("student"/"staff") en la BD.
    staff prevalece sobre student (doble rol → sí recibe correo)."""
    uid = str(user_id or "").strip()
    aud = (audience or "").strip().lower()
    if not uid or aud not in ("student", "staff"):
        return
    db = None
    try:
        db = SessionLocal()
        ku = db.execute(select(KnownUser).where(KnownUser.user_id == uid)).scalar_one_or_none()
        if ku is None:
            ku = KnownUser(user_id=uid, first_seen=_utcnow(), last_seen=_utcnow(), login_count=0)
            db.add(ku)
        if not (aud == "student" and (ku.audience or "") == "staff"):
            ku.audience = aud
        db.commit()
    except Exception as e:
        logger.warning("usage_tracking.set_audience falló: %s", str(e)[:200])
        try:
            if db:
                db.rollback()
        except Exception:
            pass
    finally:
        try:
            if db:
                db.close()
        except Exception:
            pass


def usage_summary(days: int = 30, recent_limit: int = 30) -> Dict[str, Any]:
    """Resumen de uso para el Panel de Administración.

    Returns:
        totals: usuarios registrados, logins históricos, activos 7/30 días,
                logins de hoy y del período.
        daily:  [{date: "YYYY-MM-DD", logins, uniqueUsers}] últimos `days` días.
        users:  lista completa de known_users (ordenada por último acceso).
        recent: últimos `recent_limit` login_events.
    """
    days = max(1, min(int(days or 30), 365))
    now = _utcnow()
    since = now - timedelta(days=days)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    db = SessionLocal()
    try:
        total_users = db.execute(select(func.count(KnownUser.id))).scalar() or 0
        total_logins = db.execute(select(func.count(LoginEvent.id))).scalar() or 0
        logins_today = db.execute(
            select(func.count(LoginEvent.id)).where(LoginEvent.logged_in_at >= today_start)
        ).scalar() or 0
        active_7d = db.execute(
            select(func.count(func.distinct(LoginEvent.user_id)))
            .where(LoginEvent.logged_in_at >= now - timedelta(days=7))
        ).scalar() or 0
        active_30d = db.execute(
            select(func.count(func.distinct(LoginEvent.user_id)))
            .where(LoginEvent.logged_in_at >= now - timedelta(days=30))
        ).scalar() or 0
        logins_period = db.execute(
            select(func.count(LoginEvent.id)).where(LoginEvent.logged_in_at >= since)
        ).scalar() or 0

        # Serie diaria: logins y usuarios únicos por día
        day_col = func.date(LoginEvent.logged_in_at)
        rows = db.execute(
            select(
                day_col.label("d"),
                func.count(LoginEvent.id),
                func.count(func.distinct(LoginEvent.user_id)),
            )
            .where(LoginEvent.logged_in_at >= since)
            .group_by(day_col)
            .order_by(day_col)
        ).all()
        by_day = {str(r[0]): {"logins": int(r[1]), "uniqueUsers": int(r[2])} for r in rows}
        daily: List[Dict[str, Any]] = []
        for i in range(days - 1, -1, -1):
            d = (now - timedelta(days=i)).date().isoformat()
            entry = by_day.get(d, {"logins": 0, "uniqueUsers": 0})
            daily.append({"date": d, **entry})

        users = [
            {
                "user_id": u.user_id,
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "audience": u.audience,
                "first_seen": u.first_seen.isoformat() + "Z" if u.first_seen else None,
                "last_seen": u.last_seen.isoformat() + "Z" if u.last_seen else None,
                "logins": int(u.login_count or 0),
            }
            for u in db.execute(
                select(KnownUser).order_by(KnownUser.last_seen.desc())
            ).scalars().all()
        ]

        recent = [
            {
                "user_id": e.user_id,
                "name": e.name,
                "email": e.email,
                "role": e.role,
                "ts": e.logged_in_at.isoformat() + "Z" if e.logged_in_at else None,
            }
            for e in db.execute(
                select(LoginEvent).order_by(LoginEvent.logged_in_at.desc()).limit(recent_limit)
            ).scalars().all()
        ]

        return {
            "ok": True,
            "days": days,
            "totals": {
                "users": int(total_users),
                "logins": int(total_logins),
                "loginsToday": int(logins_today),
                "loginsPeriod": int(logins_period),
                "active7d": int(active_7d),
                "active30d": int(active_30d),
            },
            "daily": daily,
            "users": users,
            "recent": recent,
        }
    finally:
        db.close()
