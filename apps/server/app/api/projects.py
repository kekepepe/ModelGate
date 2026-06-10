"""Project Mode V2.5 API routes.

Endpoints:
- POST    /api/projects              create + start a new project run (Intake → Planner)
- GET     /api/projects              list project runs
- GET     /api/projects/{id}         get project run details + tasks + agent runs
- GET     /api/projects/{id}/events  SSE stream of progress events
- POST    /api/projects/{id}/approve approve planner output, start workers + supervisor + integrator
- POST    /api/projects/{id}/cancel  cancel an in-flight run
- DELETE  /api/projects/{id}         delete a run (any state) + cascade
- GET     /api/projects/{id}/artifacts/{artifact_id}  fetch artifact content
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.models import AgentRun, Artifact, ProjectMemory, ProjectRun, ProjectTask
from app.db.session import get_db
from app.services.project_runtime.artifacts import serialize_artifact
from app.services.project_runtime.budget import Budget
from app.services.project_runtime.orchestrator import (
    pop_events,
    project_orchestrator,
)

router = APIRouter()

_VALID_STATUSES_FOR_CANCEL = {"running", "awaiting_approval"}

# Keep references to background orchestrator tasks so they are not garbage-collected
# while in flight. Tasks self-discard on completion.
_BACKGROUND_TASKS: set[asyncio.Task[Any]] = set()


def _spawn_background(coro: Any) -> None:
    task = asyncio.create_task(coro)
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)


def _serialize_project_run(pr: ProjectRun) -> dict[str, Any]:
    return {
        "id": pr.id,
        "title": pr.title,
        "goal": pr.goal,
        "status": pr.status,
        "mode": pr.mode,
        "intakeModelId": pr.intake_model_id,
        "plannerModelId": pr.planner_model_id,
        "supervisorModelId": pr.supervisor_model_id,
        "integratorModelId": pr.integrator_model_id,
        "workerModelId": pr.worker_model_id,
        "intake": pr.intake_json,
        "budget": pr.budget_json,
        "usage": pr.usage_json,
        "errorType": pr.error_type,
        "errorMessage": pr.error_message,
        "round": pr.round,
        "stopReason": pr.stop_reason,
        "stopRound": pr.stop_round,
        "startedAt": pr.started_at.isoformat() if pr.started_at else None,
        "completedAt": pr.completed_at.isoformat() if pr.completed_at else None,
        "createdAt": pr.created_at.isoformat() if pr.created_at else None,
    }


def _serialize_task(task: ProjectTask) -> dict[str, Any]:
    return {
        "id": task.id,
        "projectRunId": task.project_run_id,
        "parentTaskId": task.parent_task_id,
        "title": task.title,
        "description": task.description,
        "role": task.role,
        "status": task.status,
        "priority": task.priority,
        "dependsOn": task.depends_on or [],
        "allowedFiles": task.allowed_files or [],
        "acceptanceCriteria": task.acceptance_criteria or [],
        "assignedModelId": task.assigned_model_id,
        "assignedProviderId": task.assigned_provider_id,
        "metadata": task.metadata_json,
    }


def _serialize_agent_run(ag: AgentRun) -> dict[str, Any]:
    return {
        "id": ag.id,
        "projectRunId": ag.project_run_id,
        "taskId": ag.task_id,
        "runId": ag.run_id,
        "role": ag.role,
        "status": ag.status,
        "modelId": ag.model_id,
        "providerId": ag.provider_id,
        "prompt": ag.prompt,
        "output": ag.output_json,
        "inputTokens": ag.input_tokens,
        "outputTokens": ag.output_tokens,
        "totalTokens": ag.total_tokens,
        "latencyMs": ag.latency_ms,
        "errorType": ag.error_type,
        "errorMessage": ag.error_message,
        "startedAt": ag.started_at.isoformat() if ag.started_at else None,
        "completedAt": ag.completed_at.isoformat() if ag.completed_at else None,
    }


@router.post("")
async def create_project_run(
    body: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    goal = (body.get("goal") or "").strip()
    if not goal:
        raise HTTPException(status_code=422, detail="`goal` is required")

    pr = ProjectRun(
        id=f"pr_{uuid4().hex}",
        title=(body.get("title") or goal[:80]),
        goal=goal,
        status="pending",
        mode=body.get("mode", "advisory"),
        intake_model_id=body.get("intakeModelId"),
        planner_model_id=body.get("plannerModelId"),
        supervisor_model_id=body.get("supervisorModelId"),
        integrator_model_id=body.get("integratorModelId"),
        worker_model_id=body.get("workerModelId"),
        budget_json=body.get("budget"),
        started_at=datetime.now(UTC),
    )
    db.add(pr)
    db.commit()
    db.refresh(pr)

    budget = Budget.from_dict(body.get("budget"))

    # Schedule orchestrator in background so request returns immediately.
    _spawn_background(project_orchestrator.run(project_run=pr, budget=budget))

    return {"data": _serialize_project_run(pr)}


@router.get("")
def list_project_runs(
    limit: int = 50,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    rows = (
        db.query(ProjectRun)
        .order_by(desc(ProjectRun.created_at))
        .limit(min(max(limit, 1), 200))
        .all()
    )
    return {"data": [_serialize_project_run(r) for r in rows]}


@router.get("/{project_run_id}")
def get_project_run(
    project_run_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    pr = db.query(ProjectRun).filter(ProjectRun.id == project_run_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="ProjectRun not found")

    tasks = db.query(ProjectTask).filter_by(project_run_id=project_run_id).all()
    agents = (
        db.query(AgentRun)
        .filter_by(project_run_id=project_run_id)
        .order_by(AgentRun.created_at.asc())
        .all()
    )
    artifacts = (
        db.query(Artifact)
        .filter_by(project_run_id=project_run_id)
        .order_by(Artifact.created_at.asc())
        .all()
    )

    return {
        "data": {
            "projectRun": _serialize_project_run(pr),
            "tasks": [_serialize_task(t) for t in tasks],
            "agentRuns": [_serialize_agent_run(a) for a in agents],
            "artifacts": [serialize_artifact(a) for a in artifacts],
        }
    }


@router.get("/{project_run_id}/events")
def stream_project_events(
    project_run_id: str,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    pr = db.query(ProjectRun).filter(ProjectRun.id == project_run_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="ProjectRun not found")

    async def _generate():
        # Drain queued events, then poll periodically until run reaches terminal state.
        while True:
            events = pop_events(project_run_id)
            for ev in events:
                yield f"data: {json.dumps(ev)}\n\n"
            # Re-read status from DB.
            local = db.query(ProjectRun).filter(ProjectRun.id == project_run_id).first()
            if local and local.status in {"completed", "failed", "budget_exceeded", "cancelled"}:
                # Drain any final events.
                final = pop_events(project_run_id)
                for ev in final:
                    yield f"data: {json.dumps(ev)}\n\n"
                yield f"data: {json.dumps({'type': 'closed'})}\n\n"
                return
            await asyncio.sleep(0.5)

    return StreamingResponse(_generate(), media_type="text/event-stream")


@router.post("/{project_run_id}/approve")
async def approve_project_run(
    project_run_id: str,
    body: dict[str, Any] = Body(default_factory=dict),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    pr = db.query(ProjectRun).filter(ProjectRun.id == project_run_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="ProjectRun not found")
    if pr.status != "awaiting_approval":
        raise HTTPException(
            status_code=409,
            detail=f"ProjectRun is in status '{pr.status}', not awaiting_approval",
        )

    task_ids = body.get("taskIds")
    if task_ids is None:
        # Default: all tasks under this run.
        task_ids = [
            t.id for t in db.query(ProjectTask).filter_by(project_run_id=project_run_id).all()
        ]
    if not task_ids:
        raise HTTPException(status_code=422, detail="No tasks to execute")

    # V2.6: store per-file approvals in task metadata
    file_approvals = body.get("fileApprovals")
    if file_approvals:
        for task_id, approvals in file_approvals.items():
            task = (
                db.query(ProjectTask)
                .filter(
                    ProjectTask.id == task_id,
                    ProjectTask.project_run_id == project_run_id,
                )
                .first()
            )
            if task:
                task.metadata_json = {
                    **(task.metadata_json or {}),
                    "file_approvals": approvals,
                }
        db.commit()

    budget = Budget.from_dict(body.get("budget") or pr.budget_json)
    _spawn_background(
        project_orchestrator.run_approved(
            project_run_id=project_run_id,
            task_ids=list(task_ids),
            budget=budget,
        )
    )
    return {"data": {"projectRunId": project_run_id, "status": "running"}}


@router.post("/{project_run_id}/cancel")
def cancel_project_run(
    project_run_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    pr = db.query(ProjectRun).filter(ProjectRun.id == project_run_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="ProjectRun not found")
    if pr.status not in _VALID_STATUSES_FOR_CANCEL:
        raise HTTPException(
            status_code=409,
            detail=f"ProjectRun is in status '{pr.status}', not cancellable",
        )
    pr.status = "cancelled"
    pr.error_type = "USER_CANCELLED"
    pr.error_message = "Cancelled by user"
    pr.completed_at = datetime.now(UTC)
    db.commit()
    return {"data": _serialize_project_run(pr)}


@router.get("/{project_run_id}/artifacts/{artifact_id}")
def get_artifact(
    project_run_id: str,
    artifact_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    art = (
        db.query(Artifact)
        .filter(Artifact.id == artifact_id, Artifact.project_run_id == project_run_id)
        .first()
    )
    if not art:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {"data": serialize_artifact(art)}


@router.delete("/{project_run_id}")
def delete_project_run(
    project_run_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    pr = db.query(ProjectRun).filter(ProjectRun.id == project_run_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="ProjectRun not found")

    # Cascade in FK-safe order. The schema (alembic 0004) defines these FKs
    # WITHOUT ondelete=CASCADE, so we must delete leaves before parents:
    #   artifacts → agent_runs → project_tasks → project_run.
    # project_tasks also has a self-referential parent_task_id FK; bulk DELETE
    # does not order rows, so null out parent_task_id first to break the cycle.
    db.query(Artifact).filter(Artifact.project_run_id == project_run_id).delete(
        synchronize_session=False
    )
    db.query(AgentRun).filter(AgentRun.project_run_id == project_run_id).delete(
        synchronize_session=False
    )
    db.query(ProjectMemory).filter(ProjectMemory.project_run_id == project_run_id).delete(
        synchronize_session=False
    )
    db.query(ProjectTask).filter(ProjectTask.project_run_id == project_run_id).update(
        {ProjectTask.parent_task_id: None}, synchronize_session=False
    )
    db.query(ProjectTask).filter(ProjectTask.project_run_id == project_run_id).delete(
        synchronize_session=False
    )
    db.delete(pr)
    db.commit()
    return {"data": {"deleted": True, "id": project_run_id}}


# ---------------------------------------------------------------------------
# V2.6 Patch Mode endpoints
# ---------------------------------------------------------------------------


@router.post("/{project_run_id}/patches/{artifact_id}/apply")
def apply_patch(
    project_run_id: str,
    artifact_id: str,
    body: dict[str, Any] = Body(default_factory=dict),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Apply a unified diff patch to the project source tree."""
    pr = db.query(ProjectRun).filter(ProjectRun.id == project_run_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="ProjectRun not found")
    if pr.status != "completed":
        raise HTTPException(
            status_code=409,
            detail=f"ProjectRun is in status '{pr.status}', not completed",
        )

    art = (
        db.query(Artifact)
        .filter(Artifact.id == artifact_id, Artifact.project_run_id == project_run_id)
        .first()
    )
    if not art:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if art.type != "patch":
        raise HTTPException(status_code=422, detail="Artifact is not a patch")

    # Check high-risk files
    validation = (art.metadata_json or {}).get("validation", {})
    high_risk = validation.get("high_risk_files", [])
    if high_risk and not body.get("confirmHighRisk"):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Patch contains high-risk files. Set confirmHighRisk=true to proceed.",
                "highRiskFiles": high_risk,
            },
        )

    diff_text = art.content_text or ""
    if not diff_text.strip():
        raise HTTPException(status_code=422, detail="Patch content is empty")

    # Apply the patch using git apply --check first, then git apply
    import subprocess
    import tempfile

    from app.services.project_runtime.orchestrator import PROJECT_ROOT

    with tempfile.NamedTemporaryFile(mode="w", suffix=".diff", delete=False) as f:
        f.write(diff_text)
        tmp_path = f.name

    try:
        # Dry-run check
        check_result = subprocess.run(
            ["git", "apply", "--check", tmp_path],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if check_result.returncode != 0:
            raise HTTPException(
                status_code=422,
                detail=f"Patch dry-run failed: {check_result.stderr.strip()}",
            )

        # Apply
        apply_result = subprocess.run(
            ["git", "apply", tmp_path],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if apply_result.returncode != 0:
            raise HTTPException(
                status_code=422,
                detail=f"Patch apply failed: {apply_result.stderr.strip()}",
            )

        # Stage modified files
        from app.services.project_runtime.orchestrator import _DIFF_HEADER_NEW_RE, _DIFF_HEADER_RE

        paths = set(_DIFF_HEADER_RE.findall(diff_text) + _DIFF_HEADER_NEW_RE.findall(diff_text))
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

        # Mark artifact as applied
        art.metadata_json = {
            **(art.metadata_json or {}),
            "applied": True,
            "appliedAt": datetime.now(UTC).isoformat(),
        }
        db.commit()

        return {"data": {"applied": True, "files": sorted(paths)}}
    finally:
        import os

        os.unlink(tmp_path)


@router.post("/{project_run_id}/patches/{artifact_id}/reject")
def reject_patch(
    project_run_id: str,
    artifact_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Mark a patch artifact as rejected."""
    art = (
        db.query(Artifact)
        .filter(Artifact.id == artifact_id, Artifact.project_run_id == project_run_id)
        .first()
    )
    if not art:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if art.type != "patch":
        raise HTTPException(status_code=422, detail="Artifact is not a patch")

    art.metadata_json = {
        **(art.metadata_json or {}),
        "rejected": True,
        "rejectedAt": datetime.now(UTC).isoformat(),
    }
    db.commit()
    return {"data": {"rejected": True, "artifactId": artifact_id}}


@router.post("/{project_run_id}/patches/regenerate")
async def regenerate_patches(
    project_run_id: str,
    body: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Re-run workers for specific tasks to regenerate patches."""
    pr = db.query(ProjectRun).filter(ProjectRun.id == project_run_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="ProjectRun not found")
    if pr.status not in ("completed", "failed", "validation_failed"):
        raise HTTPException(
            status_code=409,
            detail=f"ProjectRun is in status '{pr.status}', cannot regenerate",
        )

    task_ids = body.get("taskIds")
    if not task_ids:
        raise HTTPException(status_code=422, detail="taskIds is required")

    # Verify tasks exist
    tasks = (
        db.query(ProjectTask)
        .filter(
            ProjectTask.project_run_id == project_run_id,
            ProjectTask.id.in_(task_ids),
        )
        .all()
    )
    if not tasks:
        raise HTTPException(status_code=404, detail="No matching tasks found")

    budget = Budget.from_dict(body.get("budget") or pr.budget_json)

    # Reset run status to running
    pr.status = "running"
    pr.error_type = None
    pr.error_message = None
    db.commit()

    _spawn_background(
        project_orchestrator.run_approved(
            project_run_id=project_run_id,
            task_ids=list(task_ids),
            budget=budget,
        )
    )
    return {"data": {"projectRunId": project_run_id, "status": "running", "regenerating": task_ids}}


@router.post("/{project_run_id}/retry-planner")
async def retry_planner(
    project_run_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Re-run the planner phase for a failed project run."""
    pr = db.query(ProjectRun).filter(ProjectRun.id == project_run_id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="ProjectRun not found")
    if pr.status not in ("failed",):
        raise HTTPException(
            status_code=409,
            detail=f"ProjectRun is in status '{pr.status}', cannot retry planner",
        )
    if not pr.intake_json:
        raise HTTPException(
            status_code=409,
            detail="No intake output available to re-run planner from",
        )

    budget = Budget.from_dict(pr.budget_json)

    _spawn_background(
        project_orchestrator.retry_planner(
            project_run_id=project_run_id,
            budget=budget,
        )
    )
    return {"data": {"projectRunId": project_run_id, "status": "running"}}
