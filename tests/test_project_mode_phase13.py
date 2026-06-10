"""Tests for Project Mode V2.5 building blocks (phase 13).

Covers: schema validation, budget tracker, artifact storage.
Self-contained: no Postgres, no Redis, no real network.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import models as db_models  # noqa: E402
from app.main import app  # noqa: E402
from app.services.project_runtime.budget import Budget, BudgetExceeded, BudgetTracker  # noqa: E402
from app.services.project_runtime.schemas import (  # noqa: E402
    IntakeOutput,
    IntegratorOutput,
    PlannerOutput,
    SupervisorOutput,
    WorkerOutput,
    validate_agent_output,
)


# ── Fixture (same pattern as phase11) ────────────────────────────────────────
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
    test_engine.dispose()


# ── Schema tests ─────────────────────────────────────────────────────────────


class TestSchemas:
    def test_validate_intake_output(self):
        data = {
            "summary": "Test project intake",
            "goal": "Add health checks to API Keys page",
            "project_area": ["backend", "frontend"],
            "risk_level": "medium",
            "requires_repo_access": True,
            "expected_outputs": ["design plan", "patches"],
        }
        result = validate_agent_output("intake", data)
        assert isinstance(result, IntakeOutput)
        assert result.goal == data["goal"]

    def test_validate_intake_invalid_risk_level(self):
        with pytest.raises(ValueError, match="Agent output failed schema"):
            validate_agent_output(
                "intake",
                {
                    "summary": "bad",
                    "goal": "x",
                    "risk_level": "extreme",
                },
            )

    def test_validate_planner_output(self):
        data = {
            "summary": "Plan for health checks",
            "project_title": "API Keys Health V2",
            "tasks": [
                {
                    "id": "t1",
                    "title": "Backend health endpoint",
                    "description": "Add POST /api/providers/{id}/health",
                    "role": "backend",
                    "allowed_files": ["apps/server/app/api/providers.py"],
                    "acceptance_criteria": ["pytest passes"],
                    "depends_on": [],
                },
                {
                    "id": "t2",
                    "title": "Frontend health button",
                    "role": "frontend",
                },
            ],
            "parallel_groups": [["t1", "t2"]],
        }
        result = validate_agent_output("planner", data)
        assert isinstance(result, PlannerOutput)
        assert len(result.tasks) == 2

    def test_validate_planner_empty_tasks(self):
        with pytest.raises(ValueError, match="Agent output failed schema"):
            validate_agent_output(
                "planner",
                {
                    "summary": "empty",
                    "project_title": "x",
                    "tasks": [],
                },
            )

    def test_validate_worker_output(self):
        data = {
            "summary": "Add health endpoint",
            "files_to_change": ["apps/server/app/api/providers.py"],
            "proposed_changes": [
                {
                    "file": "apps/server/app/api/providers.py",
                    "change_kind": "modify",
                    "description": "Add POST health endpoint",
                }
            ],
            "tests": ["tests/test_provider_test_phase11.py"],
            "risks": ["None"],
            "questions": [],
        }
        result = validate_agent_output("worker", data)
        assert isinstance(result, WorkerOutput)
        assert result.files_to_change[0] == "apps/server/app/api/providers.py"

    def test_validate_supervisor_output(self):
        data = {
            "summary": "Review passed",
            "pass": True,
            "blocking_issues": [],
            "non_blocking_issues": ["No tests for migration"],
            "missing_tests": ["test_migration.py"],
            "conflicts": [],
            "next_actions": ["Add missing tests"],
        }
        result = validate_agent_output("supervisor", data)
        assert isinstance(result, SupervisorOutput)
        assert result.pass_check is True

    def test_validate_integrator_output(self):
        data = {
            "summary": "Final plan generated",
            "final_plan": "# Implementation Plan\n\n1. Add endpoint\n2. Add button\n",
            "ordered_changes": [{"step": 1, "file": "x.py", "what": "add"}],
            "test_commands": ["pytest -v"],
            "risks": [],
            "rollback": "git revert",
            "progress_update": "## Stage 1 done",
            "decisions_update": "### D-2026-06-08-01",
        }
        result = validate_agent_output("integrator", data)
        assert isinstance(result, IntegratorOutput)
        assert "Implementation Plan" in result.final_plan

    def test_validate_unknown_role(self):
        with pytest.raises(ValueError, match="Unknown agent role"):
            validate_agent_output("unknown", {"summary": "x"})

    def test_validate_minimal_planner(self):
        """Planner needs at least 1 task."""
        data = {
            "summary": "minimal",
            "project_title": "Minimal",
            "tasks": [{"id": "t1", "title": "Do thing", "role": "backend"}],
        }
        result = validate_agent_output("planner", data)
        assert len(result.tasks) == 1


# ── Budget tracker tests ─────────────────────────────────────────────────────


class TestBudget:
    def test_default_budget(self):
        b = Budget()
        assert b.max_agents == 6
        assert b.max_tokens == 200_000
        assert b.max_runtime_seconds == 600

    def test_budget_from_dict(self):
        b = Budget.from_dict({"maxAgents": 3, "maxTokens": 1000})
        assert b.max_agents == 3
        assert b.max_tokens == 1000
        assert b.max_runtime_seconds == 600  # default

    def test_budget_from_empty(self):
        b = Budget.from_dict(None)
        assert b.max_agents == 6

    def test_budget_to_dict(self):
        b = Budget(max_agents=2)
        d = b.to_dict()
        assert d["maxAgents"] == 2

    def test_tracker_reserve_agent_happy(self):
        b = Budget(max_agents=2)
        t = BudgetTracker(budget=b)
        t.reserve_agent()
        t.reserve_agent()
        assert t.agents_used == 2

    def test_tracker_reserve_agent_exceeded(self):
        b = Budget(max_agents=1)
        t = BudgetTracker(budget=b)
        t.reserve_agent()
        with pytest.raises(BudgetExceeded, match="Agent budget exceeded"):
            t.reserve_agent()

    def test_tracker_add_tokens_happy(self):
        t = BudgetTracker(budget=Budget(max_tokens=10_000))
        t.add_tokens(3_000)
        t.add_tokens(4_000)
        assert t.tokens_used == 7_000

    def test_tracker_add_tokens_exceeded(self):
        t = BudgetTracker(budget=Budget(max_tokens=5_000))
        t.add_tokens(3_000)
        with pytest.raises(BudgetExceeded, match="Token budget exceeded"):
            t.add_tokens(3_000)

    def test_tracker_reserve_round(self):
        t = BudgetTracker(budget=Budget(max_rounds=2))
        t.reserve_round()
        t.reserve_round()
        with pytest.raises(BudgetExceeded, match="Round budget exceeded"):
            t.reserve_round()

    def test_tracker_runtime_exceeded(self):
        """Impossible to test precisely; verify the check works with a tiny budget."""
        b = Budget(max_runtime_seconds=0)
        t = BudgetTracker(budget=b)
        with pytest.raises(BudgetExceeded, match="Runtime budget exceeded"):
            t.check_runtime()

    def test_tracker_context_files_exceeded(self):
        t = BudgetTracker(budget=Budget(max_context_files=2))
        t.reserve_context_files(2)
        with pytest.raises(BudgetExceeded, match="Context file budget exceeded"):
            t.reserve_context_files(3)

    def test_tracker_usage_snapshot(self):
        t = BudgetTracker(budget=Budget(max_tokens=1000))
        t.reserve_agent()
        t.add_tokens(500)
        snap = t.usage_snapshot()
        assert snap["agentsUsed"] == 1
        assert snap["tokensUsed"] == 500
        assert snap["contextFilesUsed"] == 0
        assert "runtimeSeconds" in snap

    def test_budget_exceeded_reason(self):
        try:
            t = BudgetTracker(budget=Budget(max_agents=0))
            t.reserve_agent()
        except BudgetExceeded as e:
            assert "Agent budget exceeded" in str(e)
            assert e.limit_kind == "max_agents"


# ── Artifact tests (basic) ───────────────────────────────────────────────────


class TestArtifact:
    def test_artifact_create_and_read(self, client):
        c, SL = client
        # Seed a project_run first
        from uuid import uuid4

        pr_id = f"pr_{uuid4().hex}"
        with SL() as session:
            pr = db_models.ProjectRun(
                id=pr_id,
                title="test",
                goal="test",
                status="running",
            )
            session.add(pr)
            session.commit()

        from app.services.project_runtime.artifacts import serialize_artifact, write_artifact

        with SL() as session:
            art = write_artifact(
                db=session,
                project_run_id=pr_id,
                artifact_type="plan",
                name="test-plan.json",
                content={"key": "value", "nested": [1, 2, 3]},
            )
            assert art.type == "plan"
            assert art.name == "test-plan.json"
            assert art.content_json == {"key": "value", "nested": [1, 2, 3]}
            assert art.size_bytes > 0
            assert not art.truncated

            s = serialize_artifact(art)
            assert s["type"] == "plan"
            assert s["content"] == {"key": "value", "nested": [1, 2, 3]}
            assert s["contentKind"] == "json"

    def test_artifact_long_text_truncated(self, client):
        c, SL = client
        from uuid import uuid4

        pr_id = f"pr_{uuid4().hex}"
        with SL() as session:
            pr = db_models.ProjectRun(
                id=pr_id,
                title="test",
                goal="test",
                status="running",
            )
            session.add(pr)
            session.commit()

        from app.services.project_runtime.artifacts import MAX_ARTIFACT_BYTES, write_artifact

        big_text = "x" * (MAX_ARTIFACT_BYTES + 1024)
        with SL() as session:
            art = write_artifact(
                db=session,
                project_run_id=pr_id,
                artifact_type="plan",
                name="big.txt",
                content=big_text,
            )
            assert art.truncated
            assert art.size_bytes <= MAX_ARTIFACT_BYTES
