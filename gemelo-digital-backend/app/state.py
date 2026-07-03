# app/state.py
"""
Store de sesiones por usuario.
 
Reemplaza el antiguo dict TOKENS global (compartido entre todos los browsers)
por un store keyed por session_id. Cada usuario tiene su propio token de Brightspace.
 
Estructura:
  SESSION_STORE[session_id] = {
      "access_token":  str,
      "refresh_token": str | None,
      "expires_at":    float (epoch),   # calculado al recibir expires_in
      "user_id":       str | None,      # sub del whoami de Brightspace
      "user_name":     str | None,
      "user_email":    str | None,
      "iat":           float,           # timestamp de creación de la sesión
  }
 
Compatibilidad hacia atrás:
  TOKENS sigue exportado para que el código legacy no falle en import.
  Apunta a un dict vacío; el código que lo use recibirá un 401 apropiado.
"""
import json
import os
import time
import threading
from typing import Any, Dict, Optional

# ── Por sesión (nuevo) ────────────────────────────────────────────────────────
SESSION_STORE: Dict[str, Dict[str, Any]] = {}
_STORE_LOCK = threading.Lock()

SESSION_TTL = 60 * 60 * 8   # 8 horas — igual que la cookie
CLEANUP_EVERY = 300          # limpiar entradas expiradas cada 5 min
_last_cleanup = 0.0

# ── Persistencia opcional (solo dev local) ────────────────────────────────────
# En dev reiniciamos uvicorn seguido; sin esto cada reinicio borra la sesión en
# memoria y toca volver a loguearse en Brightspace. Con GEMELO_PERSIST_SESSIONS=1
# guardamos el store en un JSON local (gitignored) para sobrevivir reinicios.
# OFF por defecto → producción (ECS) nunca escribe tokens a disco.
_PERSIST = os.getenv("GEMELO_PERSIST_SESSIONS") == "1"
_PERSIST_PATH = os.getenv("GEMELO_SESSION_FILE") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".session_store.json"
)


def _persist_locked() -> None:
    """Vuelca SESSION_STORE a disco. Llamar con _STORE_LOCK tomado."""
    if not _PERSIST:
        return
    try:
        tmp = _PERSIST_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(SESSION_STORE, fh)
        os.replace(tmp, _PERSIST_PATH)
    except Exception:
        pass


def _load_persisted() -> None:
    if not _PERSIST:
        return
    try:
        with open(_PERSIST_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            now = time.time()
            with _STORE_LOCK:
                for sid, s in data.items():
                    if isinstance(s, dict) and now < float(s.get("expires_at", 0)):
                        SESSION_STORE[sid] = s
    except FileNotFoundError:
        pass
    except Exception:
        pass

 
def _maybe_cleanup() -> None:
    global _last_cleanup
    now = time.time()
    if now - _last_cleanup < CLEANUP_EVERY:
        return
    _last_cleanup = now
    with _STORE_LOCK:
        dead = [sid for sid, s in SESSION_STORE.items()
                if now - float(s.get("iat", 0)) > SESSION_TTL]
        for sid in dead:
            SESSION_STORE.pop(sid, None)
 
 
def save_session(session_id: str, token_data: Dict[str, Any]) -> None:
    """
    Guarda o actualiza el token de un usuario.
    token_data debe contener al menos 'access_token'.
    """
    _maybe_cleanup()
    now = time.time()
    expires_in = int(token_data.get("expires_in") or 3600)
    entry = {
        "access_token":  token_data.get("access_token", ""),
        "refresh_token": token_data.get("refresh_token"),
        "token_type":    token_data.get("token_type", "Bearer"),
        "scope":         token_data.get("scope", ""),
        "expires_at":    now + expires_in,
        "user_id":       token_data.get("user_id"),
        "user_name":     token_data.get("user_name"),
        "user_email":    token_data.get("user_email"),
        "iat":           now,
    }
    with _STORE_LOCK:
        SESSION_STORE[session_id] = entry
        _persist_locked()


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Retorna la sesión si existe y no expiró, o None."""
    _maybe_cleanup()
    with _STORE_LOCK:
        s = SESSION_STORE.get(session_id)
    if not s:
        return None
    if time.time() > float(s.get("expires_at", 0)):
        with _STORE_LOCK:
            SESSION_STORE.pop(session_id, None)
        return None
    return s
 
 
def delete_session(session_id: str) -> None:
    with _STORE_LOCK:
        SESSION_STORE.pop(session_id, None)
        _persist_locked()
 
 
def get_access_token(session_id: str) -> Optional[str]:
    """Atajo: devuelve solo el access_token de la sesión, o None."""
    s = get_session(session_id)
    return s.get("access_token") if s else None


#|---------- Refresh-token: actualizar tokens en sesion existente ----------|
def update_session_tokens(
    session_id: str,
    new_token_data: Dict[str, Any],
) -> bool:
    """
    Actualiza el access_token / refresh_token / expires_at de una sesion
    EXISTENTE tras una mintada exitosa via refresh_token.

    Se invoca desde brightspace_client.py cuando detecta que el
    access_token actual esta por expirar y llamo a
    mint_access_token_from_refresh() (en app/services/brightspace_auth.py).

    No crea sesiones nuevas — solo actualiza si ya existe. Preserva
    user_id / user_name / user_email / iat (lo identificativo del
    usuario) intactos.

    Args:
        session_id: el id de sesion a actualizar.
        new_token_data: dict con al menos `access_token`. Otros campos
                        opcionales: `refresh_token` (si Brightspace lo
                        roto), `expires_in`, `expires_at`, `scope`,
                        `token_type`.

    Returns:
        True si la sesion existia y se actualizo.
        False si no existia (expirada o nunca creada) o si el dict
        venia sin access_token.
    """
    if not session_id or not isinstance(new_token_data, dict):
        return False
    if not new_token_data.get("access_token"):
        return False

    with _STORE_LOCK:
        s = SESSION_STORE.get(session_id)
        if not s:
            return False

        #|-------- Solo tocamos los campos relacionados a tokens ----------|
        s["access_token"] = new_token_data["access_token"]

        # Brightspace puede rotar el refresh_token: si vino uno nuevo,
        # lo guardamos. Si no vino, conservamos el viejo (sigue valido).
        if new_token_data.get("refresh_token"):
            s["refresh_token"] = new_token_data["refresh_token"]

        # expires_at puede venir calculado por brightspace_auth (preferido)
        # o derivable de expires_in.
        if "expires_at" in new_token_data:
            s["expires_at"] = float(new_token_data["expires_at"])
        elif "expires_in" in new_token_data:
            s["expires_at"] = time.time() + int(new_token_data["expires_in"])

        # Campos cosmeticos que pueden venir en la respuesta
        if new_token_data.get("token_type"):
            s["token_type"] = new_token_data["token_type"]
        if new_token_data.get("scope"):
            s["scope"] = new_token_data["scope"]

        SESSION_STORE[session_id] = s
        _persist_locked()
        return True


# ── Compatibilidad hacia atrás ────────────────────────────────────────────────
# El dict global ya no se usa para autenticación real.
# Se mantiene vacío para que los imports legacy no rompan.
TOKENS: Dict[str, Any] = {}

# Rehidratar sesiones persistidas (solo si GEMELO_PERSIST_SESSIONS=1).
_load_persisted()