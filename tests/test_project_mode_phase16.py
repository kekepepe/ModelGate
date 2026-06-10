"""Tests for Project Mode V2.5 end-to-end orchestration (phase 16).

Mocks chat_runtime.run_chat with role-aware canned JSON so the full
Intake → Planner → (approve) → Workers → Supervisor → Integrator
pipeline runs without real providers.
"""

from __future__ import annotations

import asyncio
import json
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
from app.services.project_runtime.budget import Budget  # noqa: E402


class _FakeRun:
    def __init__(self, text: str) -> None:
        self.id = f"run_{uuid4().hex}"
        self.output_json = {"text": text}
        self.started_at = datetime.now(UTC)
        self.completed_at = datetime.now(UTC)


_CANNED_BY_ROLE = {
    "intake": json.dumps(
        {
            "summary": "Add health check",
            "goal": "Add /health endpoint",
            "project_area": ["backend"],
            "risk_level": "low",
            "requires_repo_access": False,
            "expected_outputs": ["plan"],
        }
    ),
    "planner": json.dumps(
        {
            "summary": "Plan health endpoint",
            "project_title": "Health Check",
            "tasks": [
                {
                    "id": "t1",
                    "title": "Backend endpoint",
                    "role": "backend",
                    "allowed_files": ["apps/server/app/api/health.py"],
                    "acceptance_criteria": ["returns 200"],
                    "depends_on": [],
                },
                {
                    "id": "t2",
                    "title": "Frontend button",
                    "role": "frontend",
                    "allowed_files": ["apps/web/src/app/health/page.tsx"],
                    "acceptance_criteria": ["renders"],
                    "depends_on": [],
                },
            ],
            "parallel_groups": [["t1", "t2"]],
        }
    ),
    "worker": json.dumps(
        {
            "summary": "Add the thing",
            "files_to_change": ["x.py"],
            "proposed_changes": [
                {"file": "x.py", "change_kind": "modify", "description": "do thing"}
            ],
            "tests": ["test_x"],
            "risks": [],
            "questions": [],
        }
    ),
    "supervisor": json.dumps(
        {
            "summary": "OK",
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
            "summary": "Final plan ready",
            "final_plan": "# Implementation Plan\n\n1. Add endpoint\n2. Add button",
            "ordered_changes": [{"step": 1, "file": "x.py", "what": "add"}],
            "test_commands": ["pytest"],
            "risks": [],
            "rollback": "git revert",
            "progress_update": "## Done",
            "decisions_update": "### D-2026-06-08-X",
        }
    ),
}


@pytest.fixture
def env(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    db_models.Base.metadata.create_all(engine)

    import app.db.session as session_module
    import app.services.project_runtime.orchestrator as orch_module

    monkeypatch.setattr(session_module, "engine", engine)
    monkeypatch.setattr(session_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(orch_module, "SessionLocal", TestSessionLocal)

    # Route mock to the right canned response by inspecting the system_prompt
    # passed as a top-level kwarg (chat_runtime now accepts it directly so the
    # role-specific instructions actually reach the model).
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
        await asyncio.sleep(0.005)
        return _FakeRun(_CANNED_BY_ROLE[role])

    monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

    yield TestSessionLocal

    engine.dispose()


class TestFullPipeline:
    @pytest.mark.asyncio
    async def test_intake_planner_runs_to_awaiting_approval(self, env):
        SL = env
        pr_id = f"pr_{uuid4().hex}"
        with SL() as s:
            s.add(
                db_models.ProjectRun(
                    id=pr_id,
                    title="t",
                    goal="Add /health endpoint",
                    status="pending",
                    planner_model_id="gpt-4o",
                )
            )
            s.commit()
            pr = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()

        from app.services.project_runtime.orchestrator import ProjectOrchestrator

        orch = ProjectOrchestrator()
        await orch.run(project_run=pr, budget=Budget(max_agents=10))

        with SL() as s:
            pr2 = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()
            assert pr2.status == "awaiting_approval"
            tasks = s.query(db_models.ProjectTask).filter_by(project_run_id=pr_id).all()
            assert len(tasks) == 2
            agents = s.query(db_models.AgentRun).filter_by(project_run_id=pr_id).all()
            roles = sorted({a.role for a in agents})
            assert roles == ["intake", "planner"]

    @pytest.mark.asyncio
    async def test_approval_runs_to_completion(self, env):
        SL = env
        pr_id = f"pr_{uuid4().hex}"
        with SL() as s:
            s.add(
                db_models.ProjectRun(
                    id=pr_id,
                    title="t",
                    goal="Add /health endpoint",
                    status="pending",
                    planner_model_id="gpt-4o",
                )
            )
            s.commit()
            pr = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()

        from app.services.project_runtime.orchestrator import ProjectOrchestrator

        orch = ProjectOrchestrator()
        await orch.run(project_run=pr, budget=Budget(max_agents=10))

        with SL() as s:
            task_ids = [
                t.id for t in s.query(db_models.ProjectTask).filter_by(project_run_id=pr_id).all()
            ]

        await orch.run_approved(
            project_run_id=pr_id,
            task_ids=task_ids,
            budget=Budget(max_agents=10),
        )

        with SL() as s:
            pr2 = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()
            assert pr2.status == "completed"
            assert pr2.completed_at is not None

            agents = s.query(db_models.AgentRun).filter_by(project_run_id=pr_id).all()
            roles = sorted({a.role for a in agents})
            # backend + frontend workers + intake + planner + supervisor + integrator
            assert "supervisor" in roles
            assert "integrator" in roles
            assert "backend" in roles
            assert "frontend" in roles

            artifacts = s.query(db_models.Artifact).filter_by(project_run_id=pr_id).all()
            types = sorted({a.type for a in artifacts})
            # intake, plan, worker (x2), review, final_plan, progress, decisions
            assert "final_plan" in types
            assert "review" in types
            assert "worker" in types
            assert "plan" in types

            memory = s.query(db_models.ProjectMemory).filter_by(project_run_id=pr_id).all()
            assert len(memory) >= 2  # intake + planner + integrator

    @pytest.mark.asyncio
    async def test_budget_exceeded_marks_run_budget_exceeded(self, env):
        SL = env
        pr_id = f"pr_{uuid4().hex}"
        with SL() as s:
            s.add(
                db_models.ProjectRun(
                    id=pr_id,
                    title="t",
                    goal="Add /health endpoint",
                    status="pending",
                    planner_model_id="gpt-4o",
                )
            )
            s.commit()
            pr = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()

        from app.services.project_runtime.orchestrator import ProjectOrchestrator

        orch = ProjectOrchestrator()

        # max_agents=1 → after intake (1), planner will fail.
        await orch.run(project_run=pr, budget=Budget(max_agents=1))

        with SL() as s:
            pr2 = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()
            assert pr2.status in ("failed", "budget_exceeded")

    @pytest.mark.asyncio
    async def test_events_are_pushed(self, env):
        SL = env
        pr_id = f"pr_{uuid4().hex}"
        with SL() as s:
            s.add(
                db_models.ProjectRun(
                    id=pr_id,
                    title="t",
                    goal="Add /health endpoint",
                    status="pending",
                    planner_model_id="gpt-4o",
                )
            )
            s.commit()
            pr = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()

        from app.services.project_runtime.orchestrator import (
            ProjectOrchestrator,
            pop_events,
        )

        orch = ProjectOrchestrator()
        await orch.run(project_run=pr, budget=Budget(max_agents=10))

        events = pop_events(pr_id)
        phases = [e.get("phase") for e in events if e.get("type") == "phase"]
        assert "intake" in phases
        assert "planner" in phases
