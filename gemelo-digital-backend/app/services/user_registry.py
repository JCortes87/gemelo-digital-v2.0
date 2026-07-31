# app/services/user_registry.py
"""
Registro persistente de usuarios que han iniciado sesión en G.D.

Sirve para que el administrador pueda enviar anuncios/notificaciones a
"todos los usuarios de la plataforma" (opción B) sin depender de las
sesiones en memoria, que son efímeras.

Se guarda como JSON: { "<user_id>": {user_id, name, email, role, last_seen, logins} }
Almacenamiento best-effort en disco (gitignored). No lanza excepciones.
"""
import os
import json
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_LOCK = threading.Lock()

_DATA_DIR = os.getenv("GEMELO_DATA_DIR") or os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
_REGISTRY_PATH = os.getenv("GEMELO_USERS_FILE") or os.path.join(_DATA_DIR, "known_users.json")


def _load() -> Dict[str, Dict[str, Any]]:
    try:
        with open(_REGISTRY_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception:
        return {}


def _save_locked(data: Dict[str, Dict[str, Any]]) -> None:
    try:
        tmp = _REGISTRY_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False)
        os.replace(tmp, _REGISTRY_PATH)
    except Exception:
        pass


def record_user(
    user_id: Optional[str],
    name: Optional[str] = None,
    email: Optional[str] = None,
    role: Optional[str] = None,
    audience: Optional[str] = None,
) -> None:
    """Registra o actualiza un usuario al iniciar sesión. Best-effort.

    `audience` clasifica el canal preferido: "student" (solo in-app, sin
    correo) o "staff" (docente/coordinador/admin, sí recibe correo). Si un
    usuario alguna vez usa el panel docente, "staff" prevalece sobre
    "student" para no dejar de notificarle por correo (doble rol).
    """
    uid = str(user_id or "").strip()
    if not uid:
        return
    now = datetime.now(timezone.utc).isoformat()
    aud = (audience or "").strip().lower()
    with _LOCK:
        data = _load()
        entry = data.get(uid, {})
        entry["user_id"] = uid
        if name:
            entry["name"] = name
        if email:
            entry["email"] = email
        if role:
            entry["role"] = role
        if aud in ("student", "staff"):
            # staff prevalece sobre student (doble rol → sí recibe correo)
            if not (aud == "student" and entry.get("audience") == "staff"):
                entry["audience"] = aud
        entry["last_seen"] = now
        entry["logins"] = int(entry.get("logins", 0)) + 1
        data[uid] = entry
        _save_locked(data)


def list_users(with_email_only: bool = False, exclude_students: bool = False) -> List[Dict[str, Any]]:
    """Lista los usuarios registrados.

    - with_email_only: solo con email.
    - exclude_students: omite a quienes tienen audience == "student".
    """
    with _LOCK:
        data = _load()
    items = list(data.values())
    if with_email_only:
        items = [u for u in items if (u.get("email") or "").strip()]
    if exclude_students:
        items = [u for u in items if (u.get("audience") or "").lower() != "student"]
    items.sort(key=lambda u: u.get("last_seen") or "", reverse=True)
    return items


def list_emails(exclude_students: bool = False) -> List[str]:
    """Correos únicos de usuarios registrados (para broadcast).

    Si exclude_students=True, no incluye a los usuarios marcados como
    "student" (que reciben los anuncios solo dentro del portal).
    """
    seen = set()
    out: List[str] = []
    for u in list_users(with_email_only=True, exclude_students=exclude_students):
        e = (u.get("email") or "").strip()
        low = e.lower()
        if e and low not in seen:
            seen.add(low)
            out.append(e)
    return out
