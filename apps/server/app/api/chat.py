import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import Run
from app.db.session import get_db
from app.services.chat_runtime import chat_runtime

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
    record = await chat_runtime.run_chat(
        db=db,
        task_type=input_data.taskType,
        model_id=input_data.modelId,
        prompt=input_data.prompt,
        file_ids=input_data.fileIds,
        params=input_data.params,
        idempotency_key=input_data.idempotencyKey,
    )
    return {"data": serialize_run(record)}


@router.post("/runs/stream")
async def stream_run(input_data: CreateRunInput, db: Session = Depends(get_db)):
    async def event_stream():
        async for event in chat_runtime.stream_chat(
            db=db,
            task_type=input_data.taskType,
            model_id=input_data.modelId,
            prompt=input_data.prompt,
            file_ids=input_data.fileIds,
            params=input_data.params,
            idempotency_key=input_data.idempotencyKey,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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
