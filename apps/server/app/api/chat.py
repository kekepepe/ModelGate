import json
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import Conversation, Message, Run
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
    compareGroupId: str | None = None
    conversationId: str | None = None


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
        "metadata": record.metadata_json,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "startedAt": record.started_at.isoformat() if record.started_at else None,
        "completedAt": record.completed_at.isoformat() if record.completed_at else None,
    }


@router.post("/runs")
async def create_run(input_data: CreateRunInput, db: Session = Depends(get_db)):
    conversation_id = input_data.conversationId

    # Resolve or create conversation
    if conversation_id:
        conv = db.get(Conversation, conversation_id)
        if conv is None or conv.status == "deleted":
            raise AppError("CONVERSATION_NOT_FOUND", "Conversation not found.", 404)
    else:
        now = datetime.now(UTC)
        conv = Conversation(
            id=f"conv_{uuid4().hex}",
            title=(input_data.prompt or "")[:50] or "New Chat",
            task_type=input_data.taskType,
            model_id=input_data.modelId,
            params_json=input_data.params if input_data.params else None,
            status="active",
            created_at=now,
            updated_at=now,
        )
        db.add(conv)
        db.flush()
        conversation_id = conv.id

    # Save user message
    now = datetime.now(UTC)
    user_msg = Message(
        id=f"msg_{uuid4().hex}",
        conversation_id=conversation_id,
        role="user",
        content=input_data.prompt,
        status="completed",
        created_at=now,
        updated_at=now,
    )
    db.add(user_msg)
    db.flush()

    record = await chat_runtime.run_chat(
        db=db,
        task_type=input_data.taskType,
        model_id=input_data.modelId,
        prompt=input_data.prompt,
        file_ids=input_data.fileIds,
        params=input_data.params,
        idempotency_key=input_data.idempotencyKey,
        compare_group_id=input_data.compareGroupId,
    )

    # Save assistant message
    assistant_msg = Message(
        id=f"msg_{uuid4().hex}",
        conversation_id=conversation_id,
        role="assistant",
        content=(record.output_json or {}).get("text", ""),
        model_id=input_data.modelId,
        provider_id=record.provider_id,
        run_id=record.id,
        status=record.status if record.status in ("completed", "failed", "cancelled") else "completed",
        error_message=record.error_message,
        created_at=now,
        updated_at=now,
    )
    db.add(assistant_msg)
    conv.updated_at = now
    db.commit()

    result = serialize_run(record)
    result["conversationId"] = conversation_id
    return {"data": result}


@router.post("/runs/stream")
async def stream_run(input_data: CreateRunInput, db: Session = Depends(get_db)):
    conversation_id = input_data.conversationId
    user_message_id = None
    assistant_message_id = None

    # Resolve or create conversation
    if conversation_id:
        conv = db.get(Conversation, conversation_id)
        if conv is None or conv.status == "deleted":
            raise AppError("CONVERSATION_NOT_FOUND", "Conversation not found.", 404)
    else:
        now = datetime.now(UTC)
        conv = Conversation(
            id=f"conv_{uuid4().hex}",
            title=(input_data.prompt or "")[:50] or "New Chat",
            task_type=input_data.taskType,
            model_id=input_data.modelId,
            params_json=input_data.params if input_data.params else None,
            status="active",
            created_at=now,
            updated_at=now,
        )
        db.add(conv)
        db.flush()
        conversation_id = conv.id

    # Save user message
    now = datetime.now(UTC)
    user_msg = Message(
        id=f"msg_{uuid4().hex}",
        conversation_id=conversation_id,
        role="user",
        content=input_data.prompt,
        status="completed",
        created_at=now,
        updated_at=now,
    )
    db.add(user_msg)
    db.flush()
    user_message_id = user_msg.id

    # Pre-create assistant message (streaming)
    assistant_msg = Message(
        id=f"msg_{uuid4().hex}",
        conversation_id=conversation_id,
        role="assistant",
        content="",
        model_id=input_data.modelId,
        status="streaming",
        created_at=now,
        updated_at=now,
    )
    db.add(assistant_msg)
    db.flush()
    assistant_message_id = assistant_msg.id

    conv.updated_at = now
    db.commit()

    async def event_stream():
        accumulated = ""
        final_status = "completed"
        error_msg = None
        run_id = None

        async for event in chat_runtime.stream_chat(
            db=db,
            task_type=input_data.taskType,
            model_id=input_data.modelId,
            prompt=input_data.prompt,
            file_ids=input_data.fileIds,
            params=input_data.params,
            idempotency_key=input_data.idempotencyKey,
            compare_group_id=input_data.compareGroupId,
        ):
            # Accumulate content for message persistence
            if event.get("type") == "delta":
                accumulated += event.get("delta", "")
            elif event.get("type") == "done":
                run_data = event.get("run", {})
                run_id = run_data.get("id")
            elif event.get("type") == "error":
                final_status = "failed"
                error_msg = event.get("message", "Unknown error")
            elif event.get("type") == "cancelled":
                final_status = "cancelled"

            # Inject conversationId into done event
            if event.get("type") == "done":
                event["conversationId"] = conversation_id
                event["messageId"] = assistant_message_id

            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        # Update assistant message after stream ends
        try:
            db.refresh(assistant_msg)
            assistant_msg.content = accumulated
            assistant_msg.status = final_status
            assistant_msg.error_message = error_msg
            assistant_msg.run_id = run_id
            assistant_msg.updated_at = datetime.now(UTC)
            conv.updated_at = datetime.now(UTC)
            db.commit()
        except Exception:
            db.rollback()

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

    # Signal the in-flight chat coroutine first; the runtime will write the
    # terminal cancelled state to the DB inside its except CancelledError
    # branch. Streaming runs rely on the event alone (the SSE generator
    # checks it between deltas); non-streaming runs additionally get a
    # task.cancel() so the in-flight httpx request is interrupted.
    _event, task = chat_runtime.request_cancel(run_id)
    if task is not None and not task.done():
        task.cancel()

    if record.status not in {"completed", "failed", "cancelled"}:
        record.status = "cancelled"
        db.commit()
        db.refresh(record)
    return {"data": serialize_run(record)}
