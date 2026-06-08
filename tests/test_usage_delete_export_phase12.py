"""Regression tests for DELETE /api/usage/logs and GET /api/usage/export (phase 12, V2 §21).

Self-contained: no Postgres, no Redis, no real network.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import models as db_models  # noqa: E402
from app.db.models import RequestLog, Run, UsageLog  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402


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

    monkeypatch.setattr(session_module, "engine", test_engine)
    monkeypatch.setattr(session_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "engine", test_engine)
    monkeypatch.setattr(startup_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "Redis", _FakeRedis)
    monkeypatch.setattr(startup_module, "sync_registry_to_db", lambda *a, **k: None)

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


def _seed_run(SessionLocal, run_id: str, created_at: datetime) -> None:
    with SessionLocal() as session:
        run = Run(
            id=run_id,
            task_type="chat",
            provider_id="mimo",
            model_id="mimo-chat",
            input_json={"prompt": "hello"},
            params_json={},
            status="completed",
            created_at=created_at,
        )
        session.add(run)

        usage = UsageLog(
            id=f"ul-{run_id}",
            record_type="run",
            record_id=run_id,
            provider_id="mimo",
            model_id="mimo-chat",
            input_tokens=10,
            output_tokens=20,
            total_tokens=30,
            created_at=created_at,
        )
        session.add(usage)

        req = RequestLog(
            id=f"req-{run_id}",
            record_type="run",
            record_id=run_id,
            provider_id="mimo",
            model_id="mimo-chat",
            status_code=200,
            latency_ms=500,
            created_at=created_at,
        )
        session.add(req)
        session.commit()


# ── DELETE single ────────────────────────────────────────────────────────────


def test_delete_single_existing(client) -> None:
    c, SessionLocal = client
    now = datetime.now(timezone.utc)
    _seed_run(SessionLocal, "run-1", now)

    resp = c.delete("/api/usage/logs/ul-run-1")
    assert resp.status_code == 200
    data = resp.json()["data"]["deleted"]
    assert data["usageLogs"] == 1
    assert data["runs"] == 1
    assert data["requestLogs"] == 1

    # Verify they are gone
    with SessionLocal() as session:
        assert session.get(UsageLog, "ul-run-1") is None
        assert session.get(Run, "run-1") is None
        assert session.get(RequestLog, "req-run-1") is None


def test_delete_single_not_found(client) -> None:
    c, _ = client
    resp = c.delete("/api/usage/logs/nonexistent")
    assert resp.status_code == 404


# ── DELETE batch ─────────────────────────────────────────────────────────────


def test_delete_batch_older_than(client) -> None:
    c, SessionLocal = client
    now = datetime.now(timezone.utc)
    old = now - timedelta(days=30)
    recent = now - timedelta(hours=1)

    _seed_run(SessionLocal, "old-run", old)
    _seed_run(SessionLocal, "recent-run", recent)

    cutoff = now - timedelta(days=7)
    resp = c.delete(f"/api/usage/logs?olderThan={cutoff.strftime('%Y-%m-%dT%H:%M:%SZ')}")
    assert resp.status_code == 200
    data = resp.json()["data"]["deleted"]
    assert data["usageLogs"] == 1
    assert data["runs"] == 1

    # Recent record still exists
    with SessionLocal() as session:
        assert session.get(UsageLog, "ul-recent-run") is not None
        assert session.get(Run, "recent-run") is not None


def test_delete_batch_empty(client) -> None:
    c, _ = client
    cutoff = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    resp = c.delete(f"/api/usage/logs?olderThan={cutoff}")
    assert resp.status_code == 200
    data = resp.json()["data"]["deleted"]
    assert data["usageLogs"] == 0


# ── Export JSON ──────────────────────────────────────────────────────────────


def test_export_usage_logs_json(client) -> None:
    c, SessionLocal = client
    now = datetime.now(timezone.utc)
    _seed_run(SessionLocal, "run-export", now)

    resp = c.get("/api/usage/export?scope=usageLogs&format=json")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) >= 1
    assert data[0]["recordType"] == "run"
    assert data[0]["providerId"] == "mimo"


def test_export_runs_json(client) -> None:
    c, SessionLocal = client
    now = datetime.now(timezone.utc)
    _seed_run(SessionLocal, "run-export2", now)

    resp = c.get("/api/usage/export?scope=runs&format=json")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) >= 1
    assert data[0]["taskType"] == "chat"


def test_export_request_logs_json(client) -> None:
    c, SessionLocal = client
    now = datetime.now(timezone.utc)
    _seed_run(SessionLocal, "run-export3", now)

    resp = c.get("/api/usage/export?scope=requestLogs&format=json")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) >= 1
    assert data[0]["statusCode"] == 200


def test_export_mask_json(client) -> None:
    c, SessionLocal = client
    now = datetime.now(timezone.utc)
    _seed_run(SessionLocal, "run-mask", now)

    resp = c.get("/api/usage/export?scope=runs&format=json&mask=true")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) >= 1
    # Short strings should not be masked
    assert data[0]["taskType"] == "chat"


def test_export_older_than(client) -> None:
    c, SessionLocal = client
    now = datetime.now(timezone.utc)
    old = now - timedelta(days=30)
    recent = now - timedelta(hours=1)

    _seed_run(SessionLocal, "old-exp", old)
    _seed_run(SessionLocal, "recent-exp", recent)

    cutoff = (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    resp = c.get(f"/api/usage/export?scope=usageLogs&format=json&olderThan={cutoff}")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 1
    assert data[0]["recordId"] == "old-exp"


# ── Export ZIP ───────────────────────────────────────────────────────────────


def test_export_zip(client) -> None:
    c, SessionLocal = client
    now = datetime.now(timezone.utc)
    _seed_run(SessionLocal, "run-zip", now)

    resp = c.get("/api/usage/export?scope=usageLogs&format=zip")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert "attachment" in resp.headers.get("content-disposition", "")


# ── Invalid scope/format ────────────────────────────────────────────────────


def test_export_invalid_scope(client) -> None:
    c, _ = client
    resp = c.get("/api/usage/export?scope=invalid&format=json")
    assert resp.status_code == 400


def test_export_invalid_format(client) -> None:
    c, _ = client
    resp = c.get("/api/usage/export?scope=usageLogs&format=csv")
    assert resp.status_code == 400
