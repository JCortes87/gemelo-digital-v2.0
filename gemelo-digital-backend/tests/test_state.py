"""Tests del store de sesiones (app/state.py) — #16.

Cubre el ciclo de vida de una sesión: guardar, leer, expirar, borrar y
refrescar tokens. Sin Postgres: los write-through a BD son best-effort
y quedan silenciados por los try/except del propio módulo.
"""
import time

import pytest

from app import state


@pytest.fixture(autouse=True)
def _clean_store():
    """Cada test parte con el store vacío y lo deja limpio al salir."""
    state.SESSION_STORE.clear()
    yield
    state.SESSION_STORE.clear()


def _mk_token_data(**overrides):
    base = {
        "access_token": "tok-abc",
        "refresh_token": "ref-xyz",
        "expires_in": 3600,
        "user_id": "5427",
        "user_name": "Ana",
        "user_email": "ana@cesa.edu.co",
        "role": "Super Administrator",
        "all_roles": ["Super Administrator", "Instructor"],
    }
    base.update(overrides)
    return base


class TestSaveAndGet:
    def test_roundtrip(self):
        state.save_session("sid1", _mk_token_data())
        s = state.get_session("sid1")
        assert s is not None
        assert s["access_token"] == "tok-abc"
        assert s["user_id"] == "5427"
        assert s["role"] == "Super Administrator"
        assert s["all_roles"] == ["Super Administrator", "Instructor"]

    def test_get_access_token_shortcut(self):
        state.save_session("sid1", _mk_token_data())
        assert state.get_access_token("sid1") == "tok-abc"

    def test_missing_session_returns_none(self):
        assert state.get_session("no-existe") is None
        assert state.get_access_token("no-existe") is None

    def test_sessions_are_isolated_per_user(self):
        state.save_session("sid-a", _mk_token_data(access_token="tok-a", user_id="1"))
        state.save_session("sid-b", _mk_token_data(access_token="tok-b", user_id="2"))
        assert state.get_access_token("sid-a") == "tok-a"
        assert state.get_access_token("sid-b") == "tok-b"


class TestExpiry:
    def test_expired_session_is_evicted(self):
        state.save_session("sid1", _mk_token_data(expires_in=1))
        # Forzar expiración sin dormir
        state.SESSION_STORE["sid1"]["expires_at"] = time.time() - 10
        assert state.get_session("sid1") is None
        assert "sid1" not in state.SESSION_STORE


class TestDelete:
    def test_delete_removes_session(self):
        state.save_session("sid1", _mk_token_data())
        state.delete_session("sid1")
        assert state.get_session("sid1") is None

    def test_delete_missing_is_noop(self):
        state.delete_session("no-existe")  # no debe lanzar


class TestUpdateSessionTokens:
    def test_updates_access_token_and_preserves_identity(self):
        state.save_session("sid1", _mk_token_data())
        old_iat = state.SESSION_STORE["sid1"]["iat"]

        ok = state.update_session_tokens("sid1", {
            "access_token": "tok-nuevo",
            "expires_in": 7200,
        })
        assert ok is True
        s = state.get_session("sid1")
        assert s["access_token"] == "tok-nuevo"
        # Identidad intacta
        assert s["user_id"] == "5427"
        assert s["user_email"] == "ana@cesa.edu.co"
        assert s["iat"] == old_iat
        # Refresh token viejo se conserva si no vino uno nuevo
        assert s["refresh_token"] == "ref-xyz"

    def test_rotated_refresh_token_is_stored(self):
        state.save_session("sid1", _mk_token_data())
        state.update_session_tokens("sid1", {
            "access_token": "tok-2",
            "refresh_token": "ref-rotado",
        })
        assert state.get_session("sid1")["refresh_token"] == "ref-rotado"

    def test_returns_false_for_missing_session_or_bad_payload(self):
        assert state.update_session_tokens("no-existe", {"access_token": "x"}) is False
        state.save_session("sid1", _mk_token_data())
        assert state.update_session_tokens("sid1", {}) is False
        assert state.update_session_tokens("sid1", None) is False
        assert state.update_session_tokens("", {"access_token": "x"}) is False
