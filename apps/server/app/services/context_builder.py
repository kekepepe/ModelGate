"""V3.3 — Build multi-turn conversation context with token budget trimming.

Loads prior messages from the DB and assembles them into a ChatMessage list
that fits within the model's context window, respecting a safety budget ratio.

Priority order when trimming:
  1. File context (from current user prompt files) — up to 40% of budget
  2. Recent user/assistant pairs — fill remaining budget from newest to oldest
  3. Early conversation — dropped first when budget is tight
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import Message
from app.providers.base import ChatMessage

# Default fraction of context_window available for *all* content (system +
# history + current user message). The remaining fraction is reserved for the
# model's output tokens.
DEFAULT_BUDGET_RATIO = 0.70

# File context gets at most this fraction of the available budget.
FILE_BUDGET_RATIO = 0.40

# Rough chars-per-token estimate (works for English + mixed CJK; conservative).
CHARS_PER_TOKEN = 4

# Absolute minimum tokens to keep for the current user message.
MIN_CURRENT_USER_TOKENS = 256

DEFAULT_CONTEXT_WINDOW = 128_000


@dataclass
class ContextTruncationMeta:
    """Metadata written to runs.metadata_json.context_truncation."""

    original_count: int = 0
    included_count: int = 0
    system_tokens: int = 0
    history_tokens: int = 0
    current_user_tokens: int = 0
    file_tokens: int = 0
    dropped_count: int = 0
    dropped_token_estimate: int = 0
    budget_tokens: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "original_count": self.original_count,
            "included_count": self.included_count,
            "system_tokens": self.system_tokens,
            "history_tokens": self.history_tokens,
            "current_user_tokens": self.current_user_tokens,
            "file_tokens": self.file_tokens,
            "dropped_count": self.dropped_count,
            "dropped_token_estimate": self.dropped_token_estimate,
            "budget_tokens": self.budget_tokens,
        }


def estimate_tokens(text: str) -> int:
    """Estimate token count from text length. Conservative (rounds up)."""
    if not text:
        return 0
    return max(1, math.ceil(len(text) / CHARS_PER_TOKEN))


def estimate_message_tokens(msg: ChatMessage) -> int:
    """Estimate tokens for a ChatMessage (role overhead + content)."""
    # Each message has ~4 tokens of structural overhead (role, separators).
    overhead = 4
    content = msg.as_text() if hasattr(msg, "as_text") else str(msg.content)
    return overhead + estimate_tokens(content)


def build_context_messages(
    *,
    db: Session,
    conversation_id: str | None,
    current_user_message: ChatMessage,
    system_message: ChatMessage,
    model_context_window: int | None,
    budget_ratio: float = DEFAULT_BUDGET_RATIO,
    file_context_tokens: int = 0,
    current_user_message_id: str | None = None,
) -> tuple[list[ChatMessage], ContextTruncationMeta]:
    """Build the full message list for a chat request with budget trimming.

    Returns (messages, truncation_meta) where messages is [system, ...history,
    current_user] and truncation_meta describes what was trimmed.

    If conversation_id is None or there are no prior messages, returns
    [system, current_user] with zero trimming (backward-compatible).
    """
    ctx_window = model_context_window or DEFAULT_CONTEXT_WINDOW
    total_budget = int(ctx_window * budget_ratio)

    meta = ContextTruncationMeta(budget_tokens=total_budget)

    # 1. Measure system message
    system_tokens = estimate_message_tokens(system_message)
    meta.system_tokens = system_tokens

    # 2. Measure current user message
    current_user_tokens = estimate_message_tokens(current_user_message)
    meta.current_user_tokens = current_user_tokens

    # 3. Account for file context (already embedded in current_user_message)
    meta.file_tokens = file_context_tokens

    # 4. Available tokens for history
    fixed_tokens = system_tokens + current_user_tokens
    available_for_history = max(0, total_budget - fixed_tokens)

    # 5. Load prior messages from DB (exclude the current user message we just saved)
    prior_messages: list[ChatMessage] = []
    if conversation_id:
        rows = (
            db.query(Message)
            .filter(
                Message.conversation_id == conversation_id,
                Message.status == "completed",
            )
            .order_by(Message.created_at.asc())
            .all()
        )

        # Exclude the current user message (most recent user message)
        # and any streaming/placeholder assistant messages
        filtered = []
        for row in rows:
            # Skip the current user message by ID if provided
            if current_user_message_id and row.id == current_user_message_id:
                continue
            # Skip streaming placeholders
            if row.status == "streaming":
                continue
            filtered.append(row)

        meta.original_count = len(filtered)

        # Convert to ChatMessage objects with token estimates
        candidates: list[tuple[ChatMessage, int]] = []
        for row in filtered:
            cm = ChatMessage(role=row.role, content=row.content or "")
            tokens = estimate_message_tokens(cm)
            candidates.append((cm, tokens))

        # 6. Trim from oldest first to fit budget
        # Keep newest messages; drop oldest when over budget
        included: list[ChatMessage] = []
        used_tokens = 0
        dropped_tokens = 0

        # Walk from newest to oldest
        for cm, tokens in reversed(candidates):
            if used_tokens + tokens <= available_for_history:
                included.append((cm, tokens))
                used_tokens += tokens
            else:
                dropped_tokens += tokens

        # Reverse to chronological order
        included.reverse()
        prior_messages = [cm for cm, _ in included]

        meta.included_count = len(prior_messages)
        meta.history_tokens = used_tokens
        meta.dropped_count = meta.original_count - meta.included_count
        meta.dropped_token_estimate = dropped_tokens

    # 7. Assemble final message list: system + history + current_user
    result: list[ChatMessage] = [system_message]
    result.extend(prior_messages)
    result.append(current_user_message)

    return result, meta
