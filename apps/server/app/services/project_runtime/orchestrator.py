"""ProjectOrchestrator — drives the full Intake→Planner→Workers→Supervisor→Integrator flow.

Every project run is executed inside ``asyncio.create_task`` so the API
responds immediately with the project_run_id and the orchestration
progresses in the background. Frontend polls ``GET /project_runs/{id}``
for status updates.
"""

from __future__ import annotations

import asyncio
import fnmatch
import json
import os
import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.models import AgentRun, ProjectRun, ProjectTask
from app.db.session import SessionLocal
from app.services.project_runtime.agents import (
    run_integrator,
    run_intake,
    run_planner,
    run_supervisor,
    run_verifier,
    run_worker,
    write_memory,
)
from app.services.project_runtime.artifacts import serialize_artifact, write_artifact
from app.services.project_runtime.budget import Budget, BudgetExceeded, BudgetTracker
from app.services.project_runtime.pytest_runner import run_pytest
from app.services.project_runtime.schemas import PatchValidationResult

_events: dict[str, list[dict]] = {}

WORKER_CONCURRENCY = 4

PROJECT_ROOT = Path(os.environ.get("PROJECT_ROOT", "."))

PATCH_MODES = {"patch", "apply_with_approval"}

HIGH_RISK_PATTERNS: list[tuple[str, str]] = [
    ("**/migrations/**", "migration"),
    ("**/alembic/versions/**", "migration"),
    ("**/*lock*", "lockfile"),
    ("**/package-lock.json", "lockfile"),
    ("**/yarn.lock", "lockfile"),
    ("**/poetry.lock", "lockfile"),
    ("**/.env*", "env"),
    ("**/.env", "env"),
    ("**/Dockerfile*", "docker"),
    ("**/docker-compose*", "docker"),
    ("**/.github/**", "ci"),
    ("**/.gitlab-ci*", "ci"),
    ("**/Jenkinsfile", "ci"),
]

HIGH_RISK_REASONS: dict[str, str] = {
    "migration": "Database migration — may cause data loss",
    "lockfile": "Dependency lockfile — affects reproducibility",
    "env": "Environment configuration — may contain secrets",
    "docker": "Docker configuration — affects deployment",
    "ci": "CI/CD configuration — affects build pipeline",
}

# Unified diff header: --- a/path or --- /dev/null
_DIFF_HEADER_RE = re.compile(r"^--- [ab]/(.+)$", re.MULTILINE)
_DIFF_HEADER_NEW_RE = re.compile(r"^\+\+\+ [ab]/(.+)$", re.MULTILINE)


def _check_high_risk(filepath: str) -> str | None:
    """Return risk reason if filepath matches a high-risk pattern, else None."""
    for pattern, reason_key in HIGH_RISK_PATTERNS:
        # fnmatch doesn't support ** (recursive glob), so also match the
        # path without **/ prefix and the basename.
        last_segment = pattern.rsplit("/", maxsplit=1)[-1]
        basename = filepath.rsplit("/", maxsplit=1)[-1]
        if (
            fnmatch.fnmatch(filepath, pattern)
            or fnmatch.fnmatch(filepath, pattern.replace("**/", ""))
            # Only match basename when the last segment is a concrete name, not ** or *
            or (last_segment not in ("**", "*") and fnmatch.fnmatch(basename, last_segment))
        ):
            return HIGH_RISK_REASONS.get(reason_key, reason_key)
    return None


