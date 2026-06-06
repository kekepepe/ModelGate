"""Regression tests for `POST /api/providers/{provider_id}/test` (phase 11, V2 P0-4).

The endpoint probes a provider by issuing a minimal chat request through
the existing adapter pipeline and classifies the outcome into a stable
result vocabulary the V2 frontend renders directly:

    ok, missing_key, auth_failed, rate_limited, timeout,
    unreachable, forbidden, bad_request, server_error,
    request_error, no_chat_model, config_error, error

Self-contained: no Postgres, no Redis, no real network. The adapter's
underlying `httpx.AsyncClient` is patched per-test so each scenario can
be exercised deterministically.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import models as db_models  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.services.provider_secrets import set_local_provider_secret  # noqa: E402


class _FakeRedis:
    def __init__(self, *args, **kwargs) -> None:
        pass

    @classmethod
    def from_url(cls, *args, **kwargs) -> "_FakeRedis":
        return cls()

    def ping(self) -> None:
        return None

    def close(self) -> None:
        return None


@pytest.fixture
def client(monkeypatch):
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)

    import app.core.startup as startup_module
    import app.db.session as session_module
    import app.services.provider_secrets as provider_secrets_module

    monkeypatch.setattr(session_module, "engine", test_engine)
    monkeypatch.setattr(session_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "engine", test_engine)
    monkeypatch.setattr(startup_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "Redis", _FakeRedis)
    monkeypatch.setattr(startup_module, "sync_registry_to_db", lambda *a, **k: None)
    monkeypatch.setattr(provider_secrets_module, "SessionLocal", TestSessionLocal)

    def _get_db_override():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db_override
    db_models.Base.metadata.create_all(test_engine)

    with TestClient(app) as c:
        yield c, TestSessionLocal

    app.dependency_overrides.clear()
    test_engine.dispose()


def _seed_provider_key(SessionLocal, provider_id: str = "mimo") -> None:
    with SessionLocal() as session:
        set_local_provider_secret(provider_id, "sk-fake-key-1234567890", session)


def _mock_response(status_code: int, body: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        json=body if body is not None else {},
        request=httpx.Request("POST", "https://mock.local/chat/completions"),
    )


# ── helpers to patch the AsyncClient.post used by OpenAICompatibleAdapter ─


class _AsyncClientCtx:
    """Async context manager that replaces httpx.AsyncClient for tests."""

    def __init__(self, handler):
        self._handler = handler

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, url, headers=None, json=None):
        result = self._handler(url=url, headers=headers, json=json)
        if isinstance(result, Exception):
            raise result
        # mimic raise_for_status — caller invokes it.
        return result


def _patch_httpx(handler):
    """Return a context manager that swaps httpx.AsyncClient in the
    adapter module for one whose .post returns/throws what `handler`
    decides per call."""

    def _factory(*args, **kwargs):
        return _AsyncClientCtx(handler)

    return patch("app.providers.openai_compatible.httpx.AsyncClient", _factory)


# ── Tests ───────────────────────────────────────────────────────────────────


def test_missing_key_when_no_secret_configured(client) -> None:
    c, _ = client
    response = c.post("/api/providers/mimo/test")
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "missing_key"
    assert body["providerId"] == "mimo"
    assert "errorType" in body


def test_no_chat_model_for_unknown_provider_returns_404_via_get_provider(client) -> None:
    """`model_registry.get_provider` raises AppError(404) for unknown ids;
    that surfaces as a 404 response."""
    c, _ = client
    response = c.post("/api/providers/does-not-exist/test")
    assert response.status_code == 404


def test_ok_when_provider_returns_200(client) -> None:
    c, SessionLocal = client
    _seed_provider_key(SessionLocal)

    def handler(url, headers, json):
        return _mock_response(
            200,
            body={
                "choices": [{"message": {"content": "pong"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            },
        )

    with _patch_httpx(handler):
        response = c.post("/api/providers/mimo/test")

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "ok"
    assert body["providerId"] == "mimo"
    assert body["message"] == "Connected"
    assert body.get("modelId")


def test_auth_failed_when_provider_returns_401(client) -> None:
    c, SessionLocal = client
    _seed_provider_key(SessionLocal)

    def handler(url, headers, json):
        return _mock_response(
            401,
            body={"error": {"message": "Invalid API key"}},
        )

    with _patch_httpx(handler):
        response = c.post("/api/providers/mimo/test")

    body = response.json()["data"]
    assert body["status"] == "auth_failed"
    assert body["errorType"] == "PROVIDER_AUTH_FAILED"


def test_rate_limited_when_provider_returns_429(client) -> None:
    c, SessionLocal = client
    _seed_provider_key(SessionLocal)

    def handler(url, headers, json):
        return _mock_response(429, body={"error": {"message": "Slow down"}})

    with _patch_httpx(handler):
        response = c.post("/api/providers/mimo/test")

    body = response.json()["data"]
    assert body["status"] == "rate_limited"
    assert body["errorType"] == "PROVIDER_RATE_LIMITED"


def test_unreachable_on_connect_error(client) -> None:
    c, SessionLocal = client
    _seed_provider_key(SessionLocal)

    def handler(url, headers, json):
        return httpx.ConnectError(
            "Connection refused",
            request=httpx.Request("POST", url),
        )

    with _patch_httpx(handler):
        response = c.post("/api/providers/mimo/test")

    body = response.json()["data"]
    assert body["status"] == "unreachable"
    assert body["errorType"] == "PROVIDER_CONNECT_ERROR"


def test_timeout_on_provider_timeout(client) -> None:
    c, SessionLocal = client
    _seed_provider_key(SessionLocal)

    def handler(url, headers, json):
        return httpx.ReadTimeout(
            "Read timeout",
            request=httpx.Request("POST", url),
        )

    with _patch_httpx(handler):
        response = c.post("/api/providers/mimo/test")

    body = response.json()["data"]
    assert body["status"] == "timeout"
    assert body["errorType"] == "PROVIDER_TIMEOUT"


def test_server_error_on_provider_500(client) -> None:
    c, SessionLocal = client
    _seed_provider_key(SessionLocal)

    def handler(url, headers, json):
        return _mock_response(503, body={"error": {"message": "Upstream down"}})

    with _patch_httpx(handler):
        response = c.post("/api/providers/mimo/test")

    body = response.json()["data"]
    assert body["status"] == "server_error"
    assert body["errorType"] == "PROVIDER_SERVER_ERROR"


def test_response_shape_contract(client) -> None:
    """The V2 frontend relies on these field names — keep them stable."""
    c, _ = client
    response = c.post("/api/providers/mimo/test")
    body = response.json()["data"]
    # Always present
    assert "providerId" in body
    assert "status" in body
    # Optional but typed
    if "errorType" in body:
        assert isinstance(body["errorType"], str)
    if "message" in body:
        assert isinstance(body["message"], str)
