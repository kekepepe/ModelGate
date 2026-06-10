"""Tests for Project Mode V2.5 API contract (phase 17).

Self-contained: SQLite in-memory + chat_runtime mocked, so endpoints work
without Postgres / Redis / real LLM providers.
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
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
    def from_url(cls, *a, **k):
        return cls()

    def ping(self):
        return None

    def close(self):
        return None


class _FakeRun:
    def __init__(self, text: str) -> None:
        self.id = f"run_{uuid4().hex}"
        self.output_json = {"text": text}
        self.started_at = datetime.now(UTC)
        self.completed_at = datetime.now(UTC)


_CANNED = {
    "intake": json.dumps(
        {
            "summary": "S",
            "goal": "G",
            "project_area": ["backend"],
            "risk_level": "low",
            "requires_repo_access": False,
            "expected_outputs": ["plan"],
        }
    ),
    "planner": json.dumps(
        {
            "summary": "P",
            "project_title": "X",
            "tasks": [
                {
                    "id": "t1",
                    "title": "Backend",
                    "role": "backend",
                    "allowed_files": ["x.py"],
                    "acceptance_criteria": ["ok"],
                    "depends_on": [],
                },
            ],
            "parallel_groups": [["t1"]],
        }
    ),
    "worker": json.dumps(
        {
            "summary": "do x",
            "files_to_change": ["x.py"],
            "proposed_changes": [
                {"file": "x.py", "change_kind": "modify", "description": "do thing"}
            ],
            "tests": [],
            "risks": [],
            "questions": [],
        }
    ),
    "supervisor": json.dumps(
        {
            "summary": "ok",
            "pass": True,
            "blocking_issues": [],
            "non_blocking_issues": [],
            "missing_tests": [],
            "conflicts": [],
            "next_actions": [],
        }
    ),
    "integrator": json.dumps(
        {
            "summary": "done",
            "final_plan": "# Plan",
            "ordered_changes": [],
            "test_commands": [],
            "risks": [],
            "rollback": "git revert",
            "progress_update": "## ok",
            "decisions_update": "### D",
        }
    ),
}


@pytest.fixture
def client(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    import app.core.startup as startup_module
    import app.db.session as session_module
    import app.services.project_runtime.orchestrator as orch_module
    import app.services.provider_secrets as provider_secrets_module

    monkeypatch.setattr(session_module, "engine", engine)
    monkeypatch.setattr(session_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "engine", engine)
    monkeypatch.setattr(startup_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "Redis", _FakeRedis)
    monkeypatch.setattr(startup_module, "sync_registry_to_db", lambda *a, **k: None)
    monkeypatch.setattr(provider_secrets_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(orch_module, "SessionLocal", TestSessionLocal)

    # Mock chat_runtime.
    from app.services.project_runtime import agents as agents_module

    async def fake_run_chat(**kwargs):
        sys_prompt = (kwargs.get("system_prompt") or "").lower()
        if "intake agent" in sys_prompt:
            role = "intake"
        elif "planner agent" in sys_prompt:
            role = "planner"
        elif "supervisor agent" in sys_prompt:
            role = "supervisor"
        elif "integrator agent" in sys_prompt:
            role = "integrator"
        else:
            role = "worker"
        await asyncio.sleep(0.01)
        return _FakeRun(_CANNED[role])

    monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

    from app.db.session import get_db

    def _get_db_override():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db_override
    db_models.Base.metadata.create_all(engine)

    with TestClient(app) as c:
        yield c, TestSessionLocal

    app.dependency_overrides.clear()
    engine.dispose()


def _wait_for_status_sync(SL, pr_id: str, target: set[str], timeout: float = 5.0):
    """Poll the DB until status reaches one of the targets."""
    import time

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with SL() as s:
            pr = s.query(db_models.ProjectRun).filter_by(id=pr_id).first()
            if pr and pr.status in target:
                return pr.status
        time.sleep(0.05)
    return None


class TestCreateAndList:
    def test_create_project_run(self, client):
        c, SL = client
        r = c.post(
            "/api/projects",
            json={
                "goal": "Add health endpoint",
                "title": "Health Check",
                "plannerModelId": "gpt-4o",
                "budget": {"maxAgents": 10},
            },
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["goal"] == "Add health endpoint"
        assert data["title"] == "Health Check"
        assert data["status"] in {"pending", "running", "awaiting_approval"}
        assert data["id"].startswith("pr_")

    def test_create_requires_goal(self, client):
        c, _ = client
        r = c.post("/api/projects", json={"title": "x"})
        assert r.status_code == 422

    def test_list_project_runs(self, client):
        c, _ = client
        c.post("/api/projects", json={"goal": "a"})
        c.post("/api/projects", json={"goal": "b"})

        r = c.get("/api/projects")
        assert r.status_code == 200
        rows = r.json()["data"]
        assert len(rows) >= 2


class TestGetDetails:
    def test_get_missing_returns_404(self, client):
        c, _ = client
        r = c.get("/api/projects/pr_nope")
        assert r.status_code == 404

    def test_get_details_after_planner(self, client):
        c, SL = client
        r = c.post(
            "/api/projects",
            json={
                "goal": "Add health",
                "plannerModelId": "gpt-4o",
                "budget": {"maxAgents": 10},
            },
        )
        pr_id = r.json()["data"]["id"]

        # Wait for Planner stage to finish.
        _wait_for_status_sync(SL, pr_id, {"awaiting_approval", "failed"}, timeout=5.0)

        r = c.get(f"/api/projects/{pr_id}")
        assert r.status_code == 200
        body = r.json()["data"]
        assert body["projectRun"]["id"] == pr_id
        assert isinstance(body["tasks"], list)
        assert isinstance(body["agentRuns"], list)
        assert isinstance(body["artifacts"], list)


class TestApprove:
    def test_approve_wrong_status_returns_409(self, client):
        c, _ = client
        # Create then immediately try to approve (status is pending/running)
        r = c.post("/api/projects", json={"goal": "x"})
        pr_id = r.json()["data"]["id"]
        r = c.post(f"/api/projects/{pr_id}/approve", json={})
        # Either 409 (if still running) or 422 (no tasks)
        assert r.status_code in {409, 422}

    def test_approve_missing_returns_404(self, client):
        c, _ = client
        r = c.post("/api/projects/pr_nope/approve", json={})
        assert r.status_code == 404

    def test_full_approve_flow_completes(self, client):
        c, SL = client
        r = c.post(
            "/api/projects",
            json={
                "goal": "Add health",
                "plannerModelId": "gpt-4o",
                "budget": {"maxAgents": 10},
            },
        )
        pr_id = r.json()["data"]["id"]

        _wait_for_status_sync(SL, pr_id, {"awaiting_approval"}, timeout=5.0)

        r = c.post(f"/api/projects/{pr_id}/approve", json={})
        assert r.status_code == 200

        status = _wait_for_status_sync(SL, pr_id, {"completed", "failed"}, timeout=10.0)
        assert status == "completed"


class TestCancel:
    def test_cancel_missing_returns_404(self, client):
        c, _ = client
        r = c.post("/api/projects/pr_nope/cancel")
        assert r.status_code == 404

    def test_cancel_running_run(self, client):
        c, SL = client
        # Manually create a "running" run.
        pr_id = f"pr_{uuid4().hex}"
        with SL() as s:
            s.add(
                db_models.ProjectRun(
                    id=pr_id,
                    title="t",
                    goal="g",
                    status="running",
                )
            )
            s.commit()

        r = c.post(f"/api/projects/{pr_id}/cancel")
        assert r.status_code == 200
        with SL() as s:
            pr = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()
            assert pr.status == "cancelled"


class TestArtifact:
    def test_get_artifact(self, client):
        c, SL = client
        pr_id = f"pr_{uuid4().hex}"
        with SL() as s:
            s.add(db_models.ProjectRun(id=pr_id, title="t", goal="g", status="running"))
            s.commit()

        from app.services.project_runtime.artifacts import write_artifact

        with SL() as s:
            art = write_artifact(
                db=s,
                project_run_id=pr_id,
                artifact_type="plan",
                name="plan.json",
                content={"hello": "world"},
            )
            art_id = art.id

        r = c.get(f"/api/projects/{pr_id}/artifacts/{art_id}")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["content"] == {"hello": "world"}
        assert data["contentKind"] == "json"

    def test_get_missing_artifact(self, client):
        c, SL = client
        pr_id = f"pr_{uuid4().hex}"
        with SL() as s:
            s.add(db_models.ProjectRun(id=pr_id, title="t", goal="g", status="running"))
            s.commit()

        r = c.get(f"/api/projects/{pr_id}/artifacts/art_nope")
        assert r.status_code == 404


class TestDelete:
    def test_delete_missing_returns_404(self, client):
        c, _ = client
        r = c.delete("/api/projects/pr_nope")
        assert r.status_code == 404

    def test_delete_cascades_children(self, client):
        c, SL = client
        pr_id = f"pr_{uuid4().hex}"
        with SL() as s:
            s.add(db_models.ProjectRun(id=pr_id, title="t", goal="g", status="completed"))
            s.add(
                db_models.ProjectTask(
                    id=f"t_{uuid4().hex}",
                    project_run_id=pr_id,
                    title="x",
                    description="d",
                    role="backend",
                    status="pending",
                    priority=1,
                )
            )
            s.add(
                db_models.AgentRun(
                    id=f"ag_{uuid4().hex}",
                    project_run_id=pr_id,
                    role="worker",
                    status="completed",
                )
            )
            s.add(
                db_models.ProjectMemory(
                    id=f"m_{uuid4().hex}",
                    project_run_id=pr_id,
                    type="note",
                    content='{"k": "v"}',
                )
            )
            s.commit()

            from app.services.project_runtime.artifacts import write_artifact

            art = write_artifact(
                db=s,
                project_run_id=pr_id,
                artifact_type="plan",
                name="plan.json",
                content={"x": 1},
            )
            art_id = art.id

        r = c.delete(f"/api/projects/{pr_id}")
        assert r.status_code == 200
        body = r.json()["data"]
        assert body["deleted"] is True
        assert body["id"] == pr_id

        # Verify all child rows are gone.
        with SL() as s:
            assert s.query(db_models.ProjectRun).filter_by(id=pr_id).first() is None
            assert s.query(db_models.ProjectTask).filter_by(project_run_id=pr_id).count() == 0
            assert s.query(db_models.AgentRun).filter_by(project_run_id=pr_id).count() == 0
            assert s.query(db_models.Artifact).filter_by(project_run_id=pr_id).count() == 0
            assert s.query(db_models.ProjectMemory).filter_by(project_run_id=pr_id).count() == 0
            assert s.query(db_models.Artifact).filter_by(id=art_id).first() is None

    def test_delete_works_in_any_state(self, client):
        c, SL = client
        for status in [
            "pending",
            "running",
            "awaiting_approval",
            "completed",
            "failed",
            "cancelled",
            "budget_exceeded",
        ]:
            pr_id = f"pr_{uuid4().hex}"
            with SL() as s:
                s.add(db_models.ProjectRun(id=pr_id, title="t", goal="g", status=status))
                s.commit()

            r = c.delete(f"/api/projects/{pr_id}")
            assert r.status_code == 200, f"delete failed for status={status}"


class TestAgentRunPrompt:
    def test_agent_run_includes_prompt_field(self, client):
        c, SL = client
        pr_id = f"pr_{uuid4().hex}"
        ag_id = f"ag_{uuid4().hex}"
        prompt_text = "You are a planner agent.\n\n# Goal\nAdd /health endpoint"
        with SL() as s:
            s.add(
                db_models.ProjectRun(
                    id=pr_id,
                    title="t",
                    goal="g",
                    status="awaiting_approval",
                )
            )
            s.add(
                db_models.AgentRun(
                    id=ag_id,
                    project_run_id=pr_id,
                    role="planner",
                    status="completed",
                    prompt=prompt_text,
                    input_tokens=10,
                    output_tokens=20,
                    total_tokens=30,
                    latency_ms=100,
                )
            )
            s.commit()

        r = c.get(f"/api/projects/{pr_id}")
        assert r.status_code == 200
        runs = r.json()["data"]["agentRuns"]
        planner = next(a for a in runs if a["id"] == ag_id)
        assert planner["prompt"] == prompt_text
        assert planner["totalTokens"] == 30
        assert planner["latencyMs"] == 100

    def test_agent_run_prompt_null_when_not_set(self, client):
        c, SL = client
        pr_id = f"pr_{uuid4().hex}"
        ag_id = f"ag_{uuid4().hex}"
        with SL() as s:
            s.add(
                db_models.ProjectRun(
                    id=pr_id,
                    title="t",
                    goal="g",
                    status="running",
                )
            )
            s.add(
                db_models.AgentRun(
                    id=ag_id,
                    project_run_id=pr_id,
                    role="intake",
                    status="pending",
                    prompt=None,
                )
            )
            s.commit()

        r = c.get(f"/api/projects/{pr_id}")
        assert r.status_code == 200
        intake = r.json()["data"]["agentRuns"][0]
        assert intake["prompt"] is None
