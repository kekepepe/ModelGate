"""Tests for Project Mode V2.x — delete cascade (phase 19).

Repros the bug where DELETE /api/projects/{id} returns 500 on Postgres because
SQLAlchemy bulk delete of project_tasks violates the self-referential
parent_task_id FK. SQLite default behavior masks this — we enable
PRAGMA foreign_keys=ON to make the test environment match Postgres.

Self-contained: no Postgres, no Redis, no real network.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import models as db_models  # noqa: E402
from app.main import app  # noqa: E402


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

    # Match Postgres FK behavior: SQLite ignores FKs unless we ask.
    # Without this, the self-referential parent_task_id FK violation that
    # exists in production (Postgres) is silently allowed in tests.
    @event.listens_for(test_engine, "connect")
    def _set_sqlite_fk(dbapi_connection, _conn_record):  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

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

    from app.db.session import get_db

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


def _make_project_run(session, *, run_id: str = "run-1") -> str:
    pr = db_models.ProjectRun(
        id=run_id,
        title="t",
        goal="g",
        status="completed",
        mode="plan_only",
    )
    session.add(pr)
    session.commit()
    return pr.id


def _make_task(session, *, task_id: str, run_id: str, parent_id: str | None = None) -> str:
    task = db_models.ProjectTask(
        id=task_id,
        project_run_id=run_id,
        parent_task_id=parent_id,
        title=f"task {task_id}",
        role="worker",
        status="completed",
    )
    session.add(task)
    session.commit()
    return task.id


class TestDeleteProjectRunCascade:
    def test_delete_with_subtasks_succeeds(self, client):
        """Run with a parent task and a child task (parent_task_id set).

        Pre-fix on Postgres / SQLite-with-FK-on: bulk delete of project_tasks
        violates the self-referential parent_task_id FK → 500.
        """
        c, SessionLocal = client
        with SessionLocal() as db:
            run_id = _make_project_run(db, run_id="run-with-subtasks")
            parent_id = _make_task(db, task_id="t-parent", run_id=run_id)
            _make_task(db, task_id="t-child", run_id=run_id, parent_id=parent_id)

        response = c.delete(f"/api/projects/{run_id}")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["data"]["deleted"] is True
        assert body["data"]["id"] == run_id

        with SessionLocal() as db:
            assert db.query(db_models.ProjectRun).filter_by(id=run_id).first() is None
            assert db.query(db_models.ProjectTask).filter_by(project_run_id=run_id).count() == 0

    def test_delete_with_agent_runs_and_artifacts_succeeds(self, client):
        """Run with tasks, agent_runs (FK → tasks), and artifacts (FK → tasks + agent_runs).

        Verifies the full delete order works even when leaf rows reference
        rows that will also be deleted in this transaction.
        """
        c, SessionLocal = client
        with SessionLocal() as db:
            run_id = _make_project_run(db, run_id="run-with-children")
            parent_id = _make_task(db, task_id="tx-parent", run_id=run_id)
            child_id = _make_task(db, task_id="tx-child", run_id=run_id, parent_id=parent_id)

            agent_run = db_models.AgentRun(
                id="ar-1",
                project_run_id=run_id,
                task_id=child_id,
                role="worker",
                status="completed",
            )
            db.add(agent_run)
            db.commit()

            artifact = db_models.Artifact(
                id="art-1",
                project_run_id=run_id,
                task_id=child_id,
                agent_run_id="ar-1",
                type="patch",
                name="art-1",
            )
            mem = db_models.ProjectMemory(
                id="mem-1",
                project_run_id=run_id,
                type="note",
                content="x",
            )
            db.add_all([artifact, mem])
            db.commit()

        response = c.delete(f"/api/projects/{run_id}")
        assert response.status_code == 200, response.text

        with SessionLocal() as db:
            assert db.query(db_models.ProjectRun).filter_by(id=run_id).first() is None
            assert db.query(db_models.ProjectTask).filter_by(project_run_id=run_id).count() == 0
            assert db.query(db_models.AgentRun).filter_by(project_run_id=run_id).count() == 0
            assert db.query(db_models.Artifact).filter_by(project_run_id=run_id).count() == 0
            assert db.query(db_models.ProjectMemory).filter_by(project_run_id=run_id).count() == 0

    def test_delete_nonexistent_returns_404(self, client):
        c, _ = client
        response = c.delete("/api/projects/does-not-exist")
        assert response.status_code == 404
