"""Tests de autorización por rol (_require_super_admin en app/api/gemelo_admin.py) — #16.

Autoriza si: user_id ∈ SUPERADMIN_IDS, o rol de sistema es
Administrator / Super Administrator. Cualquier otro → 403.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import gemelo_admin as gemelo


def _patch_session(monkeypatch, session):
    monkeypatch.setattr(gemelo, "_session_from_request", lambda _req: session)


_REQ = SimpleNamespace()  # _session_from_request está parcheado; el request no se usa


class TestRequireSuperAdmin:
    def test_allows_super_administrator_role(self, monkeypatch):
        _patch_session(monkeypatch, {"user_id": "999", "role": "Super Administrator"})
        sess = gemelo._require_super_admin(_REQ)
        assert sess["role"] == "Super Administrator"

    def test_allows_administrator_role(self, monkeypatch):
        _patch_session(monkeypatch, {"user_id": "999", "role": "Administrator"})
        assert gemelo._require_super_admin(_REQ)["role"] == "Administrator"

    def test_allows_whitelisted_user_id(self, monkeypatch):
        monkeypatch.setattr(gemelo, "_SUPERADMIN_IDS", {"5427"})
        _patch_session(monkeypatch, {"user_id": "5427", "role": "Instructor"})
        assert gemelo._require_super_admin(_REQ)["user_id"] == "5427"

    def test_403_for_instructor(self, monkeypatch):
        monkeypatch.setattr(gemelo, "_SUPERADMIN_IDS", {"5427"})
        _patch_session(monkeypatch, {"user_id": "111", "role": "Instructor"})
        with pytest.raises(HTTPException) as exc:
            gemelo._require_super_admin(_REQ)
        assert exc.value.status_code == 403

    def test_403_for_student(self, monkeypatch):
        monkeypatch.setattr(gemelo, "_SUPERADMIN_IDS", {"5427"})
        _patch_session(monkeypatch, {"user_id": "222", "role": "Learner"})
        with pytest.raises(HTTPException):
            gemelo._require_super_admin(_REQ)

    def test_403_for_empty_session(self, monkeypatch):
        monkeypatch.setattr(gemelo, "_SUPERADMIN_IDS", {"5427"})
        _patch_session(monkeypatch, {})
        with pytest.raises(HTTPException) as exc:
            gemelo._require_super_admin(_REQ)
        assert exc.value.status_code == 403

    def test_role_comparison_is_exact(self, monkeypatch):
        """'administrator' en minúsculas NO debe pasar (comparación exacta)."""
        monkeypatch.setattr(gemelo, "_SUPERADMIN_IDS", set())
        _patch_session(monkeypatch, {"user_id": "1", "role": "administrator"})
        with pytest.raises(HTTPException):
            gemelo._require_super_admin(_REQ)
