"""Tests for Project Mode V2.5 Planner Agent (phase 14).

Mocks chat_runtime.run_chat so no provider/network is needed.
Covers: run_intake / run_planner happy path, JSON parse + schema validation,
markdown-fenced output handling, schema-invalid recovery, budget interaction.
"""

from __future__ import annotations

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
from app.services.project_runtime.budget import Budget, BudgetTracker  # noqa: E402


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


def _make_project_run(session) -> db_models.ProjectRun:
    pr = db_models.ProjectRun(
        id=f"pr_{uuid4().hex}",
        title="t",
        goal="goal",
        status="running",
    )
    session.add(pr)
    session.commit()
    return pr


class _FakeRun:
    """Drop-in stand-in for the Run row chat_runtime returns."""

    def __init__(self, text: str, run_id: str | None = None) -> None:
        self.id = run_id or f"run_{uuid4().hex}"
        self.output_json = {"text": text}
        self.started_at = datetime.now(UTC)
        self.completed_at = datetime.now(UTC)


@pytest.fixture
def mock_runtime(monkeypatch):
    """Patch chat_runtime.run_chat with a configurable canned response."""
    from app.services.project_runtime import agents as agents_module

    canned = {"text": "{}"}

    async def fake_run_chat(**kwargs):
        return _FakeRun(canned["text"])

    monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)
    return canned


# ── Intake tests ─────────────────────────────────────────────────────────────


class TestRunIntake:
    @pytest.mark.asyncio
    async def test_happy_path(self, session, mock_runtime):
        pr = _make_project_run(session)
        mock_runtime["text"] = (
            '{"summary": "S", "goal": "G", "project_area": ["backend"],'
            ' "risk_level": "low", "requires_repo_access": false, "expected_outputs": ["plan"]}'
        )

        from app.services.project_runtime.agents import run_intake

        agent, output = await run_intake(
            db=session,
            project_run_id=pr.id,
            goal="Add a button",
            budget=BudgetTracker(budget=Budget()),
            model_id="gpt-4o",
        )

        assert agent.status == "completed"
        assert agent.role == "intake"
        assert output["goal"] == "G"
        assert output["risk_level"] == "low"

    @pytest.mark.asyncio
    async def test_markdown_fenced_output(self, session, mock_runtime):
        pr = _make_project_run(session)
        mock_runtime["text"] = (
            "```json\n" '{"summary": "S", "goal": "G", "risk_level": "medium"}\n' "```"
        )

        from app.services.project_runtime.agents import run_intake

        agent, output = await run_intake(
            db=session,
            project_run_id=pr.id,
            goal="Test",
            budget=BudgetTracker(budget=Budget()),
            model_id="gpt-4o",
        )
        assert agent.status == "completed"
        assert output["goal"] == "G"

    @pytest.mark.asyncio
    async def test_invalid_json_marks_failed(self, session, mock_runtime):
        pr = _make_project_run(session)
        mock_runtime["text"] = "this is not JSON, sorry"

        from app.services.project_runtime.agents import run_intake

        agent, output = await run_intake(
            db=session,
            project_run_id=pr.id,
            goal="Test",
            budget=BudgetTracker(budget=Budget()),
            model_id="gpt-4o",
        )
        assert agent.status == "failed"
        assert agent.error_message is not None
        assert "JSON" in agent.error_message or "json" in agent.error_message

    @pytest.mark.asyncio
    async def test_schema_violation_marks_failed(self, session, mock_runtime):
        pr = _make_project_run(session)
        mock_runtime["text"] = '{"summary": "S"}'  # missing required `goal`

        from app.services.project_runtime.agents import run_intake

        agent, output = await run_intake(
            db=session,
            project_run_id=pr.id,
            goal="Test",
            budget=BudgetTracker(budget=Budget()),
            model_id="gpt-4o",
        )
        assert agent.status == "failed"
        assert "schema" in (agent.error_message or "").lower()


# ── Planner tests ────────────────────────────────────────────────────────────


