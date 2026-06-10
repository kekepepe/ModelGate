"""V3.5 Conversation Summary service.

Provides trigger logic and summary generation for long conversations.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.models import Conversation, Message
from app.providers.base import ChatMessage
from app.services.context_builder import estimate_tokens
from app.services.model_registry import model_registry

logger = logging.getLogger(__name__)

# Trigger thresholds
MESSAGE_COUNT_THRESHOLD = 30
TOKEN_USAGE_RATIO = 0.80

# Summary generation prompt
SUMMARY_SYSTEM_PROMPT = (
    "You are a conversation summarizer. Given the full conversation history, "
    "produce a structured summary in markdown with these sections:\n"
    "## User Goals\n"
    "## Key Decisions\n"
    "## Constraints & Preferences\n"
    "## Files & Code Discussed\n"
    "## Pending Items\n\n"
    "Be concise. Use bullet points. Keep the summary under 500 words. "
    "Focus on information that would be useful for continuing the conversation."
)

SUMMARY_USER_PROMPT = (
    "Please summarize the following conversation:\n\n{conversation_text}"
)

# Max chars of conversation text to send for summarization
MAX_CONVERSATION_CHARS = 80_000


def should_generate_summary(db: Session, conversation_id: str, model_id: str | None = None) -> bool:
    """Check if a conversation should trigger summary generation.

    Returns True if:
    - Message count > MESSAGE_COUNT_THRESHOLD, OR
    - Estimated token usage > TOKEN_USAGE_RATIO × model.context_window
    """
    msg_count = (
        db.query(Message)
        .filter(
            Message.conversation_id == conversation_id,
            Message.status == "completed",
        )
        .count()
    )

    if msg_count > MESSAGE_COUNT_THRESHOLD:
        return True

    # Check token usage against model context window
    if model_id:
        model_cfg = model_registry.get_model(model_id)
        ctx_window = (model_cfg or {}).get("contextWindow")
        if ctx_window:
            # Estimate total tokens from all messages
            messages = (
                db.query(Message)
                .filter(
                    Message.conversation_id == conversation_id,
                    Message.status == "completed",
                )
                .all()
            )
            total_tokens = sum(estimate_tokens(m.content or "") for m in messages)
            if total_tokens > ctx_window * TOKEN_USAGE_RATIO:
                return True

    return False


def _build_conversation_text(db: Session, conversation_id: str) -> str:
    """Build a text representation of the conversation for summarization."""
    messages = (
        db.query(Message)
        .filter(
            Message.conversation_id == conversation_id,
            Message.status == "completed",
        )
        .order_by(Message.created_at.asc())
        .all()
    )

    lines: list[str] = []
    for msg in messages:
        role = msg.role.capitalize()
        content = (msg.content or "").strip()
        if content:
            lines.append(f"{role}: {content}")

    text = "\n\n".join(lines)
    # Truncate to avoid exceeding model context
    if len(text) > MAX_CONVERSATION_CHARS:
        text = text[-MAX_CONVERSATION_CHARS:]
    return text


async def generate_summary(
    db: Session,
    conversation_id: str,
    model_id: str | None = None,
) -> str | None:
    """Generate a summary for the conversation using the LLM.

    Returns the summary text, or None if generation fails.
    On failure, the existing summary (if any) is preserved.
    """
    from app.services.chat_runtime import chat_runtime

    # Resolve model — use conversation's model or fallback
    if not model_id:
        conv = db.get(Conversation, conversation_id)
        if conv:
            model_id = conv.model_id
    if not model_id:
        model_id = _fallback_model_id()
    if not model_id:
        logger.warning("No model available for summary generation")
        return None

    conversation_text = _build_conversation_text(db, conversation_id)
    if not conversation_text.strip():
        return None

    user_prompt = SUMMARY_USER_PROMPT.format(conversation_text=conversation_text)

    try:
        run = await chat_runtime.run_chat(
            db=db,
            task_type="chat",
            model_id=model_id,
            prompt=user_prompt,
            file_ids=[],
            params={"max_completion_tokens": 1024, "temperature": 0.3},
            system_prompt=SUMMARY_SYSTEM_PROMPT,
        )

        output = run.output_json or {}
        summary_text = output.get("text", "").strip()

        if summary_text:
            # Update conversation summary
            conv = db.get(Conversation, conversation_id)
            if conv:
                conv.summary = summary_text
                conv.updated_at = datetime.now(UTC)
                db.commit()
            return summary_text

    except Exception:
        logger.exception("Summary generation failed for conversation %s", conversation_id)
        # Preserve existing summary — do not overwrite with None

    return None


def _fallback_model_id() -> str | None:
    """Find any available chat model for summary generation."""
    for model in model_registry.model_configs:
        if model.enabled and model.runtime == "chat_completion":
            provider = model_registry.providers_by_id.get(model.provider)
            if provider and provider.enabled:
                return model.id
    return None


async def maybe_generate_summary_async(
    db: Session,
    conversation_id: str,
    model_id: str | None = None,
) -> None:
    """Check thresholds and trigger summary generation if needed.

    Non-blocking: wraps generate_summary in asyncio.create_task.
    The task creates its own DB session since the caller's session may close
    before the task completes.
    """
    try:
        if should_generate_summary(db, conversation_id, model_id):
            asyncio.create_task(_generate_with_own_session(conversation_id, model_id))
    except Exception:
        logger.exception("Failed to check/trigger summary for conversation %s", conversation_id)


async def _generate_with_own_session(
    conversation_id: str,
    model_id: str | None = None,
) -> None:
    """Run summary generation with an independent DB session."""
    from app.db.session import SessionLocal

    own_db = SessionLocal()
    try:
        await generate_summary(own_db, conversation_id, model_id)
    except Exception:
        logger.exception("Summary generation failed for conversation %s", conversation_id)
    finally:
        own_db.close()
