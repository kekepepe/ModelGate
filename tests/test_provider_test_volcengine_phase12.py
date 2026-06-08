"""Regression tests for Volcengine Seedance GET-based probe (phase 12, V2 §22).

Tests the generation-only provider probe path in `POST /api/providers/{id}/test`.
When a provider has only generation models (no chat models), the endpoint falls
back to a GET probe against a non-existent task id. 404 = auth passed.

Self-contained: no Postgres, no Redis, no real network.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

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

# ── Fake Volcengine provider and model config ────────────────────────────────

VOLCENGINE_PROVIDER = {
    "id": "volcengine",
    "name": "Volcengine Seedance",
    "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
    "authType": "bearer",
    "envKey": "VOLCENGINE_API_KEY",
    "adapter": "volcengine_seedance",
    "enabled": True,
    "metadata": {},
}

VOLCENGINE_MODEL = {
    "id": "volcengine_seedance_1_0",
    "provider": "volcengine",
    "officialModelName": "seedance-1-0",
    "displayName": "Seedance 1.0",
    "category": "video",
    "runtime": "volcengine_seedance",
    "async": True,
    "enabled": True,
    "taskTypes": ["text_to_video"],
    "inputTypes": ["text"],
    "outputTypes": ["video"],
    "capabilities": ["text_to_video", "async_generation"],
    "paramsSchema": "video_generation_schema",
}


# ── Fixtures ─────────────────────────────────────────────────────────────────


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
    import app.services.model_registry as mr_module
    import app.services.provider_secrets as provider_secrets_module

    monkeypatch.setattr(session_module, "engine", test_engine)
    monkeypatch.setattr(session_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "engine", test_engine)
    monkeypatch.setattr(startup_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "Redis", _FakeRedis)
    monkeypatch.setattr(startup_module, "sync_registry_to_db", lambda *a, **k: None)
    monkeypatch.setattr(provider_secrets_module, "SessionLocal", TestSessionLocal)

    # Skip registry validation — our injected model uses a non-standard provider id
    monkeypatch.setattr(mr_module.ModelRegistry, "validate", lambda self: None)

    def _get_db_override():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db_override
    db_models.Base.metadata.create_all(test_engine)

    # Patch model_registry to include Volcengine provider and model

    original_providers = mr_module.model_registry.providers.copy()
    original_models = mr_module.model_registry.models.copy()

    # Add Volcengine provider (avoid duplicates)
    if not any(p["id"] == "volcengine" for p in original_providers):
        mr_module.model_registry._cached_properties = {}
        monkeypatch.setattr(
            type(mr_module.model_registry), "providers",
            property(lambda self: original_providers + [VOLCENGINE_PROVIDER]),
        )
    if not any(m["id"] == "volcengine_seedance_1_0" for m in original_models):
        monkeypatch.setattr(
            type(mr_module.model_registry), "models",
            property(lambda self: original_models + [VOLCENGINE_MODEL]),
        )

    with TestClient(app) as c:
        yield c, TestSessionLocal

    app.dependency_overrides.clear()
    test_engine.dispose()


def _seed_volcengine_key(SessionLocal) -> None:
    with SessionLocal() as session:
        set_local_provider_secret("volcengine", "sk-fake-volcengine-key-1234567890", session)


def _mock_get_response(status_code: int, body: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        json=body if body is not None else {},
        request=httpx.Request("GET", "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/probe"),
    )


class _AsyncClientGetCtx:
    """Async context manager that replaces httpx.AsyncClient for GET probe tests."""

    def __init__(self, handler):
        self._handler = handler

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def get(self, url, headers=None):
        result = self._handler(url=url, headers=headers)
        if isinstance(result, Exception):
            raise result
        return result


def _patch_httpx_get(handler):
    """Return a monkeypatch-style context manager for httpx.AsyncClient.get."""
    def _factory(*args, **kwargs):
        return _AsyncClientGetCtx(handler)
    return patch("app.api.providers.httpx.AsyncClient", _factory)


# ── Tests ────────────────────────────────────────────────────────────────────


def test_volcengine_404_means_ok(client) -> None:
    """404 from GET probe = auth passed, endpoint reachable."""
    c, SessionLocal = client
    _seed_volcengine_key(SessionLocal)

    def handler(url, headers):
        return _mock_get_response(404, {"error": {"message": "Task not found"}})

    with _patch_httpx_get(handler):
        response = c.post("/api/providers/volcengine/test")

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "ok"
    assert body["providerId"] == "volcengine"
    assert "Connected" in body["message"]


def test_volcengine_401_auth_failed(client) -> None:
    c, SessionLocal = client
    _seed_volcengine_key(SessionLocal)

    def handler(url, headers):
        return _mock_get_response(401, {"error": {"message": "Invalid key"}})

    with _patch_httpx_get(handler):
        response = c.post("/api/providers/volcengine/test")

    body = response.json()["data"]
    assert body["status"] == "auth_failed"
    assert body["errorType"] == "PROVIDER_AUTH_FAILED"


def test_volcengine_403_forbidden(client) -> None:
    c, SessionLocal = client
    _seed_volcengine_key(SessionLocal)

    def handler(url, headers):
        return _mock_get_response(403, {"error": {"message": "Access denied"}})

    with _patch_httpx_get(handler):
        response = c.post("/api/providers/volcengine/test")

    body = response.json()["data"]
    assert body["status"] == "forbidden"
    assert body["errorType"] == "PROVIDER_FORBIDDEN"


def test_volcengine_429_rate_limited(client) -> None:
    c, SessionLocal = client
    _seed_volcengine_key(SessionLocal)

    def handler(url, headers):
        return _mock_get_response(429, {"error": {"message": "Rate limited"}})

    with _patch_httpx_get(handler):
        response = c.post("/api/providers/volcengine/test")

    body = response.json()["data"]
    assert body["status"] == "rate_limited"
    assert body["errorType"] == "PROVIDER_RATE_LIMITED"


def test_volcengine_500_server_error(client) -> None:
    c, SessionLocal = client
    _seed_volcengine_key(SessionLocal)

    def handler(url, headers):
        return _mock_get_response(503, {"error": {"message": "Internal error"}})

    with _patch_httpx_get(handler):
        response = c.post("/api/providers/volcengine/test")

    body = response.json()["data"]
    assert body["status"] == "server_error"
    assert body["errorType"] == "PROVIDER_SERVER_ERROR"


def test_volcengine_timeout(client) -> None:
    c, SessionLocal = client
    _seed_volcengine_key(SessionLocal)

    def handler(url, headers):
        return httpx.ReadTimeout("Read timeout", request=httpx.Request("GET", url))

    with _patch_httpx_get(handler):
        response = c.post("/api/providers/volcengine/test")

    body = response.json()["data"]
    assert body["status"] == "timeout"
    assert body["errorType"] == "PROVIDER_TIMEOUT"


def test_volcengine_connect_error(client) -> None:
    c, SessionLocal = client
    _seed_volcengine_key(SessionLocal)

    def handler(url, headers):
        return httpx.ConnectError("Connection refused", request=httpx.Request("GET", url))

    with _patch_httpx_get(handler):
        response = c.post("/api/providers/volcengine/test")

    body = response.json()["data"]
    assert body["status"] == "unreachable"
    assert body["errorType"] == "PROVIDER_CONNECT_ERROR"


def test_volcengine_missing_key(client) -> None:
    """No API key configured should return missing_key."""
    c, _ = client
    response = c.post("/api/providers/volcengine/test")
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "missing_key"
    assert body["errorType"] == "PROVIDER_AUTH_MISSING"


def test_response_shape_contract_volcengine(client) -> None:
    """V2 frontend relies on these field names — keep them stable."""
    c, SessionLocal = client
    _seed_volcengine_key(SessionLocal)

    def handler(url, headers):
        return _mock_get_response(404)

    with _patch_httpx_get(handler):
        response = c.post("/api/providers/volcengine/test")

    body = response.json()["data"]
    assert "providerId" in body
    assert "status" in body
    assert body["providerId"] == "volcengine"
