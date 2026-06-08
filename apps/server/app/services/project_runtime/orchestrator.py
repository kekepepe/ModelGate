"""ProjectOrchestrator — drives the full Intake→Planner→Workers→Supervisor→Integrator flow.

Every project run is executed inside ``asyncio.create_task`` so the API
responds immediately with the project_run_id and the orchestration
progresses in the background. Frontend polls ``GET /project_runs/{id}``
for status updates.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db.models import AgentRun, ProjectRun, ProjectTask
from app.services.project_runtime.agents import (
    run_integrator,
    run_intake,
    run_planner,
    run_supervisor,
    run_worker,
    write_memory,
)
from app.services.project_runtime.artifacts import serialize_artifact, write_artifact
from app.services.project_runtime.budget import Budget, BudgetExceeded, BudgetTracker

_events: dict[str, list[dict]] = {}

WORKER_CONCURRENCY = 4


def _push_event(project_run_id: str, event: dict) -> None:
    _events.setdefault(project_run_id, []).append(event)


def pop_events(project_run_id: str) -> list[dict]:
    return _events.pop(project_run_id, [])


def _now_iso() -> datetime:
    from datetime import UTC, datetime

    return datetime.now(UTC)


class ProjectOrchestrator:
    """Drives one project run through the full agent pipeline."""

    async def run(
        self,
        *,
        project_run: ProjectRun,
        budget: Budget,
    ) -> None:
        """Execute the full pipeline in background asyncio task."""
        try:
            await self._execute(project_run, budget)
        except Exception as exc:
            project_run.status = "failed"
            project_run.error_type = type(exc).__name__
            project_run.error_message = str(exc)[:500]
            self._save_and_event(project_run, {"type": "failed", "error": str(exc)[:500]})

    async def _execute(self, project_run: ProjectRun, budget: Budget) -> None:
        db: Session = SessionLocal()
        try:
            tracker = BudgetTracker(budget=budget)
            model_id = project_run.planner_model_id or model_fallback(db)

            # Phase 1: Intake
            self._update(project_run, "running")
            _push_event(project_run.id, {"type": "phase", "phase": "intake", "status": "running"})

            intake_agent, intake_output = await run_intake(
                db=db,
                project_run_id=project_run.id,
                goal=project_run.goal,
                budget=tracker,
                model_id=model_id,
            )
            intake_artifact = write_artifact(
                db=db,
                project_run_id=project_run.id,
                artifact_type="intake",
                name="intake-output.json",
                content=intake_output,
                agent_run_id=intake_agent.id,
            )
            project_run.intake_json = intake_output
            write_memory(
                db=db, project_run_id=project_run.id, memory_type="requirement",
                content=json.dumps(intake_output, ensure_ascii=False), source="intake",
            )
            project_run.usage_json = tracker.usage_snapshot()
            self._save_and_event(project_run, {
                "type": "phase", "phase": "intake", "status": "completed",
                "agentRunId": intake_agent.id, "artifact": serialize_artifact(intake_artifact),
            })

            self._save_and_event(project_run, {
                "type": "phase", "phase": "planner", "status": "running",
            })

            planner_agent, planner_output = await run_planner(
                db=db,
                project_run_id=project_run.id,
                intake_output=intake_output,
                budget=tracker,
                model_id=model_id,
            )
            planner_artifact = write_artifact(
                db=db, project_run_id=project_run.id,
                artifact_type="plan", name="plan.json",
                content=planner_output, agent_run_id=planner_agent.id,
            )
            project_run.usage_json = tracker.usage_snapshot()

            project_run.title = planner_output.get("project_title", project_run.title)

            project_tasks = self._create_tasks(project_run, planner_output, db)
            write_memory(
                db=db, project_run_id=project_run.id, memory_type="decision",
                content=json.dumps(planner_output, ensure_ascii=False), source="planner",
            )

            self._update(project_run, "awaiting_approval")
            self._save_and_event(project_run, {
                "type": "phase", "phase": "planner", "status": "awaiting_approval",
                "agentRunId": planner_agent.id,
                "artifact": serialize_artifact(planner_artifact),
                "tasks": [self._serialize_task(t) for t in project_tasks],
            })
            return
        finally:
            db.close()

    async def run_approved(
        self,
        *,
        project_run_id: str,
        task_ids: list[str],
        budget: Budget,
    ) -> None:
        """Continue with Workers → Supervisor → Integrator after user approval."""
        db: Session = SessionLocal()
        try:
            tracker = BudgetTracker(budget=budget)
            project_run = db.query(ProjectRun).filter(ProjectRun.id == project_run_id).first()
            if not project_run:
                raise ValueError(f"ProjectRun {project_run_id} not found")

            self._update(project_run, "running")
            model_id = project_run.planner_model_id or model_fallback(db)

            planner_agent = (
                db.query(AgentRun)
                .filter_by(project_run_id=project_run.id, role="planner")
                .order_by(AgentRun.created_at.desc())
                .first()
            )
            planner_output = planner_agent.output_json if planner_agent else {}

            tasks = (
                db.query(ProjectTask)
                .filter(
                    ProjectTask.project_run_id == project_run.id,
                    ProjectTask.id.in_(task_ids),
                )
                .all()
            )

            if not tasks:
                raise ValueError("No tasks selected for execution")

            _push_event(project_run.id, {
                "type": "phase", "phase": "intake", "status": "approved",
            })
            _push_event(project_run.id, {
                "type": "phase", "phase": "planner", "status": "approved",
            })

            worker_outputs = await self._run_workers_parallel(
                project_run=project_run,
                tasks=tasks,
                planner_output=planner_output,
                tracker=tracker,
                model_id=model_id,
            )
            # Re-attach updated tasks to current session for downstream phases.
            tasks = (
                db.query(ProjectTask)
                .filter(ProjectTask.id.in_([t.id for t, _ in worker_outputs]))
                .all()
            )
            project_run = db.query(ProjectRun).filter(ProjectRun.id == project_run.id).first()
            project_run.usage_json = tracker.usage_snapshot()

            self._update(project_run, "running")
            _push_event(project_run.id, {
                "type": "phase", "phase": "supervisor", "status": "running",
            })

            supervisor_agent, supervisor_output = await run_supervisor(
                db=db,
                project_run_id=project_run.id,
                worker_outputs=worker_outputs,
                budget=tracker,
                model_id=model_id,
            )
            write_artifact(
                db=db, project_run_id=project_run.id,
                artifact_type="review", name="review-report.md",
                content=json.dumps(supervisor_output, ensure_ascii=False),
                agent_run_id=supervisor_agent.id,
            )
            project_run.usage_json = tracker.usage_snapshot()
            self._save_and_event(project_run, {
                "type": "phase", "phase": "supervisor", "status": "completed",
            })

            _push_event(project_run.id, {
                "type": "phase", "phase": "integrator", "status": "running",
            })

            integrator_agent, integrator_output = await run_integrator(
                db=db,
                project_run_id=project_run.id,
                planner_output=planner_output,
                worker_outputs=worker_outputs,
                supervisor_output=supervisor_output,
                budget=tracker,
                model_id=model_id,
            )
            integ_artifact = write_artifact(
                db=db, project_run_id=project_run.id,
                artifact_type="final_plan", name="final-implementation-plan.md",
                content=integrator_output.get("final_plan", ""),
                agent_run_id=integrator_agent.id,
            )

            write_memory(
                db=db, project_run_id=project_run.id, memory_type="completed_task",
                content=f"Integrator plan: {integrator_output.get('summary', '')}",
                source="integrator",
            )

            progress_text = integrator_output.get("progress_update", "")
            if progress_text:
                write_artifact(
                    db=db, project_run_id=project_run.id,
                    artifact_type="progress", name="progress-update.md",
                    content=progress_text,
                )

            decisions_text = integrator_output.get("decisions_update", "")
            if decisions_text:
                write_artifact(
                    db=db, project_run_id=project_run.id,
                    artifact_type="decisions", name="decisions-update.md",
                    content=decisions_text,
                )

            project_run.usage_json = tracker.usage_snapshot()
            self._update(project_run, "completed")
            db.commit()
            _push_event(project_run.id, {
                "type": "phase", "phase": "integrator", "status": "completed",
                "artifact": serialize_artifact(integ_artifact),
                "usage": tracker.usage_snapshot(),
            })
            _push_event(project_run.id, {"type": "done", "status": "completed"})
        except BudgetExceeded as exc:
            project_run.status = "budget_exceeded"
            project_run.error_type = "BUDGET_EXCEEDED"
            project_run.error_message = exc.reason
            self._save_and_event(project_run, {"type": "budget_exceeded", "reason": exc.reason})
        except Exception as exc:
            project_run.status = "failed"
            project_run.error_type = type(exc).__name__
            project_run.error_message = str(exc)[:500]
            self._save_and_event(project_run, {"type": "failed", "error": str(exc)[:500]})
        finally:
            db.close()

    async def _run_workers_parallel(
        self,
        *,
        project_run: ProjectRun,
        tasks: list[ProjectTask],
        planner_output: dict,
        tracker: BudgetTracker,
        model_id: str,
    ) -> list[tuple[ProjectTask, dict]]:
        """Run multiple workers concurrently bounded by max_agents.

        Each worker gets its own Session so SQLAlchemy isn't shared across tasks.
        """
        max_parallel = max(1, min(WORKER_CONCURRENCY, len(tasks)))
        semaphore = asyncio.Semaphore(max_parallel)
        project_run_id = project_run.id
        task_snapshots = [(t.id, t.title, t.role) for t in tasks]

        async def _one(task_id: str, title: str, role: str) -> tuple[str, dict]:
            async with semaphore:
                _push_event(project_run_id, {
                    "type": "phase", "phase": "worker", "taskId": task_id,
                    "status": "running",
                })
                local_db = SessionLocal()
                try:
                    local_task = (
                        local_db.query(ProjectTask)
                        .filter(ProjectTask.id == task_id).first()
                    )
                    if local_task is None:
                        raise ValueError(f"Task {task_id} not found")
                    agent, output = await run_worker(
                        db=local_db,
                        project_run_id=project_run_id,
                        task=local_task,
                        planner_output=planner_output,
                        budget=tracker,
                        model_id=model_id,
                    )
                    local_task.status = (
                        "completed" if agent.status == "completed" else "failed"
                    )
                    local_db.commit()
                    write_artifact(
                        db=local_db, project_run_id=project_run_id,
                        artifact_type="worker",
                        name=f"worker-{role}-{task_id}.json",
                        content=output, task_id=task_id, agent_run_id=agent.id,
                    )
                    _push_event(project_run_id, {
                        "type": "phase", "phase": "worker", "taskId": task_id,
                        "status": local_task.status,
                    })
                    return task_id, output
                finally:
                    local_db.close()

        coros = [_one(tid, ttl, role) for tid, ttl, role in task_snapshots]
        results = await asyncio.gather(*coros, return_exceptions=True)

        # Surface the first BudgetExceeded so the outer catch handles it.
        for r in results:
            if isinstance(r, BudgetExceeded):
                raise r
        for r in results:
            if isinstance(r, Exception):
                raise r

        # Re-fetch tasks for downstream stages.
        outputs: list[tuple[ProjectTask, dict]] = []
        with SessionLocal() as session:
            for task_id, output in results:
                t = session.query(ProjectTask).filter(ProjectTask.id == task_id).first()
                outputs.append((t, output))
        return outputs

    def _create_tasks(
        self, project_run: ProjectRun, planner_output: dict, db: Session,
    ) -> list[ProjectTask]:
        tasks = []
        for td in planner_output.get("tasks", []):
            task = ProjectTask(
                id=td["id"],
                project_run_id=project_run.id,
                parent_task_id=td.get("parent_task_id"),
                title=td["title"],
                description=td.get("description", ""),
                role=td.get("role", "backend"),
                status="pending",
                allowed_files=td.get("allowed_files", []),
                acceptance_criteria=td.get("acceptance_criteria", []),
                depends_on=td.get("depends_on", []),
            )
            db.add(task)
            tasks.append(task)
        db.commit()
        for t in tasks:
            db.refresh(t)
        return tasks

    @staticmethod
    def _update(project_run: ProjectRun, status: str) -> None:
        project_run.status = status
        if status == "completed":
            project_run.completed_at = _now_iso()

    @staticmethod
    def _save_and_event(project_run: ProjectRun, event: dict) -> None:
        from app.db.session import SessionLocal as _SL

        db2 = _SL()
        try:
            merged = db2.merge(project_run)
            db2.commit()
        finally:
            db2.close()
        _push_event(project_run.id, event)

    @staticmethod
    def _serialize_task(task: ProjectTask) -> dict:
        return {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "role": task.role,
            "status": task.status,
            "allowedFiles": task.allowed_files or [],
            "acceptanceCriteria": task.acceptance_criteria or [],
            "dependsOn": task.depends_on or [],
        }


def model_fallback(db: Session) -> str:
    from app.services.model_registry import model_registry

    models = model_registry.recommend(task_type="chat", input_types=["text"], required_output="text")
    available = models.get("availableModels", [])
    if available:
        return available[0]["id"]
    return "gpt-4o"


project_orchestrator = ProjectOrchestrator()