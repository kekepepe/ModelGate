from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.models import Conversation, Message
from app.db.session import get_db

router = APIRouter()


class CreateConversationInput(BaseModel):
    title: str = "New Chat"
    taskType: str = "chat"
    modelId: str | None = None
    params: dict | None = None


class PatchConversationInput(BaseModel):
    title: str | None = None
    modelId: str | None = None
    params: dict | None = None


def serialize_conversation(record: Conversation, messages: list[Message] | None = None) -> dict:
    result: dict[str, Any] = {
        "id": record.id,
        "title": record.title,
        "taskType": record.task_type,
        "modelId": record.model_id,
        "params": record.params_json,
        "status": record.status,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "updatedAt": record.updated_at.isoformat() if record.updated_at else None,
    }
    if messages is not None:
        result["messages"] = [serialize_message(m) for m in messages]
    return result


def serialize_message(record: Message) -> dict:
    return {
        "id": record.id,
        "conversationId": record.conversation_id,
        "role": record.role,
        "content": record.content,
        "modelId": record.model_id,
        "providerId": record.provider_id,
        "runId": record.run_id,
        "parentMessageId": record.parent_message_id,
        "status": record.status,
        "errorMessage": record.error_message,
        "metadata": record.metadata_json,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
    }


@router.post("")
def create_conversation(input_data: CreateConversationInput, db: Session = Depends(get_db)):
    now = datetime.now(UTC)
    conv = Conversation(
        id=f"conv_{uuid4().hex}",
        title=input_data.title,
        task_type=input_data.taskType,
        model_id=input_data.modelId,
        params_json=input_data.params,
        status="active",
        created_at=now,
        updated_at=now,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {"data": serialize_conversation(conv)}


@router.get("")
def list_conversations(db: Session = Depends(get_db)):
    rows = (
        db.query(Conversation)
        .filter(Conversation.status == "active")
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    return {"data": [serialize_conversation(r) for r in rows]}


@router.get("/{conversation_id}")
def get_conversation(conversation_id: str, db: Session = Depends(get_db)):
    conv = db.get(Conversation, conversation_id)
    if conv is None or conv.status == "deleted":
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return {"data": serialize_conversation(conv, messages)}


@router.patch("/{conversation_id}")
def patch_conversation(conversation_id: str, input_data: PatchConversationInput, db: Session = Depends(get_db)):
    conv = db.get(Conversation, conversation_id)
    if conv is None or conv.status == "deleted":
        raise HTTPException(status_code=404, detail="Conversation not found")
    if input_data.title is not None:
        conv.title = input_data.title
    if input_data.modelId is not None:
        conv.model_id = input_data.modelId
    if input_data.params is not None:
        conv.params_json = input_data.params
    conv.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(conv)
    return {"data": serialize_conversation(conv)}


@router.delete("/{conversation_id}")
def delete_conversation(conversation_id: str, db: Session = Depends(get_db)):
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    # Delete messages first (no CASCADE FK — lesson from V2.5 Postgres delete bug)
    db.query(Message).filter(Message.conversation_id == conversation_id).delete(synchronize_session=False)
    conv.status = "deleted"
    conv.updated_at = datetime.now(UTC)
    db.commit()
    return {"data": {"id": conversation_id, "status": "deleted"}}