class TestRunPlanner:
    @pytest.mark.asyncio
    async def test_happy_path(self, session, mock_runtime):
        pr = _make_project_run(session)
        mock_runtime["text"] = (
            '{"summary": "Plan", "project_title": "X",'
            ' "tasks": [{"id": "t1", "title": "Do thing", "role": "backend",'
            ' "allowed_files": ["a.py"], "acceptance_criteria": ["passes"], "depends_on": []}]}'
        )

        from app.services.project_runtime.agents import run_planner

        intake_output = {
            "summary": "S",
            "goal": "G",
            "project_area": ["backend"],
            "risk_level": "low",
            "expected_outputs": ["plan"],
        }
        agent, output = await run_planner(
            db=session,
            project_run_id=pr.id,
            intake_output=intake_output,
            budget=BudgetTracker(budget=Budget()),
            model_id="gpt-4o",
        )
        assert agent.status == "completed"
        assert agent.role == "planner"
        assert output["project_title"] == "X"
        assert len(output["tasks"]) == 1

    @pytest.mark.asyncio
    async def test_planner_empty_tasks_marks_failed(self, session, mock_runtime):
        pr = _make_project_run(session)
        mock_runtime["text"] = '{"summary": "P", "project_title": "X", "tasks": []}'

        from app.services.project_runtime.agents import run_planner

        agent, _ = await run_planner(
            db=session,
            project_run_id=pr.id,
            intake_output={"summary": "S", "goal": "G"},
            budget=BudgetTracker(budget=Budget()),
            model_id="gpt-4o",
        )
        assert agent.status == "failed"


# ── Budget interaction ───────────────────────────────────────────────────────


class TestBudgetInteraction:
    @pytest.mark.asyncio
    async def test_budget_exceeded_marks_failed(self, session, mock_runtime):
        pr = _make_project_run(session)
        mock_runtime["text"] = '{"summary": "S", "goal": "G", "risk_level": "medium"}'

        from app.services.project_runtime.agents import run_intake
        from app.services.project_runtime.budget import BudgetExceeded

        tracker = BudgetTracker(budget=Budget(max_agents=0))
        with pytest.raises(BudgetExceeded, match="Agent budget exceeded"):
            await run_intake(
                db=session,
                project_run_id=pr.id,
                goal="Test",
                budget=tracker,
                model_id="gpt-4o",
            )
        # AgentRun row should still be persisted with status=failed.
        agent = session.query(db_models.AgentRun).filter_by(project_run_id=pr.id).first()
        assert agent.status == "failed"
        assert agent.error_type == "BUDGET_EXCEEDED"

    @pytest.mark.asyncio
    async def test_agent_call_counts_against_budget(self, session, mock_runtime):
        pr = _make_project_run(session)
        mock_runtime["text"] = '{"summary": "S", "goal": "G", "risk_level": "medium"}'

        from app.services.project_runtime.agents import run_intake

        tracker = BudgetTracker(budget=Budget(max_agents=5))
        await run_intake(
            db=session,
            project_run_id=pr.id,
            goal="g",
            budget=tracker,
            model_id="gpt-4o",
        )
        assert tracker.agents_used == 1


# ── Artifact persistence (via orchestrator's write_artifact call) ────────────


class TestArtifactAfterAgent:
    @pytest.mark.asyncio
    async def test_intake_output_can_be_artifacted(self, session, mock_runtime):
        pr = _make_project_run(session)
        mock_runtime["text"] = '{"summary": "S", "goal": "G", "risk_level": "medium"}'

        from app.services.project_runtime.agents import run_intake
        from app.services.project_runtime.artifacts import write_artifact

        agent, output = await run_intake(
            db=session,
            project_run_id=pr.id,
            goal="g",
            budget=BudgetTracker(budget=Budget()),
            model_id="gpt-4o",
        )
        art = write_artifact(
            db=session,
            project_run_id=pr.id,
            agent_run_id=agent.id,
            artifact_type="intake",
            name="intake.json",
            content=output,
        )
        assert art.content_json == output
        assert art.agent_run_id == agent.id
