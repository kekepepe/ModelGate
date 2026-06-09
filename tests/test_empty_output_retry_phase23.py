"""Tests for empty-output retry and planner failure handling (phase 23).

Covers:
- ``_run_agent`` retries once when the LLM returns empty/whitespace output.
- ``_run_agent`` still fails with JSON_PARSE_ERROR if retry also returns empty.
- Orchestrator sets project_run.status="failed" when intake agent fails.
- Orchestrator sets project_run.status="failed" when planner agent fails.
- Orchestrator does NOT proceed to _create_tasks when planner fails.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import models as db_models  # noqa: E402
from app.services.project_runtime import agents as agents_module  # noqa: E402
from app.services.project_runtime import orchestrator as orch_module  # noqa: E402
from app.services.project_runtime.budget import Budget, BudgetTracker  # noqa: E402


# ── fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    db_models.Base.metadata.create_all(engine)
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


def _make_project_run(s) -> db_models.ProjectRun:
    pr = db_models.ProjectRun(
        id=f"pr_{uuid4().hex}",
        title="t",
        goal="goal",
        status="running",
    )
    s.add(pr)
    s.commit()
    return pr


_VALID_INTAKE_JSON = '{"summary": "s", "goal": "g", "project_area": [], "risk_level": "low", "requires_repo_access": false, "expected_outputs": []}'


class _FakeRun:
    def __init__(self, text: str, run_id: str | None = None) -> None:
        self.id = run_id or f"run_{uuid4().hex}"
        self.output_json = {"text": text}
        self.started_at = datetime.now(UTC)
        self.completed_at = datetime.now(UTC)


# ── empty-output retry tests ─────────────────────────────────────────────────


class TestEmptyOutputRetry:
    @pytest.mark.asyncio
    async def test_retries_once_on_empty_output(self, session, monkeypatch):
        """When LLM returns empty on first call and valid on second, agent succeeds."""
        pr = _make_project_run(session)
        call_count = 0

        async def fake_run_chat(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _FakeRun("")
            return _FakeRun(_VALID_INTAKE_JSON)

        monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

        budget = BudgetTracker(Budget())
        agent_run, output = await agents_module._run_agent(
            db=session,
            project_run_id=pr.id,
            task=None,
            role="intake",
            system_prompt="be intake",
            user_prompt="goal: test",
            budget=budget,
            model_id="mock",
            schema_role="intake",
        )

        assert call_count == 2
        assert agent_run.status == "completed"

    @pytest.mark.asyncio
    async def test_retries_once_on_whitespace_output(self, session, monkeypatch):
        """When LLM returns whitespace-only on first call, agent retries."""
        pr = _make_project_run(session)
        call_count = 0

        async def fake_run_chat(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _FakeRun("   \n  ")
            return _FakeRun(_VALID_INTAKE_JSON)

        monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

        budget = BudgetTracker(Budget())
        agent_run, output = await agents_module._run_agent(
            db=session,
            project_run_id=pr.id,
            task=None,
            role="intake",
            system_prompt="be intake",
            user_prompt="goal: test",
            budget=budget,
            model_id="mock",
            schema_role="intake",
        )

        assert call_count == 2
        assert agent_run.status == "completed"

    @pytest.mark.asyncio
    async def test_fails_after_retry_still_empty(self, session, monkeypatch):
        """When both calls return empty, agent fails with JSON_PARSE_ERROR."""
        pr = _make_project_run(session)
        call_count = 0

        async def fake_run_chat(**kwargs):
            nonlocal call_count
            call_count += 1
            return _FakeRun("")

        monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

        budget = BudgetTracker(Budget())
        agent_run, output = await agents_module._run_agent(
            db=session,
            project_run_id=pr.id,
            task=None,
            role="intake",
            system_prompt="be intake",
            user_prompt="goal: test",
            budget=budget,
            model_id="mock",
            schema_role="intake",
        )

        assert call_count == 2
        assert agent_run.status == "failed"
        assert agent_run.error_type == "JSON_PARSE_ERROR"

    @pytest.mark.asyncio
    async def test_no_retry_when_output_is_valid(self, session, monkeypatch):
        """When LLM returns valid JSON on first call, no retry happens."""
        pr = _make_project_run(session)
        call_count = 0

        async def fake_run_chat(**kwargs):
            nonlocal call_count
            call_count += 1
            return _FakeRun(_VALID_INTAKE_JSON)

        monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

        budget = BudgetTracker(Budget())
        agent_run, output = await agents_module._run_agent(
            db=session,
            project_run_id=pr.id,
            task=None,
            role="intake",
            system_prompt="be intake",
            user_prompt="goal: test",
            budget=budget,
            model_id="mock",
            schema_role="intake",
        )

        assert call_count == 1
        assert agent_run.status == "completed"


# ── orchestrator planner/intake failure tests ────────────────────────────────


class _FakeAgentRun:
    def __init__(self, *, status: str = "completed", error_type=None, error_message=None, output=None):
        self.id = f"agent_{uuid4().hex}"
        self.status = status
        self.error_type = error_type
        self.error_message = error_message
        self.output_json = output or {}


_VALID_INTAKE = {"summary": "s", "goal": "g", "project_area": [], "risk_level": "low", "requires_repo_access": False, "expected_outputs": []}


def _fake_serialize_artifact(artifact):
    return {"id": getattr(artifact, "id", "a1"), "type": "plan", "name": "plan.json"}


class TestOrchestratorPlannerFailure:
    @pytest.mark.asyncio
    async def test_planner_failure_sets_project_failed(self, session, monkeypatch):
        """When planner agent fails, project_run.status is set to 'failed'."""
        pr = db_models.ProjectRun(
            id=f"pr_{uuid4().hex}",
            title="t",
            goal="goal",
            status="running",
            intake_json=_VALID_INTAKE,
            budget_json={},
        )
        session.add(pr)
        session.commit()

        async def fake_run_intake(**kwargs):
            return _FakeAgentRun(output=_VALID_INTAKE), _VALID_INTAKE

        async def fake_run_planner(**kwargs):
            return _FakeAgentRun(status="failed", error_type="JSON_PARSE_ERROR", error_message="empty output"), {}

        monkeypatch.setattr(orch_module, "run_intake", fake_run_intake)
        monkeypatch.setattr(orch_module, "run_planner", fake_run_planner)
        monkeypatch.setattr(orch_module, "write_artifact", lambda **kw: type("A", (), {"id": "a1"})())
        monkeypatch.setattr(orch_module, "serialize_artifact", _fake_serialize_artifact)
        monkeypatch.setattr(orch_module, "write_memory", lambda **kw: None)

        orch = orch_module.ProjectOrchestrator()
        await orch._execute(pr, Budget())

        assert pr.status == "failed"
        assert pr.error_type == "JSON_PARSE_ERROR"

    @pytest.mark.asyncio
    async def test_intake_failure_sets_project_failed(self, session, monkeypatch):
        """When intake agent fails, project_run.status is set to 'failed'."""
        pr = db_models.ProjectRun(
            id=f"pr_{uuid4().hex}",
            title="t",
            goal="goal",
            status="pending",
            budget_json={},
        )
        session.add(pr)
        session.commit()

        async def fake_run_intake(**kwargs):
            return _FakeAgentRun(status="failed", error_type="JSON_PARSE_ERROR", error_message="empty"), {}

        monkeypatch.setattr(orch_module, "run_intake", fake_run_intake)
        monkeypatch.setattr(orch_module, "write_artifact", lambda **kw: type("A", (), {"id": "a1"})())
        monkeypatch.setattr(orch_module, "serialize_artifact", _fake_serialize_artifact)

        orch = orch_module.ProjectOrchestrator()
        await orch._execute(pr, Budget())

        assert pr.status == "failed"
        assert pr.error_type == "JSON_PARSE_ERROR"

    @pytest.mark.asyncio
    async def test_planner_failure_does_not_create_tasks(self, session, monkeypatch):
        """When planner fails, no ProjectTask rows are created."""
        pr = db_models.ProjectRun(
            id=f"pr_{uuid4().hex}",
            title="t",
            goal="goal",
            status="running",
            intake_json=_VALID_INTAKE,
            budget_json={},
        )
        session.add(pr)
        session.commit()

        async def fake_run_intake(**kwargs):
            return _FakeAgentRun(output=_VALID_INTAKE), _VALID_INTAKE

        async def fake_run_planner(**kwargs):
            return _FakeAgentRun(status="failed", error_type="JSON_PARSE_ERROR", error_message="bad"), {}

        monkeypatch.setattr(orch_module, "run_intake", fake_run_intake)
        monkeypatch.setattr(orch_module, "run_planner", fake_run_planner)
        monkeypatch.setattr(orch_module, "write_artifact", lambda **kw: type("A", (), {"id": "a1"})())
        monkeypatch.setattr(orch_module, "serialize_artifact", _fake_serialize_artifact)
        monkeypatch.setattr(orch_module, "write_memory", lambda **kw: None)

        orch = orch_module.ProjectOrchestrator()
        await orch._execute(pr, Budget())

        tasks = session.query(db_models.ProjectTask).filter(
            db_models.ProjectTask.project_run_id == pr.id
        ).all()
        assert len(tasks) == 0
