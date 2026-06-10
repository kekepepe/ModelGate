"""Regression tests for compare_group_id support (phase 12, V2 C4).

Tests that:
- `POST /api/runs` accepts `compareGroupId` and stores it in `runs.metadata_json`
- `GET /api/usage/logs?compareGroupId=` filters by compare group

Self-contained: no Postgres, no Redis, no real network.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import models as db_models  # noqa: E402
from app.db.models import Run, UsageLog  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402

# ── Fixtures ─────────────────────────────────────────────────────────────────


class _FakeRedis:
    def __init__(self, *args, **kwargs) -> None:
        pass

    @classmethod
    def from_url(cls, *args, **kwargs) -> _FakeRedis:
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


def _seed_run_with_group(SessionLocal, run_id: str, group_id: str | None) -> None:
    now = datetime.now(UTC)
    with SessionLocal() as session:
        run = Run(
            id=run_id,
            task_type="chat",
            provider_id="mimo",
            model_id="mimo-chat",
            input_json={"prompt": "hello"},
            params_json={},
            status="completed",
            metadata_json={"compare_group_id": group_id} if group_id else None,
            created_at=now,
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
            created_at=now,
        )
        session.add(usage)
        session.commit()


# ── Tests ────────────────────────────────────────────────────────────────────


def test_run_metadata_json_stores_compare_group(client) -> None:
    c, SessionLocal = client

    mock_run = Run(
        id="run-test",
        task_type="chat",
        provider_id="mimo",
        model_id="mimo-chat",
        input_json={"prompt": "hi"},
        params_json={},
        status="completed",
        metadata_json={"compare_group_id": "group-abc"},
        created_at=datetime.now(UTC),
    )

    with patch("app.api.chat.chat_runtime") as mock_rt:
        mock_rt.run_chat = AsyncMock(return_value=mock_run)
        resp = c.post(
            "/api/chat/runs",
            json={
                "taskType": "chat",
                "modelId": "mimo-chat",
                "prompt": "hi",
                "compareGroupId": "group-abc",
            },
        )

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["metadata"]["compare_group_id"] == "group-abc"


def test_run_without_compare_group(client) -> None:
    c, _ = client

    mock_run = Run(
        id="run-nogroup",
        task_type="chat",
        provider_id="mimo",
        model_id="mimo-chat",
        input_json={"prompt": "hi"},
        params_json={},
        status="completed",
        created_at=datetime.now(UTC),
    )

    with patch("app.api.chat.chat_runtime") as mock_rt:
        mock_rt.run_chat = AsyncMock(return_value=mock_run)
        resp = c.post(
            "/api/chat/runs",
            json={
                "taskType": "chat",
                "modelId": "mimo-chat",
                "prompt": "hi",
            },
        )

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["metadata"] is None


def test_list_logs_filter_by_compare_group(client) -> None:
    c, SessionLocal = client
    _seed_run_with_group(SessionLocal, "run-g1a", "group-1")
    _seed_run_with_group(SessionLocal, "run-g1b", "group-1")
    _seed_run_with_group(SessionLocal, "run-g2", "group-2")
    _seed_run_with_group(SessionLocal, "run-none", None)

    resp = c.get("/api/usage/logs?compareGroupId=group-1")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 2
    record_ids = {d["recordId"] for d in data}
    assert record_ids == {"run-g1a", "run-g1b"}


def test_list_logs_no_filter_returns_all(client) -> None:
    c, SessionLocal = client
    _seed_run_with_group(SessionLocal, "run-all-a", "group-x")
    _seed_run_with_group(SessionLocal, "run-all-b", None)

    resp = c.get("/api/usage/logs")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 2
