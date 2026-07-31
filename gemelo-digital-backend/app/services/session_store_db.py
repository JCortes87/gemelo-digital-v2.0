# app/services/session_store_db.py
"""
Respaldo de sesiones en Postgres (tabla app_sessions).

app/state.py mantiene el store en memoria como fast-path y hace write-through
aquí. Al reiniciar/redesplegar el backend, get_session() hace fallback a esta
tabla y rehidrata la memoria — los usuarios ya NO pierden la sesión en cada
deploy.

Principios:
- 100 % best-effort: ningún error de BD debe romper el flujo de autenticación.
- Circuit breaker: si la BD no responde (p. ej. dev local sin acceso a RDS),
  se marca como caída y no se reintenta durante _RETRY_AFTER segundos, para
  no pagar el connect_timeout en cada request.
- Las escrituras van en un hilo de fondo (no bloquean el event loop).
"""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

logger = logging.getLogger("uvicorn.error")

_RETRY_AFTER = 60.0          # segundos sin reintentar tras un fallo de BD
_db_down_until = 0.0
_down_lock = threading.Lock()


def _db_available() -> bool:
    return time.time() >= _db_down_until


def _mark_db_down(err: Exception) -> None:
    global _db_down_until
    with _down_lock:
        _db_down_until = time.time() + _RETRY_AFTER
    logger.warning(
        "session_store_db: BD no disponible (%s). Sesiones solo en memoria por %ds.",
        str(err)[:150], int(_RETRY_AFTER),
    )


def _utc_from_epoch(epoch: float) -> datetime:
    # naive UTC — consistente con el resto de modelos
    return datetime.utcfromtimestamp(float(epoch))


def _row_values(session_id: str, entry: Dict[str, Any], session_ttl: int) -> Dict[str, Any]:
    now = time.time()
    expires_at = float(entry.get("expires_at") or now)
    iat = float(entry.get("iat") or now)
    return {
        "session_id": session_id,
        "data": json.dumps(entry, ensure_ascii=False),
        "expires_at": _utc_from_epoch(expires_at),
        "purge_after": _utc_from_epoch(iat + session_ttl),
        "updated_at": _utc_from_epoch(now),
    }


def _upsert_sync(session_id: str, entry: Dict[str, Any], session_ttl: int) -> None:
    from sqlalchemy import select
    from app.db.models import AppSession
    from app.db.session import SessionLocal

    vals = _row_values(session_id, entry, session_ttl)
    db = None
    try:
        db = SessionLocal()
        row = db.execute(
            select(AppSession).where(AppSession.session_id == session_id)
        ).scalar_one_or_none()
        if row is None:
            db.add(AppSession(**vals))
        else:
            row.data = vals["data"]
            row.expires_at = vals["expires_at"]
            row.purge_after = vals["purge_after"]
            row.updated_at = vals["updated_at"]
        db.commit()
    except Exception as e:
        _mark_db_down(e)
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


def upsert_async(session_id: str, entry: Dict[str, Any], session_ttl: int) -> None:
    """Persiste (crea/actualiza) la sesión en un hilo de fondo. Best-effort."""
    if not session_id or not _db_available():
        return
    threading.Thread(
        target=_upsert_sync,
        args=(session_id, dict(entry), session_ttl),
        daemon=True,
        name="session-db-upsert",
    ).start()


def delete_async(session_id: str) -> None:
    """Elimina la sesión de la BD en un hilo de fondo. Best-effort."""
    if not session_id or not _db_available():
        return

    def _delete() -> None:
        from app.db.models import AppSession
        from app.db.session import SessionLocal
        db = None
        try:
            db = SessionLocal()
            db.query(AppSession).filter(AppSession.session_id == session_id).delete()
            db.commit()
        except Exception as e:
            _mark_db_down(e)
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

    threading.Thread(target=_delete, daemon=True, name="session-db-delete").start()


def fetch(session_id: str) -> Optional[Dict[str, Any]]:
    """Busca la sesión en BD (fallback tras un reinicio). Devuelve el dict de
    sesión si existe y su access_token no ha expirado; None en caso contrario.
    Síncrono (el llamador solo llega aquí en un miss de memoria)."""
    if not session_id or not _db_available():
        return None
    from sqlalchemy import select
    from app.db.models import AppSession
    from app.db.session import SessionLocal
    db = None
    try:
        db = SessionLocal()
        row = db.execute(
            select(AppSession).where(AppSession.session_id == session_id)
        ).scalar_one_or_none()
        if row is None:
            return None
        if row.expires_at and datetime.utcnow() > row.expires_at:
            return None
        data = json.loads(row.data or "{}")
        return data if isinstance(data, dict) and data.get("access_token") else None
    except Exception as e:
        _mark_db_down(e)
        return None
    finally:
        try:
            if db:
                db.close()
        except Exception:
            pass


def purge_expired_async() -> None:
    """Borra filas cuya vida útil máxima (purge_after) ya pasó. Best-effort."""
    if not _db_available():
        return

    def _purge() -> None:
        from app.db.models import AppSession
        from app.db.session import SessionLocal
        db = None
        try:
            db = SessionLocal()
            n = (
                db.query(AppSession)
                .filter(AppSession.purge_after < datetime.utcnow() - timedelta(minutes=5))
                .delete()
            )
            db.commit()
            if n:
                logger.info("session_store_db: purgadas %d sesiones expiradas", n)
        except Exception as e:
            _mark_db_down(e)
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

    threading.Thread(target=_purge, daemon=True, name="session-db-purge").start()
