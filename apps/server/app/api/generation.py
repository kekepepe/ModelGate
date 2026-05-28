from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import GenerationTask
from app.db.session import get_db
from app.services.model_registry import model_registry

router = APIRouter()


class CreateGenerationTaskInput(BaseModel):
    taskType: str
    modelId: str
    input: dict = Field(default_factory=dict)
    params: dict = Field(default_factory=dict)
    idempotencyKey: str | None = None


def serialize_task(record: GenerationTask) -> dict:
    return {
        "id": record.id,
        "providerId": record.provider_id,
        "modelId": record.model_id,
        "providerTaskId": record.provider_task_id,
        "taskType": record.task_type,
        "input": record.input_json,
        "params": record.params_json,
        "output": record.output_json,
        "providerStatus": record.provider_status,
        "status": record.status,
        "progress": record.progress,
        "errorType": record.error_type,
        "errorMessage": record.error_message,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
    }


@router.post("/tasks")
async def create_generation_task(
    input_data: CreateGenerationTaskInput,
    db: Session = Depends(get_db),
):
    model = model_registry.get_model(input_data.modelId)
    if input_data.taskType not in model.get("taskTypes", []):
        raise AppError("MODEL_TASK_UNSUPPORTED", "Selected model does not support this task.", 400)

    task = GenerationTask(
        id=f"task_{uuid4().hex}",
        provider_id=model["provider"],
        model_id=model["id"],
        task_type=input_data.taskType,
        input_json=input_data.input,
        params_json=input_data.params,
        status="queued",
        progress=0,
        idempotency_key=input_data.idempotencyKey,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return {"data": serialize_task(task)}


@router.get("/tasks/{task_id}")
async def get_generation_task(task_id: str, db: Session = Depends(get_db)):
    record = db.get(GenerationTask, task_id)
    if record is None:
        raise AppError("GENERATION_TASK_NOT_FOUND", f"Task not found: {task_id}", 404)
    return {"data": serialize_task(record)}


@router.get("/tasks/{task_id}/result")
async def get_generation_task_result(task_id: str, db: Session = Depends(get_db)):
    record = db.get(GenerationTask, task_id)
    if record is None:
        raise AppError("GENERATION_TASK_NOT_FOUND", f"Task not found: {task_id}", 404)
    return {"data": record.output_json or {"status": record.status, "progress": record.progress}}


@router.post("/tasks/{task_id}/cancel")
async def cancel_generation_task(task_id: str, db: Session = Depends(get_db)):
    record = db.get(GenerationTask, task_id)
    if record is None:
        raise AppError("GENERATION_TASK_NOT_FOUND", f"Task not found: {task_id}", 404)
    if record.status not in {"completed", "failed", "cancelled", "expired"}:
        record.status = "cancelled"
        db.commit()
        db.refresh(record)
    return {"data": serialize_task(record)}


@router.post("/tasks/{task_id}/rerun")
async def rerun_generation_task(task_id: str, db: Session = Depends(get_db)):
    record = db.get(GenerationTask, task_id)
    if record is None:
        raise AppError("GENERATION_TASK_NOT_FOUND", f"Task not found: {task_id}", 404)
    cloned = GenerationTask(
        id=f"task_{uuid4().hex}",
        provider_id=record.provider_id,
        model_id=record.model_id,
        task_type=record.task_type,
        input_json=record.input_json,
        params_json=record.params_json,
        status="queued",
        progress=0,
    )
    db.add(cloned)
    db.commit()
    db.refresh(cloned)
    return {"data": serialize_task(cloned)}
