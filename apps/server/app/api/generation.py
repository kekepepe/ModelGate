from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import GenerationTask
from app.db.session import get_db
from app.services.generation_runtime import generation_runtime, resolve_primary_artifact

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
        "startedAt": record.started_at.isoformat() if record.started_at else None,
        "completedAt": record.completed_at.isoformat() if record.completed_at else None,
        "pollAfter": record.poll_after.isoformat() if record.poll_after else None,
        "expiresAt": record.expires_at.isoformat() if record.expires_at else None,
    }


@router.post("/tasks")
async def create_generation_task(
    input_data: CreateGenerationTaskInput,
    db: Session = Depends(get_db),
):
    task = await generation_runtime.create_task(
        db=db,
        task_type=input_data.taskType,
        model_id=input_data.modelId,
        input_json=input_data.input,
        params=input_data.params,
        idempotency_key=input_data.idempotencyKey,
    )
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
    if record.status != "completed":
        # Not ready yet — surface the current state with 409 so the frontend
        # can distinguish "still running" from "done" without parsing JSON.
        return JSONResponse(
            status_code=409,
            content={
                "data": {
                    "taskId": record.id,
                    "status": record.status,
                    "progress": record.progress,
                    "output": record.output_json or {},
                }
            },
        )

    storage_key, kind = resolve_primary_artifact(record)
    if storage_key is not None and kind is not None:
        # Single-artifact tasks (text_to_image / image_to_image / text_to_video /
        # image_to_video): redirect to the streaming-by-key endpoint so the
        # browser handles the download directly. Using a redirect (rather than
        # streaming the bytes through this endpoint) avoids buffering large
        # videos in memory twice.
        return RedirectResponse(
            url=f"/api/files/_by_key/{storage_key}",
            status_code=302,
            headers={
                "Content-Disposition": f'attachment; filename="{record.id}_{kind}{_extension_for_kind(kind)}"'
            },
        )

    # Multi-artifact or no-artifact: return the JSON descriptor so the
    # client can render multiple previews / pick which to download.
    output = dict(record.output_json or {})
    return {
        "data": {
            "taskId": record.id,
            "status": record.status,
            "progress": record.progress,
            "output": output,
        }
    }


def _extension_for_kind(kind: str) -> str:
    return ".mp4" if kind == "video" else ".bin"


@router.post("/tasks/{task_id}/cancel")
async def cancel_generation_task(task_id: str, db: Session = Depends(get_db)):
    record, provider_cancelled = await generation_runtime.cancel_task(db=db, task_id=task_id)
    data = serialize_task(record)
    data["providerCancelled"] = provider_cancelled
    return {"data": data}


@router.post("/tasks/{task_id}/rerun")
async def rerun_generation_task(task_id: str, db: Session = Depends(get_db)):
    cloned = await generation_runtime.rerun_task(db=db, task_id=task_id)
    return {"data": serialize_task(cloned)}
