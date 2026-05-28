from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import Run
from app.db.session import get_db
from app.services.model_registry import model_registry

router = APIRouter()


class CreateRunInput(BaseModel):
    taskType: str
    modelId: str
    prompt: str
    fileIds: list[str] = Field(default_factory=list)
    params: dict = Field(default_factory=dict)
    idempotencyKey: str | None = None


def serialize_run(record: Run) -> dict:
    return {
        "id": record.id,
        "taskType": record.task_type,
        "providerId": record.provider_id,
        "modelId": record.model_id,
        "input": record.input_json,
        "params": record.params_json,
        "output": record.output_json,
        "status": record.status,
        "errorType": record.error_type,
        "errorMessage": record.error_message,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "startedAt": record.started_at.isoformat() if record.started_at else None,
        "completedAt": record.completed_at.isoformat() if record.completed_at else None,
    }


@router.post("/runs")
async def create_run(input_data: CreateRunInput, db: Session = Depends(get_db)):
    model = model_registry.get_model(input_data.modelId)
    if input_data.taskType not in model.get("taskTypes", []):
        raise AppError("MODEL_TASK_UNSUPPORTED", "Selected model does not support this task.", 400)

    run_id = f"run_{uuid4().hex}"
    output = {
        "type": "text",
        "text": "Phase 3 local run placeholder. Provider adapters will execute real calls in Phase 6.",
    }
    record = Run(
        id=run_id,
        task_type=input_data.taskType,
        provider_id=model["provider"],
        model_id=model["id"],
        input_json={"prompt": input_data.prompt, "fileIds": input_data.fileIds},
        params_json=input_data.params,
        output_json=output,
        status="completed",
        idempotency_key=input_data.idempotencyKey,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"data": serialize_run(record)}


@router.get("/runs/{run_id}")
async def get_run(run_id: str, db: Session = Depends(get_db)):
    record = db.get(Run, run_id)
    if record is None:
        raise AppError("RUN_NOT_FOUND", f"Run not found: {run_id}", 404)
    return {"data": serialize_run(record)}


@router.get("/runs/{run_id}/events")
async def get_run_events(run_id: str, db: Session = Depends(get_db)):
    record = db.get(Run, run_id)
    if record is None:
        raise AppError("RUN_NOT_FOUND", f"Run not found: {run_id}", 404)
    return {"data": [{"event": "status", "status": record.status, "runId": run_id}]}


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str, db: Session = Depends(get_db)):
    record = db.get(Run, run_id)
    if record is None:
        raise AppError("RUN_NOT_FOUND", f"Run not found: {run_id}", 404)
    if record.status not in {"completed", "failed", "cancelled"}:
        record.status = "cancelled"
        db.commit()
        db.refresh(record)
    return {"data": serialize_run(record)}
