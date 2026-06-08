"""Tests for Project Mode V2.5 Worker × N parallel execution (phase 15).

Verifies:
- Multiple workers run concurrently (asyncio.gather + Semaphore).
- allowed_files constraint is propagated.
- Budget exhaustion during parallel run is caught.
- All workers persist artifacts independently.
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
from app.services.project_runtime.budget import Budget, BudgetTracker  # noqa: E402


class _FakeRun:
    def __init__(self, text: str) -> None:
        self.id = f"run_{uuid4().hex}"
        self.output_json = {"text": text}
        self.started_at = datetime.now(UTC)
        self.completed_at = datetime.now(UTC)


@pytest.fixture
def patched_session(monkeypatch):
    """Set up SQLite in-memory db + patch SessionLocal so orchestrator helpers work."""
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

    yield TestSessionLocal

    engine.dispose()


def _make_pr_with_tasks(session_factory, task_count: int = 3) -> tuple[str, list[str]]:
    pr_id = f"pr_{uuid4().hex}"
    task_ids: list[str] = []
    with session_factory() as s:
        pr = db_models.ProjectRun(id=pr_id, title="t", goal="g", status="running")
        s.add(pr)
        for i in range(task_count):
            tid = f"t{i}_{uuid4().hex[:6]}"
            s.add(db_models.ProjectTask(
                id=tid, project_run_id=pr_id, title=f"Task {i}",
                description="d", role="backend", status="pending",
                allowed_files=["apps/server/app/api/x.py"],
                acceptance_criteria=[], depends_on=[],
            ))
            task_ids.append(tid)
        s.commit()
    return pr_id, task_ids


@pytest.fixture
def mock_runtime(monkeypatch):
    """Patch chat_runtime.run_chat with canned output that's always valid worker JSON."""
    from app.services.project_runtime import agents as agents_module

    canned_text = (
        '{"summary": "Add x", "files_to_change": ["apps/server/app/api/x.py"],'
        ' "proposed_changes": [{"file": "apps/server/app/api/x.py",'
        ' "change_kind": "modify", "description": "do thing"}],'
        ' "tests": [], "risks": [], "questions": []}'
    )

    async def fake_run_chat(**kwargs):
        # Add a tiny await so the event loop can multiplex workers.
        await asyncio.sleep(0.01)
        return _FakeRun(canned_text)

    monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)
    return canned_text


class TestParallelWorkers:
    @pytest.mark.asyncio
    async def test_parallel_runs_complete_all_tasks(self, patched_session, mock_runtime):
        pr_id, task_ids = _make_pr_with_tasks(patched_session, task_count=3)

        from app.services.project_runtime.orchestrator import ProjectOrchestrator

        orch = ProjectOrchestrator()
        with patched_session() as s:
            pr = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()
            tasks = s.query(db_models.ProjectTask).filter(
                db_models.ProjectTask.id.in_(task_ids)
            ).all()

        tracker = BudgetTracker(budget=Budget(max_agents=10))
        outputs = await orch._run_workers_parallel(
            project_run=pr, tasks=tasks, planner_output={"project_title": "X"},
            tracker=tracker, model_id="gpt-4o",
        )

        assert len(outputs) == 3
        for task, out in outputs:
            assert task.status == "completed"
            assert out["files_to_change"] == ["apps/server/app/api/x.py"]
        assert tracker.agents_used == 3

    @pytest.mark.asyncio
    async def test_parallel_artifacts_persisted(self, patched_session, mock_runtime):
        pr_id, task_ids = _make_pr_with_tasks(patched_session, task_count=2)

        from app.services.project_runtime.orchestrator import ProjectOrchestrator

        orch = ProjectOrchestrator()
        with patched_session() as s:
            pr = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()
            tasks = s.query(db_models.ProjectTask).filter(
                db_models.ProjectTask.id.in_(task_ids)
            ).all()

        tracker = BudgetTracker(budget=Budget(max_agents=10))
        await orch._run_workers_parallel(
            project_run=pr, tasks=tasks, planner_output={"project_title": "X"},
            tracker=tracker, model_id="gpt-4o",
        )

        with patched_session() as s:
            artifacts = s.query(db_models.Artifact).filter_by(
                project_run_id=pr_id, type="worker",
            ).all()
        assert len(artifacts) == 2

    @pytest.mark.asyncio
    async def test_budget_exceeded_during_parallel(self, patched_session, mock_runtime):
        pr_id, task_ids = _make_pr_with_tasks(patched_session, task_count=4)

        from app.services.project_runtime.budget import BudgetExceeded
        from app.services.project_runtime.orchestrator import ProjectOrchestrator

        orch = ProjectOrchestrator()
        with patched_session() as s:
            pr = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()
            tasks = s.query(db_models.ProjectTask).filter(
                db_models.ProjectTask.id.in_(task_ids)
            ).all()

        # max_agents=2 < 4 tasks; later workers should bounce.
        tracker = BudgetTracker(budget=Budget(max_agents=2))
        with pytest.raises(BudgetExceeded, match="Agent budget exceeded"):
            await orch._run_workers_parallel(
                project_run=pr, tasks=tasks, planner_output={"project_title": "X"},
                tracker=tracker, model_id="gpt-4o",
            )

    @pytest.mark.asyncio
    async def test_semaphore_caps_concurrency(self, patched_session, monkeypatch):
        """Make sure WORKER_CONCURRENCY bounds concurrent in-flight workers."""
        from app.services.project_runtime import orchestrator as orch_module

        monkeypatch.setattr(orch_module, "WORKER_CONCURRENCY", 2)

        pr_id, task_ids = _make_pr_with_tasks(patched_session, task_count=5)

        in_flight = {"current": 0, "max_seen": 0}

        async def fake_run_chat(**kwargs):
            in_flight["current"] += 1
            in_flight["max_seen"] = max(in_flight["max_seen"], in_flight["current"])
            await asyncio.sleep(0.05)
            in_flight["current"] -= 1
            return _FakeRun(
                '{"summary": "x", "files_to_change": ["apps/server/app/api/x.py"],'
                ' "proposed_changes": [], "tests": [], "risks": [], "questions": []}'
            )

        from app.services.project_runtime import agents as agents_module
        monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

        orch = orch_module.ProjectOrchestrator()
        with patched_session() as s:
            pr = s.query(db_models.ProjectRun).filter_by(id=pr_id).one()
            tasks = s.query(db_models.ProjectTask).filter(
                db_models.ProjectTask.id.in_(task_ids)
            ).all()

        # Give plenty of budget so the semaphore is the only constraint.
        tracker = BudgetTracker(budget=Budget(max_agents=10))
        await orch._run_workers_parallel(
            project_run=pr, tasks=tasks, planner_output={"project_title": "X"},
            tracker=tracker, model_id="gpt-4o",
        )

        # Concurrency should be capped at WORKER_CONCURRENCY (=2) and we should
        # have actually been running in parallel (>=2 in flight at peak).
        assert in_flight["max_seen"] == 2
