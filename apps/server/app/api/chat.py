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
from app.providers.base import ChatMessage
from app.services.chat_runtime import FILE_CONTEXT_BEGIN, FILE_CONTEXT_END, chat_runtime
from app.services.context_builder import (
    DEFAULT_BUDGET_RATIO,
    ContextTruncationMeta,
    build_context_messages,
    estimate_tokens,
)
from app.services.conversation_summary import maybe_generate_summary_async
from app.services.model_registry import model_registry

router = APIRouter()

CONTEXT_BUDGET_RATIOS: dict[str, float] = {
    "auto": DEFAULT_BUDGET_RATIO,
    "conservative": 0.50,
    "balanced": 0.70,
    "aggressive": 0.85,
}


def _resolve_budget_ratio(params: dict) -> float:
    """Map contextBudget param value to a budget ratio float."""
    raw = params.get("contextBudget", "auto")
    return CONTEXT_BUDGET_RATIOS.get(str(raw), DEFAULT_BUDGET_RATIO)


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


def _build_context_for_stream(
    *,
    db: Session,
    conversation_id: str,
    task_type: str,
    model_id: str,
    prompt: str,
    file_ids: list[str],
    system_prompt_override: str | None,
    current_user_message_id: str,
    budget_ratio: float = DEFAULT_BUDGET_RATIO,
) -> tuple[list[ChatMessage], dict | None]:
    """Load conversation history and build trimmed context messages.

    Returns (history_messages, context_truncation_meta_dict_or_none).
    If there is no prior history, returns ([], None) so the caller falls through
    to the runtime's default _build_messages.
    """
    from app.db.models import FileRecord

    # Check if conversation has any prior messages
    prior_count = (
        db.query(Message)
        .filter(
            Message.conversation_id == conversation_id,
            Message.status == "completed",
            Message.id != current_user_message_id,
        )
        .count()
    )
    if prior_count == 0:
        return [], None

    # Build system + current user messages (mirrors chat_runtime._build_messages logic)
    system_prompt = system_prompt_override or chat_runtime._system_prompt(task_type)

    files: list[FileRecord] = []
    for fid in file_ids:
        rec = db.get(FileRecord, fid)
        if rec and rec.status in ("uploaded", "parsed") and rec.direct_usable:
            files.append(rec)

    file_context = ""
    if files:
        blocks = [FILE_CONTEXT_BEGIN]
        for record in files:
            metadata = record.metadata_json or {}
            parsed_text = str(metadata.get("parsedText") or "")
            blocks.append(
                "\n".join(
                    [
                        f"FILE_ID: {record.id}",
                        f"ORIGINAL_NAME: {record.original_name}",
                        f"DETECTED_TYPE: {record.detected_type}",
                        "CONTENT:",
                        parsed_text[:120_000],
                    ]
                )
            )
        blocks.append(FILE_CONTEXT_END)
        file_context = "\n\n".join(blocks)

    user_text = prompt.strip()
    if file_context:
        user_text = f"{file_context}\n\nUSER_PROMPT:\n{user_text}" if user_text else file_context

    system_message = ChatMessage(role="system", content=system_prompt)
    current_user_message = ChatMessage(role="user", content=user_text)
    file_ctx_tokens = estimate_tokens(file_context) if file_context else 0

    # Get model context_window
    model_cfg = model_registry.get_model(model_id)
    ctx_window = (model_cfg or {}).get("contextWindow")

    # Load conversation summary if available
    conv = db.get(Conversation, conversation_id)
    summary_text = getattr(conv, "summary", None) if conv else None

    # Build context with budget trimming
    all_messages, meta = build_context_messages(
        db=db,
        conversation_id=conversation_id,
        current_user_message=current_user_message,
        system_message=system_message,
        model_context_window=ctx_window,
        budget_ratio=budget_ratio,
        file_context_tokens=file_ctx_tokens,
        current_user_message_id=current_user_message_id,
        summary_text=summary_text,
    )

    # If no prior messages were included, nothing to do
    if meta.included_count == 0:
        return [], None

    # Return history only (exclude system at index 0 and current user at end)
    history = all_messages[1:-1]
    return history, meta.to_dict()


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

    # V3.3: Build multi-turn context from conversation history
    history, ctx_meta = _build_context_for_stream(
        db=db,
        conversation_id=conversation_id,
        task_type=input_data.taskType,
        model_id=input_data.modelId,
        prompt=input_data.prompt,
        file_ids=input_data.fileIds,
        system_prompt_override=None,
        current_user_message_id=user_msg.id,
        budget_ratio=_resolve_budget_ratio(input_data.params),
    )

    record = await chat_runtime.run_chat(
        db=db,
        task_type=input_data.taskType,
        model_id=input_data.modelId,
        prompt=input_data.prompt,
        file_ids=input_data.fileIds,
        params=input_data.params,
        idempotency_key=input_data.idempotencyKey,
        compare_group_id=input_data.compareGroupId,
        history=history if history else None,
    )

    # V3.3: Write truncation metadata to run
    if ctx_meta and record.metadata_json:
        record.metadata_json["context_truncation"] = ctx_meta
        db.commit()
        db.refresh(record)
    elif ctx_meta:
        record.metadata_json = {"context_truncation": ctx_meta}
        db.commit()
        db.refresh(record)

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

    # V3.5: Trigger async summary generation if thresholds met
    if record.status == "completed":
        await maybe_generate_summary_async(db, conversation_id, input_data.modelId)

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

    # V3.3: Build multi-turn context from conversation history
    history, ctx_meta = _build_context_for_stream(
        db=db,
        conversation_id=conversation_id,
        task_type=input_data.taskType,
        model_id=input_data.modelId,
        prompt=input_data.prompt,
        file_ids=input_data.fileIds,
        system_prompt_override=None,
        current_user_message_id=user_message_id,
        budget_ratio=_resolve_budget_ratio(input_data.params),
    )

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
            history=history if history else None,
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

            # V3.3: Write truncation metadata to run
            if run_id and ctx_meta:
                run_rec = db.get(Run, run_id)
                if run_rec:
                    if run_rec.metadata_json:
                        run_rec.metadata_json["context_truncation"] = ctx_meta
                    else:
                        run_rec.metadata_json = {"context_truncation": ctx_meta}

            db.commit()

            # V3.5: Trigger async summary generation if thresholds met
            if final_status == "completed":
                await maybe_generate_summary_async(db, conversation_id, input_data.modelId)
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