def validate_patch(diff_text: str, allowed_files: list[str]) -> PatchValidationResult:
    """Validate a unified diff against allowed_files constraints.

    Returns PatchValidationResult with violations and high-risk flags.
    """
    if not diff_text.strip():
        return PatchValidationResult(valid=True)

    # Extract all file paths from +++ b/ headers (the "new" side)
    new_paths = _DIFF_HEADER_NEW_RE.findall(diff_text)
    # Also check --- a/ headers for deleted files
    old_paths = _DIFF_HEADER_RE.findall(diff_text)
    all_paths = set(new_paths + old_paths)

    # /dev/null is not a real path
    all_paths.discard("/dev/null")
    all_paths.discard("dev/null")

    violations: list[str] = []
    high_risk: list[dict[str, str]] = []

    for filepath in all_paths:
        # Check allowed_files
        if allowed_files:
            matched = any(
                fnmatch.fnmatch(filepath, pattern) for pattern in allowed_files
            )
            if not matched:
                violations.append(f"File '{filepath}' is not in allowed_files")

        # Check high-risk
        risk_reason = _check_high_risk(filepath)
        if risk_reason:
            high_risk.append({"file": filepath, "reason": risk_reason})

    return PatchValidationResult(
        valid=len(violations) == 0,
        violations=violations,
        high_risk_files=high_risk,
    )


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
            fallback = model_fallback(db)
            intake_model = project_run.intake_model_id or project_run.planner_model_id or fallback
            planner_model = project_run.planner_model_id or fallback

            # Phase 1: Intake
            self._update(project_run, "running")
            _push_event(project_run.id, {"type": "phase", "phase": "intake", "status": "running"})

            intake_agent, intake_output = await run_intake(
                db=db,
                project_run_id=project_run.id,
                goal=project_run.goal,
                budget=tracker,
                model_id=intake_model,
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
                model_id=planner_model,
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
            fallback = model_fallback(db)
            worker_model = project_run.worker_model_id or project_run.planner_model_id or fallback
            supervisor_model = project_run.supervisor_model_id or project_run.planner_model_id or fallback
            integrator_model = project_run.integrator_model_id or project_run.planner_model_id or fallback

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
                model_id=worker_model,
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
                model_id=supervisor_model,
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
                model_id=integrator_model,
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

            # V2.7 Controlled Auto: run verifier loop after initial workers.
            # Only meaningful in patch / apply_with_approval / controlled_auto modes.
            if (project_run.mode or "") in {"controlled_auto", "patch", "apply_with_approval"}:
                verifier_model = (
                    project_run.supervisor_model_id
                    or project_run.planner_model_id
                    or fallback
                )
                verifier_result = await self._run_verifier_loop(
                    db=db,
                    project_run=project_run,
                    tasks=tasks,
                    planner_output=planner_output,
                    tracker=tracker,
                    worker_model_id=worker_model,
                    verifier_model_id=verifier_model,
                    max_rounds=budget.max_rounds,
                )
                _push_event(project_run.id, {
                    "type": "verifier_loop_done",
                    "result": verifier_result,
                })
                # Mark round/stop reason on the project run
                project_run = db.query(ProjectRun).filter(
                    ProjectRun.id == project_run.id
                ).first()
                if project_run is not None:
                    project_run.stop_reason = verifier_result.get("stop_reason") or "NORMAL"
                    project_run.stop_round = verifier_result.get("rounds")
                    project_run.round = verifier_result.get("rounds", 0)
                    db.commit()
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
        feedback_prefix: str | None = None,
    ) -> list[tuple[ProjectTask, dict]]:
        """Run multiple workers concurrently bounded by max_agents.

        Each worker gets its own Session so SQLAlchemy isn't shared across tasks.
        """
        max_parallel = max(1, min(WORKER_CONCURRENCY, len(tasks)))
        semaphore = asyncio.Semaphore(max_parallel)
        project_run_id = project_run.id
        task_snapshots = [(t.id, t.title, t.role) for t in tasks]
        is_patch_mode = (project_run.mode or "") in PATCH_MODES
        project_root = PROJECT_ROOT if is_patch_mode else None

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
                        project_root=project_root,
                        feedback_prefix=feedback_prefix,
                    )
                    local_task.status = (
                        "completed" if agent.status == "completed" else "failed"
                    )

                    # V2.6 Patch Mode: extract and validate patch
                    patch_combined = output.pop("patch_combined", "")
                    if patch_combined and is_patch_mode:
                        validation = validate_patch(
                            patch_combined, local_task.allowed_files or []
                        )
                        write_artifact(
                            db=local_db, project_run_id=project_run_id,
                            artifact_type="patch",
                            name=f"patch-{role}-{task_id}.diff",
                            content=patch_combined,
                            task_id=task_id, agent_run_id=agent.id,
                            metadata=validation.model_dump(),
                        )
                        if not validation.valid:
                            local_task.status = "validation_failed"
                            local_task.metadata_json = {
                                **(local_task.metadata_json or {}),
                                "patch_violations": validation.violations,
                            }

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

    def _apply_patch_artifact(self, db: Session, artifact, project_run: ProjectRun) -> dict:
        """Apply a single ``type=='patch'`` artifact to the project source tree.

        Returns a result dict: ``{ok: bool, files: [...], error?: str}``.
        Never raises — failures are captured so the verifier loop can decide
        whether to retry or stop.
        """
        import subprocess
        import tempfile

        diff_text = artifact.content_text or ""
        if not diff_text.strip():
            return {"ok": False, "files": [], "error": "empty patch"}

        with tempfile.NamedTemporaryFile(mode="w", suffix=".diff", delete=False) as f:
            f.write(diff_text)
            tmp_path = f.name

        paths: set[str] = set()
        try:
            check = subprocess.run(
                ["git", "apply", "--check", tmp_path],
                cwd=str(PROJECT_ROOT),
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            if check.returncode != 0:
                return {
                    "ok": False,
                    "files": [],
                    "error": f"dry-run failed: {check.stderr.strip()[:500]}",
                }

            apply = subprocess.run(
                ["git", "apply", tmp_path],
                cwd=str(PROJECT_ROOT),
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            if apply.returncode != 0:
                return {
                    "ok": False,
                    "files": [],
                    "error": f"apply failed: {apply.stderr.strip()[:500]}",
                }

            paths = set(
                _DIFF_HEADER_RE.findall(diff_text) + _DIFF_HEADER_NEW_RE.findall(diff_text)
            )
            paths.discard("/dev/null")
            paths.discard("dev/null")
            for p in paths:
                subprocess.run(
                    ["git", "add", p],
                    cwd=str(PROJECT_ROOT),
                    capture_output=True,
                    timeout=10,
                    check=False,
                )

            artifact.metadata_json = {
                **(artifact.metadata_json or {}),
                "applied": True,
                "appliedAt": datetime.now(UTC).isoformat(),
            }
            db.commit()
            return {"ok": True, "files": sorted(paths), "error": ""}
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    async def _run_verifier_loop(
        self,
        *,
        db: Session,
        project_run: ProjectRun,
        tasks: list[ProjectTask],
        planner_output: dict,
        tracker: BudgetTracker,
        worker_model_id: str,
        verifier_model_id: str,
        max_rounds: int,
    ) -> dict:
        """V2.7 Controlled Auto loop.

        For each round:
          1. Collect ``type=='patch'`` artifacts (only from this run).
          2. ``git apply --check`` + ``git apply`` each.
          3. Run pytest on the project.
          4. Call ``run_verifier`` to get a structured verdict.
          5. If ``verdict == "pass"`` → return success.
          6. Otherwise re-run the Worker roles named in ``next_actions`` with
             the verifier's instructions injected into the prompt.

        Returns a dict with keys: ``status`` ("pass" | "exhausted" | "no_patches"),
        ``rounds``, ``failed_tests`` (last), ``verifier_output`` (last).
        """
        from datetime import UTC  # local import keeps top of file clean

        previous_verdicts: list[dict] = []
        original_tasks_payload = [
            {
                "id": t.id,
                "role": t.role,
                "title": t.title,
                "description": t.description or "",
            }
            for t in tasks
        ]

        last_failed_tests: list[dict] = []
        last_verifier_output: dict = {}
        last_pytest_summary: dict = {}

        for round_idx in range(max_rounds):
            try:
                tracker.reserve_round()
            except BudgetExceeded as exc:
                return {
                    "status": "exhausted",
                    "rounds": round_idx,
                    "stop_reason": "MAX_ROUNDS",
                    "failed_tests": last_failed_tests,
                    "verifier_output": last_verifier_output,
                    "pytest_summary": last_pytest_summary,
                    "error": str(exc),
                }

            _push_event(project_run.id, {
                "type": "verifier_round",
                "round": round_idx + 1,
                "maxRounds": max_rounds,
                "status": "running",
            })

            # 1) Collect patch artifacts
            from app.db.models import Artifact

            patches = (
                db.query(Artifact)
                .filter(
                    Artifact.project_run_id == project_run.id,
                    Artifact.type == "patch",
                )
                .order_by(Artifact.created_at.asc())
                .all()
            )
            # Filter: only patches not yet applied; round > 0 re-runs workers
            # which produce new patches with newer created_at.
            unapplied = [a for a in patches if not (a.metadata_json or {}).get("applied")]
            if not unapplied and round_idx == 0:
                # No patches at all → verifier loop is a no-op
                return {
                    "status": "no_patches",
                    "rounds": 0,
                    "stop_reason": "NO_PATCHES",
                    "failed_tests": [],
                    "verifier_output": {},
                    "pytest_summary": {},
                }

            # 2) Apply each unapplied patch
            applied_files: list[str] = []
            apply_failures: list[str] = []
            for art in unapplied:
                result = self._apply_patch_artifact(db, art, project_run)
                if result["ok"]:
                    applied_files.extend(result["files"])
                else:
                    apply_failures.append(f"{art.name}: {result['error']}")

            if apply_failures and not applied_files:
                # Couldn't apply anything — bail out with stop_reason
                _push_event(project_run.id, {
                    "type": "verifier_round",
                    "round": round_idx + 1,
                    "status": "apply_failed",
                    "errors": apply_failures,
                })
                return {
                    "status": "exhausted",
                    "rounds": round_idx + 1,
                    "stop_reason": "PATCH_APPLY_FAILED",
                    "failed_tests": [{"nodeid": "patch.apply", "message": "; ".join(apply_failures)}],
                    "verifier_output": {},
                    "pytest_summary": {},
                }

            # 3) Run pytest
            test_paths = self._collect_test_paths(db, project_run, tasks)
            py_result = run_pytest(
                PROJECT_ROOT,
                test_paths=test_paths or None,
                timeout_s=300,
            )
            last_pytest_summary = py_result.summary_dict()
            last_failed_tests = py_result.failed_tests_dict()
            _push_event(project_run.id, {
                "type": "verifier_round",
                "round": round_idx + 1,
                "status": "pytest_completed",
                "pytest": last_pytest_summary,
            })

            # Check for repeated identical test failures
            current_failed_ids = {ft.get("nodeid", "") for ft in last_failed_tests}
            if tracker.record_failed_tests(current_failed_ids):
                _push_event(project_run.id, {
                    "type": "verifier_round",
                    "round": round_idx + 1,
                    "status": "repeated_test_failure",
                })
                return {
                    "status": "exhausted",
                    "rounds": round_idx + 1,
                    "stop_reason": "REPEATED_TEST_FAILURE",
                    "failed_tests": last_failed_tests,
                    "verifier_output": last_verifier_output,
                    "pytest_summary": last_pytest_summary,
                }

            # 4) Call verifier
            verifier_agent, verifier_output = await run_verifier(
                db=db,
                project_run_id=project_run.id,
                budget=tracker,
                model_id=verifier_model_id,
                applied_files=applied_files,
                pytest_summary=last_pytest_summary,
                failed_tests=last_failed_tests,
                round_index=round_idx,
                previous_verdicts=previous_verdicts,
                original_tasks=original_tasks_payload,
            )
            last_verifier_output = verifier_output
            previous_verdicts.append({
                "round": round_idx + 1,
                "verdict": verifier_output.get("verdict"),
                "failed_tests": last_failed_tests,
            })
            write_artifact(
                db=db, project_run_id=project_run.id,
                artifact_type="verifier_report",
                name=f"verifier-round-{round_idx + 1}.json",
                content=json.dumps({
                    "round": round_idx + 1,
                    "verdict": verifier_output.get("verdict"),
                    "applied_files": applied_files,
                    "pytest": last_pytest_summary,
                    "failed_tests": last_failed_tests,
                    "analysis": verifier_output.get("analysis", ""),
                    "next_actions": verifier_output.get("next_actions", []),
                }, ensure_ascii=False),
                agent_run_id=verifier_agent.id,
            )
            db.commit()

            # 5) Verdict = pass → done
            if verifier_output.get("verdict") == "pass":
                _push_event(project_run.id, {
                    "type": "verifier_round",
                    "round": round_idx + 1,
                    "status": "verifier_pass",
                })
                return {
                    "status": "pass",
                    "rounds": round_idx + 1,
                    "stop_reason": "VERIFIER_PASS",
                    "failed_tests": [],
                    "verifier_output": verifier_output,
                    "pytest_summary": last_pytest_summary,
                }

            # 6) Verdict = fail → re-run workers with verifier feedback
            next_actions = verifier_output.get("next_actions") or []
            roles_to_rerun = [a.get("worker_role") for a in next_actions if a.get("worker_role")]
            if not roles_to_rerun:
                # Verifier didn't suggest a fix — stop
                return {
                    "status": "exhausted",
                    "rounds": round_idx + 1,
                    "stop_reason": "NO_NEXT_ACTIONS",
                    "failed_tests": last_failed_tests,
                    "verifier_output": verifier_output,
                    "pytest_summary": last_pytest_summary,
                }

            _push_event(project_run.id, {
                "type": "verifier_round",
                "round": round_idx + 1,
                "status": "rerunning_workers",
                "roles": roles_to_rerun,
            })

            rerun_tasks = [t for t in tasks if t.role in roles_to_rerun]
            if not rerun_tasks:
                continue

            # Build a feedback prefix to inject into each worker prompt
            feedback_lines = [
                f"## Verifier feedback (round {round_idx + 1})",
                verifier_output.get("analysis", ""),
                "",
                "## Failed tests",
            ]
            for ft in last_failed_tests[:5]:
                feedback_lines.append(
                    f"- {ft.get('nodeid', '?')}: {(ft.get('message') or '')[:300]}"
                )
            feedback_lines.append("")
            feedback_lines.append("## Your specific instruction")
            for action in next_actions:
                if action.get("worker_role") in roles_to_rerun:
                    feedback_lines.append(
                        f"[{action['worker_role']}] {action.get('instruction', '')}"
                    )
            feedback_prefix = "\n".join(feedback_lines)

            # Re-run the workers (they will produce new patch artifacts)
            await self._run_workers_parallel(
                project_run=project_run,
                tasks=rerun_tasks,
                planner_output=planner_output,
                tracker=tracker,
                model_id=worker_model_id,
                feedback_prefix=feedback_prefix,
            )
            db.commit()

        return {
            "status": "exhausted",
            "rounds": max_rounds,
            "stop_reason": "MAX_ROUNDS",
            "failed_tests": last_failed_tests,
            "verifier_output": last_verifier_output,
            "pytest_summary": last_pytest_summary,
        }

    def _collect_test_paths(
        self, db: Session, project_run: ProjectRun, tasks: list[ProjectTask],
    ) -> list[str]:
        """Collect pytest test paths from the tasks' ``acceptance_criteria``
        + the integration test directory if present. Best-effort; missing
        paths are dropped at the runner level."""
        from app.db.models import ProjectMemory

        paths: list[str] = []
        for t in tasks:
            for c in t.acceptance_criteria or []:
                # acceptance_criteria strings may include "pytest tests/test_x.py"
                if "pytest" in c.lower() and ".py" in c:
                    parts = c.split()
                    for tok in parts:
                        if tok.endswith(".py") or "/" in tok:
                            paths.append(tok)
        # De-dupe and drop project-memories-stored test_paths (future)
        return list(dict.fromkeys(paths))

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