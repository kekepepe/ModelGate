"""Tests for V3.3 Context Builder (phase 25).

Covers:
- Short conversation — no trimming (all messages fit)
- Long conversation — oldest messages dropped when over budget
- File context tokens accounted for in budget allocation
- Budget 0 edge case — no history included
- Different model context_window sizes affect trimming
- Metadata output shape and correctness
- No conversation_id — returns empty history
- Current user message excluded from history list
- Messages ordered chronologically in output
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import models as db_models  # noqa: E402
from app.db.models import Conversation, Message  # noqa: E402
from app.providers.base import ChatMessage  # noqa: E402
from app.services.context_builder import (  # noqa: E402
    ContextTruncationMeta,
    build_context_messages,
    estimate_tokens,
    estimate_message_tokens,
)


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    db_models.Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


def _make_conversation(db, conv_id="conv_test1", title="Test Chat"):
    now = datetime.now(UTC)
    conv = Conversation(
        id=conv_id,
        title=title,
        task_type="chat",
        status="active",
        created_at=now,
        updated_at=now,
    )
    db.add(conv)
    db.commit()
    return conv


def _make_message(db, conv_id, role, content, msg_id=None, status="completed", offset_seconds=0):
    now = datetime.now(UTC) + timedelta(seconds=offset_seconds)
    msg = Message(
        id=msg_id or f"msg_{role}_{offset_seconds}",
        conversation_id=conv_id,
        role=role,
        content=content,
        status=status,
        created_at=now,
        updated_at=now,
    )
    db.add(msg)
    db.commit()
    return msg


# ---- Unit tests for helper functions ----


class TestEstimateTokens:
    def test_empty_string(self):
        assert estimate_tokens("") == 0

    def test_short_text(self):
        # 4 chars = 1 token
        assert estimate_tokens("hello") == 2  # ceil(5/4)

    def test_exact_boundary(self):
        assert estimate_tokens("x" * 4) == 1
        assert estimate_tokens("x" * 5) == 2

    def test_long_text(self):
        assert estimate_tokens("x" * 1000) == 250


class TestEstimateMessageTokens:
    def test_system_message(self):
        msg = ChatMessage(role="system", content="You are helpful.")
        tokens = estimate_message_tokens(msg)
        assert tokens >= 4 + 1  # overhead + content

    def test_user_message(self):
        msg = ChatMessage(role="user", content="Hello!")
        tokens = estimate_message_tokens(msg)
        assert tokens >= 5  # 4 overhead + ceil(6/4) = 2


class TestContextTruncationMeta:
    def test_to_dict_shape(self):
        meta = ContextTruncationMeta(
            original_count=10,
            included_count=5,
            system_tokens=100,
            history_tokens=500,
            current_user_tokens=50,
            file_tokens=200,
            dropped_count=5,
            dropped_token_estimate=300,
            budget_tokens=1000,
        )
        d = meta.to_dict()
        assert d["original_count"] == 10
        assert d["included_count"] == 5
        assert d["system_tokens"] == 100
        assert d["history_tokens"] == 500
        assert d["current_user_tokens"] == 50
        assert d["file_tokens"] == 200
        assert d["dropped_count"] == 5
        assert d["dropped_token_estimate"] == 300
        assert d["budget_tokens"] == 1000

    def test_default_values(self):
        meta = ContextTruncationMeta()
        d = meta.to_dict()
        assert d["original_count"] == 0
        assert d["dropped_count"] == 0


# ---- Integration tests for build_context_messages ----


class TestBuildContextMessages:
    def test_no_conversation_id_returns_just_system_and_user(self, db_session):
        system = ChatMessage(role="system", content="System prompt.")
        user = ChatMessage(role="user", content="Hello!")

        messages, meta = build_context_messages(
            db=db_session,
            conversation_id=None,
            current_user_message=user,
            system_message=system,
            model_context_window=128_000,
        )

        assert len(messages) == 2
        assert messages[0].role == "system"
        assert messages[1].role == "user"
        assert meta.original_count == 0
        assert meta.included_count == 0
        assert meta.dropped_count == 0

    def test_short_conversation_no_trimming(self, db_session):
        _make_conversation(db_session)
        _make_message(db_session, "conv_test1", "user", "First question", offset_seconds=-20)
        _make_message(db_session, "conv_test1", "assistant", "First answer", offset_seconds=-10)

        system = ChatMessage(role="system", content="System.")
        user = ChatMessage(role="user", content="Second question")

        messages, meta = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=128_000,
        )

        # system + 2 history + current user = 4
        assert len(messages) == 4
        assert messages[0].role == "system"
        assert messages[1].role == "user"
        assert messages[1].content == "First question"
        assert messages[2].role == "assistant"
        assert messages[2].content == "First answer"
        assert messages[3].role == "user"
        assert messages[3].content == "Second question"
        assert meta.original_count == 2
        assert meta.included_count == 2
        assert meta.dropped_count == 0

    def test_long_conversation_trims_oldest(self, db_session):
        _make_conversation(db_session)
        # Create 10 messages with large content to force trimming
        for i in range(10):
            role = "user" if i % 2 == 0 else "assistant"
            _make_message(
                db_session, "conv_test1", role,
                f"Message {i}: " + "x" * 2000,
                offset_seconds=-(100 - i),
            )

        system = ChatMessage(role="system", content="System.")
        user = ChatMessage(role="user", content="Latest question")

        # Use a very small context window to force trimming
        messages, meta = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=4000,  # Very small
            budget_ratio=0.7,  # 2800 tokens budget
        )

        # Should have trimmed some messages
        assert meta.original_count == 10
        assert meta.included_count < 10
        assert meta.dropped_count > 0
        assert meta.dropped_token_estimate > 0
        # Messages should still be: system + history + current_user
        assert messages[0].role == "system"
        assert messages[-1].role == "user"
        assert messages[-1].content == "Latest question"

    def test_keeps_newest_messages_drops_oldest(self, db_session):
        _make_conversation(db_session)
        # Create messages with large identifiable content to force trimming
        for i in range(6):
            role = "user" if i % 2 == 0 else "assistant"
            _make_message(
                db_session, "conv_test1", role,
                f"Message_{i}: " + "x" * 500,
                offset_seconds=-(6 - i),
            )

        system = ChatMessage(role="system", content="S")
        user = ChatMessage(role="user", content="Current")

        # Small budget: only room for ~2 history messages
        messages, meta = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=800,
            budget_ratio=0.7,
        )

        # Should keep newest, drop oldest
        history_msgs = messages[1:-1]
        assert len(history_msgs) < 6
        # The newest messages should be present
        contents = [m.content for m in history_msgs]
        # Message_4 and Message_5 are the newest pair
        assert any("Message_4" in c for c in contents) or any("Message_5" in c for c in contents)

    def test_budget_zero_excludes_all_history(self, db_session):
        _make_conversation(db_session)
        _make_message(db_session, "conv_test1", "user", "Old q", offset_seconds=-10)
        _make_message(db_session, "conv_test1", "assistant", "Old a", offset_seconds=-5)

        system = ChatMessage(role="system", content="System prompt.")
        user = ChatMessage(role="user", content="Current")

        # Use budget_ratio=0 so no room for history
        messages, meta = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=100,
            budget_ratio=0.0,
        )

        # Even with 0 budget, system + current_user are always present
        assert len(messages) >= 2
        assert messages[0].role == "system"
        assert messages[-1].role == "user"
        # History should be empty
        history = messages[1:-1]
        assert len(history) == 0
        assert meta.included_count == 0

    def test_file_context_tokens_reduce_history_budget(self, db_session):
        _make_conversation(db_session)
        for i in range(4):
            role = "user" if i % 2 == 0 else "assistant"
            _make_message(
                db_session, "conv_test1", role,
                f"History message {i} with some content here.",
                offset_seconds=-(4 - i),
            )

        system = ChatMessage(role="system", content="S")
        user = ChatMessage(role="user", content="Current")

        # Without file context
        msgs_no_file, meta_no_file = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=1000,
        )

        # With large file context
        msgs_with_file, meta_with_file = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=1000,
            file_context_tokens=400,  # Large file eats into budget
        )

        # File context reduces history capacity
        assert meta_with_file.included_count <= meta_no_file.included_count
        assert meta_with_file.file_tokens == 400

    def test_different_context_windows(self, db_session):
        _make_conversation(db_session)
        for i in range(8):
            role = "user" if i % 2 == 0 else "assistant"
            _make_message(
                db_session, "conv_test1", role,
                f"Message {i}: " + "word " * 200,
                offset_seconds=-(8 - i),
            )

        system = ChatMessage(role="system", content="S")
        user = ChatMessage(role="user", content="Current")

        # Large window: all messages fit
        _, meta_large = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=500_000,
        )

        # Small window: must trim
        _, meta_small = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=1500,
        )

        assert meta_large.included_count == 8
        assert meta_small.included_count < 8

    def test_current_user_message_excluded_from_history(self, db_session):
        conv = _make_conversation(db_session)
        user_msg = _make_message(db_session, "conv_test1", "user", "I am the current msg")
        _make_message(db_session, "conv_test1", "assistant", "I am a prior answer")

        system = ChatMessage(role="system", content="S")
        user = ChatMessage(role="user", content="I am the current msg")

        messages, meta = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=128_000,
            current_user_message_id=user_msg.id,
        )

        history = messages[1:-1]
        history_ids_or_contents = [m.content for m in history]
        # The current user message should NOT be in history
        assert "I am the current msg" not in history_ids_or_contents
        # The prior assistant message should be in history
        assert "I am a prior answer" in history_ids_or_contents

    def test_streaming_messages_excluded(self, db_session):
        _make_conversation(db_session)
        _make_message(db_session, "conv_test1", "user", "Question", offset_seconds=-20)
        _make_message(db_session, "conv_test1", "assistant", "Answer", offset_seconds=-10)
        # A streaming placeholder should be excluded
        _make_message(db_session, "conv_test1", "assistant", "", status="streaming", offset_seconds=-5)

        system = ChatMessage(role="system", content="S")
        user = ChatMessage(role="user", content="Next question")

        messages, meta = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=128_000,
        )

        # Only completed messages should be in history
        history = messages[1:-1]
        for m in history:
            assert m.content != ""  # streaming placeholder has empty content

    def test_metadata_budget_tokens_match_context_window(self, db_session):
        system = ChatMessage(role="system", content="S")
        user = ChatMessage(role="user", content="Hi")

        _, meta = build_context_messages(
            db=db_session,
            conversation_id=None,
            current_user_message=user,
            system_message=system,
            model_context_window=10_000,
            budget_ratio=0.7,
        )

        assert meta.budget_tokens == 7000  # 10000 * 0.7

    def test_default_context_window_used_when_none(self, db_session):
        system = ChatMessage(role="system", content="S")
        user = ChatMessage(role="user", content="Hi")

        _, meta = build_context_messages(
            db=db_session,
            conversation_id=None,
            current_user_message=user,
            system_message=system,
            model_context_window=None,
        )

        # Default is 128000 * 0.7 = 89600
        assert meta.budget_tokens == int(128_000 * 0.7)
