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


def _serialize_project_run(pr: ProjectRun) -> dict[str, Any]:
    return {
        "id": pr.id,
        "title": pr.title,
        "goal": pr.goal,
        "status": pr.status,
        "mode": pr.mode,
        "plannerModelId": pr.planner_model_id,
        "supervisorModelId": pr.supervisor_model_id,
        "integratorModelId": pr.integrator_model_id,
        "workerModelId": pr.worker_model_id,
        "intake": pr.intake_json,
        "budget": pr.budget_json,
        "usage": pr.usage_json,
        "errorType": pr.error_type,
        "errorMessage": pr.error_message,
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
    asyncio.create_task(project_orchestrator.run(project_run=pr, budget=budget))

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

    budget = Budget.from_dict(body.get("budget") or pr.budget_json)
    asyncio.create_task(
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

    # Cascade: tasks, agent runs, artifacts, memory entries.
    db.query(ProjectTask).filter(ProjectTask.project_run_id == project_run_id).delete()
    db.query(AgentRun).filter(AgentRun.project_run_id == project_run_id).delete()
    db.query(Artifact).filter(Artifact.project_run_id == project_run_id).delete()
    db.query(ProjectMemory).filter(ProjectMemory.project_run_id == project_run_id).delete()
    db.delete(pr)
    db.commit()
    return {"data": {"deleted": True, "id": project_run_id}}
