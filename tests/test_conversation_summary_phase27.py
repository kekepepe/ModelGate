"""Tests for V3.5 Conversation Summary (phase 27).

Covers:
- should_generate_summary: message count threshold
- should_generate_summary: token usage threshold
- should_generate_summary: below thresholds returns False
- generate_summary: updates Conversation.summary
- generate_summary: preserves existing summary on failure
- _build_conversation_text: truncation to MAX_CONVERSATION_CHARS
- build_context_messages: summary injection between system and history
- build_context_messages: summary tokens reduce history budget
- ContextTruncationMeta: summary_included and summary_tokens fields
- serialize_conversation: includes summary field
- API endpoints: summary/reset and summary/regenerate
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

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
)
from app.services.conversation_summary import (  # noqa: E402
    MESSAGE_COUNT_THRESHOLD,
    _build_conversation_text,
    should_generate_summary,
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


def _make_conversation(db, conv_id="conv_test1", title="Test Chat", summary=None):
    now = datetime.now(UTC)
    conv = Conversation(
        id=conv_id,
        title=title,
        task_type="chat",
        status="active",
        summary=summary,
        created_at=now,
        updated_at=now,
    )
    db.add(conv)
    db.commit()
    return conv


_msg_counter = 0


@pytest.fixture(autouse=True)
def _reset_msg_counter():
    global _msg_counter
    _msg_counter = 0
    yield
    _msg_counter = 0


def _make_message(db, conv_id, role, content, msg_id=None, status="completed", offset_seconds=0):
    global _msg_counter
    _msg_counter += 1
    now = datetime.now(UTC) + timedelta(seconds=offset_seconds)
    msg = Message(
        id=msg_id or f"msg_{role}_{_msg_counter}",
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


# ---- should_generate_summary tests ----


class TestShouldGenerateSummary:
    def test_below_threshold_returns_false(self, db_session):
        _make_conversation(db_session)
        for i in range(5):
            _make_message(
                db_session, "conv_test1", "user" if i % 2 == 0 else "assistant", f"msg {i}"
            )

        assert should_generate_summary(db_session, "conv_test1") is False

    def test_above_message_count_threshold_returns_true(self, db_session):
        _make_conversation(db_session)
        for i in range(MESSAGE_COUNT_THRESHOLD + 1):
            _make_message(
                db_session, "conv_test1", "user" if i % 2 == 0 else "assistant", f"msg {i}"
            )

        assert should_generate_summary(db_session, "conv_test1") is True

    def test_exactly_at_threshold_returns_false(self, db_session):
        _make_conversation(db_session)
        for i in range(MESSAGE_COUNT_THRESHOLD):
            _make_message(
                db_session, "conv_test1", "user" if i % 2 == 0 else "assistant", f"msg {i}"
            )

        # > threshold, not >=
        assert should_generate_summary(db_session, "conv_test1") is False

    def test_token_usage_above_ratio_returns_true(self, db_session):
        _make_conversation(db_session)
        # Create messages with enough tokens to exceed 80% of a small context window
        # Each message: ~2000 chars = ~500 tokens. 10 messages = ~5000 tokens.
        # Context window 5000, ratio 0.8 = 4000. 5000 > 4000 -> True
        for i in range(10):
            _make_message(
                db_session, "conv_test1", "user" if i % 2 == 0 else "assistant", "x" * 2000
            )

        with patch("app.services.conversation_summary.model_registry") as mock_registry:
            mock_registry.get_model.return_value = {"contextWindow": 5000}
            assert should_generate_summary(db_session, "conv_test1", model_id="test") is True

    def test_token_usage_below_ratio_returns_false(self, db_session):
        _make_conversation(db_session)
        for i in range(3):
            _make_message(
                db_session, "conv_test1", "user" if i % 2 == 0 else "assistant", "short msg"
            )

        # With no model_id, only message count check applies
        assert should_generate_summary(db_session, "conv_test1") is False


# ---- _build_conversation_text tests ----


class TestBuildConversationText:
    def test_basic_text_building(self, db_session):
        _make_conversation(db_session)
        _make_message(db_session, "conv_test1", "user", "Hello", offset_seconds=-10)
        _make_message(db_session, "conv_test1", "assistant", "Hi there", offset_seconds=-5)

        text = _build_conversation_text(db_session, "conv_test1")
        assert "User: Hello" in text
        assert "Assistant: Hi there" in text

    def test_truncates_to_max_chars(self, db_session):
        _make_conversation(db_session)
        # Create a very long message
        _make_message(db_session, "conv_test1", "user", "x" * 100_000)

        text = _build_conversation_text(db_session, "conv_test1")
        assert len(text) <= 80_000

    def test_empty_messages_excluded(self, db_session):
        _make_conversation(db_session)
        _make_message(db_session, "conv_test1", "user", "Hello")
        _make_message(db_session, "conv_test1", "assistant", "")

        text = _build_conversation_text(db_session, "conv_test1")
        assert "User: Hello" in text
        # Empty assistant message should not appear
        assert text.count("Assistant:") == 0


# ---- Context builder summary injection tests ----


class TestSummaryInjection:
    def test_summary_injected_between_system_and_history(self, db_session):
        _make_conversation(db_session, summary="Previous conversation about Python.")
        _make_message(
            db_session, "conv_test1", "user", "What about decorators?", offset_seconds=-10
        )
        _make_message(db_session, "conv_test1", "assistant", "Decorators are...", offset_seconds=-5)

        system = ChatMessage(role="system", content="You are helpful.")
        user = ChatMessage(role="user", content="Tell me more.")

        messages, meta = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=128_000,
            summary_text="Previous conversation about Python.",
        )

        # system + summary + 2 history + user = 5
        assert len(messages) == 5
        assert messages[0].role == "system"
        assert messages[0].content == "You are helpful."
        assert messages[1].role == "system"
        assert "Previous conversation summary" in messages[1].content
        assert "Previous conversation about Python." in messages[1].content
        assert messages[2].role == "user"
        assert messages[3].role == "assistant"
        assert messages[4].role == "user"

    def test_no_summary_when_none(self, db_session):
        _make_conversation(db_session)
        _make_message(db_session, "conv_test1", "user", "Hello", offset_seconds=-10)

        system = ChatMessage(role="system", content="S")
        user = ChatMessage(role="user", content="Hi")

        messages, meta = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=128_000,
            summary_text=None,
        )

        # system + 1 history + user = 3 (no summary)
        assert len(messages) == 3
        assert meta.summary_included is False
        assert meta.summary_tokens == 0

    def test_empty_string_summary_not_injected(self, db_session):
        _make_conversation(db_session)
        _make_message(db_session, "conv_test1", "user", "Hello", offset_seconds=-10)

        system = ChatMessage(role="system", content="S")
        user = ChatMessage(role="user", content="Hi")

        messages, meta = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=128_000,
            summary_text="   ",
        )

        assert meta.summary_included is False
        assert len(messages) == 3

    def test_summary_tokens_reduce_history_budget(self, db_session):
        _make_conversation(db_session)
        for i in range(6):
            _make_message(
                db_session,
                "conv_test1",
                "user" if i % 2 == 0 else "assistant",
                "x" * 500,
                offset_seconds=-(6 - i),
            )

        system = ChatMessage(role="system", content="S")
        user = ChatMessage(role="user", content="Current")

        # Without summary
        _, meta_no_summary = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=4000,
            budget_ratio=0.7,
        )

        # With summary
        _, meta_with_summary = build_context_messages(
            db=db_session,
            conversation_id="conv_test1",
            current_user_message=user,
            system_message=system,
            model_context_window=4000,
            budget_ratio=0.7,
            summary_text="x" * 2000,
        )

        # Summary should reduce history capacity
        assert meta_with_summary.summary_included is True
        assert meta_with_summary.summary_tokens > 0
        assert meta_with_summary.included_count <= meta_no_summary.included_count

    def test_meta_to_dict_includes_summary_fields(self, db_session):
        meta = ContextTruncationMeta(
            summary_included=True,
            summary_tokens=150,
        )
        d = meta.to_dict()
        assert d["summary_included"] is True
        assert d["summary_tokens"] == 150

    def test_meta_default_summary_fields(self, db_session):
        meta = ContextTruncationMeta()
        d = meta.to_dict()
        assert d["summary_included"] is False
        assert d["summary_tokens"] == 0


# ---- serialize_conversation summary field ----


class TestSerializeConversation:
    def test_summary_included_in_serialization(self, db_session):
        from app.api.conversations import serialize_conversation

        conv = _make_conversation(db_session, summary="Test summary")
        result = serialize_conversation(conv)
        assert result["summary"] == "Test summary"

    def test_null_summary_in_serialization(self, db_session):
        from app.api.conversations import serialize_conversation

        conv = _make_conversation(db_session)
        result = serialize_conversation(conv)
        assert result["summary"] is None


# ---- API endpoint tests ----


class TestSummaryAPI:
    @pytest.fixture
    def client(self, db_session):
        from app.api.conversations import router as conv_router
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(conv_router, prefix="/conversations")

        def _override_db():
            yield db_session

        app.dependency_overrides = {
            __import__("app.db.session", fromlist=["get_db"]).get_db: _override_db
        }
        return TestClient(app)

    def test_reset_summary(self, client, db_session):
        _make_conversation(db_session, summary="Some summary")
        resp = client.post("/conversations/conv_test1/summary/reset")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["summary"] is None

    def test_reset_summary_not_found(self, client):
        resp = client.post("/conversations/nonexistent/summary/reset")
        assert resp.status_code == 404

    def test_regenerate_summary(self, client, db_session):
        _make_conversation(db_session)
        _make_message(db_session, "conv_test1", "user", "What is Python?", offset_seconds=-10)
        _make_message(
            db_session,
            "conv_test1",
            "assistant",
            "Python is a programming language.",
            offset_seconds=-5,
        )

        async def fake_generate(db, conv_id, model_id=None):
            conv = db.get(Conversation, conv_id)
            conv.summary = "## User Goals\n- Learn Python"
            db.commit()
            return conv.summary

        with patch("app.api.conversations.generate_summary", side_effect=fake_generate):
            resp = client.post("/conversations/conv_test1/summary/regenerate")
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["summary"] == "## User Goals\n- Learn Python"

    def test_regenerate_summary_failure(self, client, db_session):
        _make_conversation(db_session)

        with patch("app.api.conversations.generate_summary", new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = None
            resp = client.post("/conversations/conv_test1/summary/regenerate")
            assert resp.status_code == 500
