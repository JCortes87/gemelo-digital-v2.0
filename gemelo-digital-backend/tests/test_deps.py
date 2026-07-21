"""Tests de auth/sesión y caché Brightspace (app/api/deps.py) — #16.

- _require_session / _require_token_from_request: extracción y validación
  de la sesión (cookie o Bearer header), 401 cuando no hay sesión.
- _bs_cache_key / _bs_get_cached: aislamiento por usuario, TTL, y que los
  errores nunca se cacheen.
"""
import time
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import state
from app.api import deps


@pytest.fixture(autouse=True)
def _clean():
    state.SESSION_STORE.clear()
    deps._BS_CACHE.clear()
    yield
    state.SESSION_STORE.clear()
    deps._BS_CACHE.clear()


def _fake_request(cookies=None, headers=None):
    """Stub mínimo de fastapi.Request: deps solo usa .cookies y .headers."""
    return SimpleNamespace(cookies=cookies or {}, headers=headers or {})


def _login(sid="sid-test", token="tok-123"):
    state.save_session(sid, {"access_token": token, "expires_in": 3600})
    return sid


class TestRequireSession:
    def test_401_without_cookie(self):
        with pytest.raises(HTTPException) as exc:
            deps._require_session(_fake_request())
        assert exc.value.status_code == 401

    def test_401_with_invalid_sid(self):
        req = _fake_request(cookies={deps.SESSION_COOKIE: "sid-falso"})
        with pytest.raises(HTTPException) as exc:
            deps._require_session(req)
        assert exc.value.status_code == 401

    def test_ok_with_valid_cookie(self):
        sid = _login()
        req = _fake_request(cookies={deps.SESSION_COOKIE: sid})
        session = deps._require_session(req)
        assert session["access_token"] == "tok-123"


class TestRequireTokenFromRequest:
    def test_bearer_header(self):
        sid = _login()
        req = _fake_request(headers={"Authorization": f"Bearer {sid}"})
        token, err = deps._require_token_from_request(req)
        assert err is None
        assert token == "tok-123"

    def test_cookie_fallback(self):
        sid = _login()
        req = _fake_request(cookies={deps.SESSION_COOKIE: sid})
        token, err = deps._require_token_from_request(req)
        assert err is None
        assert token == "tok-123"

    def test_401_when_unauthenticated(self):
        token, err = deps._require_token_from_request(_fake_request())
        assert token is None
        assert err is not None
        assert err.status_code == 401

    def test_invalid_bearer_falls_back_to_401(self):
        req = _fake_request(headers={"Authorization": "Bearer sid-invalido"})
        token, err = deps._require_token_from_request(req)
        assert token is None
        assert err.status_code == 401


class TestBsCacheKey:
    def test_isolated_per_user_token(self):
        """CRÍTICO: dos usuarios nunca comparten entrada de caché."""
        h1 = {"Authorization": "Bearer token-usuario-1"}
        h2 = {"Authorization": "Bearer token-usuario-2"}
        k1 = deps._bs_cache_key("https://x/api", h1, None)
        k2 = deps._bs_cache_key("https://x/api", h2, None)
        assert k1 != k2

    def test_key_does_not_contain_raw_token(self):
        h = {"Authorization": "Bearer super-secreto"}
        key = deps._bs_cache_key("https://x/api", h, None)
        assert "super-secreto" not in key

    def test_params_and_url_differentiate(self):
        h = {"Authorization": "Bearer t"}
        assert deps._bs_cache_key("https://x/a", h, None) != deps._bs_cache_key("https://x/b", h, None)
        assert deps._bs_cache_key("https://x/a", h, {"p": 1}) != deps._bs_cache_key("https://x/a", h, {"p": 2})


class TestBsGetCached:
    async def test_second_call_hits_cache(self, monkeypatch):
        calls = []

        async def fake_get(url, headers, params=None, timeout=30):
            calls.append(url)
            return 200, {"data": "ok"}

        monkeypatch.setattr(deps, "_bs_get", fake_get)
        h = {"Authorization": "Bearer t1"}

        s1, b1 = await deps._bs_get_cached("https://x/api", h)
        s2, b2 = await deps._bs_get_cached("https://x/api", h)
        assert (s1, b1) == (200, {"data": "ok"})
        assert (s2, b2) == (200, {"data": "ok"})
        assert len(calls) == 1  # la segunda vino de caché

    async def test_errors_are_never_cached(self, monkeypatch):
        calls = []

        async def fake_get(url, headers, params=None, timeout=30):
            calls.append(url)
            return 502, {"error": "bad gateway"}

        monkeypatch.setattr(deps, "_bs_get", fake_get)
        h = {"Authorization": "Bearer t1"}

        await deps._bs_get_cached("https://x/api", h)
        await deps._bs_get_cached("https://x/api", h)
        assert len(calls) == 2  # los errores siempre se re-consultan

    async def test_mutating_result_does_not_corrupt_cache(self, monkeypatch):
        async def fake_get(url, headers, params=None, timeout=30):
            return 200, {"Items": [1, 2, 3]}

        monkeypatch.setattr(deps, "_bs_get", fake_get)
        h = {"Authorization": "Bearer t1"}

        _, body1 = await deps._bs_get_cached("https://x/api", h)
        body1["Items"].append(999)  # el handler muta su copia
        _, body2 = await deps._bs_get_cached("https://x/api", h)
        assert body2 == {"Items": [1, 2, 3]}

    async def test_expired_entry_refetches(self, monkeypatch):
        calls = []

        async def fake_get(url, headers, params=None, timeout=30):
            calls.append(url)
            return 200, {"v": len(calls)}

        monkeypatch.setattr(deps, "_bs_get", fake_get)
        h = {"Authorization": "Bearer t1"}

        await deps._bs_get_cached("https://x/api", h, ttl=300)
        # Envejecer la entrada más allá del TTL
        key = deps._bs_cache_key("https://x/api", h, None)
        ts, st, body = deps._BS_CACHE[key]
        deps._BS_CACHE[key] = (ts - 301, st, body)

        _, body2 = await deps._bs_get_cached("https://x/api", h, ttl=300)
        assert len(calls) == 2
        assert body2 == {"v": 2}

    async def test_users_do_not_share_cached_responses(self, monkeypatch):
        async def fake_get(url, headers, params=None, timeout=30):
            who = headers["Authorization"].split()[-1]
            return 200, {"whoami": who}

        monkeypatch.setattr(deps, "_bs_get", fake_get)

        _, b1 = await deps._bs_get_cached("https://x/whoami", {"Authorization": "Bearer u1"})
        _, b2 = await deps._bs_get_cached("https://x/whoami", {"Authorization": "Bearer u2"})
        assert b1 == {"whoami": "u1"}
        assert b2 == {"whoami": "u2"}
