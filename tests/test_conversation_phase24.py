"""Tests for V3.2 Conversation Persistence (phase 24).

Covers:
- Create conversation — returns id, title, timestamps
- List conversations — returns only active, sorted by updated_at DESC
- Get conversation with messages — includes message array
- Patch conversation — updates title
- Delete conversation — soft delete (status=deleted), not in list
- Messages ordered by created_at ASC within conversation
- Conversation updated_at refreshes on new message
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import models as db_models  # noqa: E402
from app.main import app  # noqa: E402


class _FakeRedis:
    def __init__(self, *args, **kwargs) -> None:
        pass

    @classmethod
    def from_url(cls, *args, **kwargs) -> _FakeRedis:
        return cls()

    def ping(self) -> None:
        return None

    def close(self) -> None:
        return None


@pytest.fixture
def client(monkeypatch):
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)

    import app.core.startup as startup_module
    import app.db.session as session_module
    import app.services.provider_secrets as provider_secrets_module

    monkeypatch.setattr(session_module, "engine", test_engine)
    monkeypatch.setattr(session_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "engine", test_engine)
    monkeypatch.setattr(startup_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "Redis", _FakeRedis)
    monkeypatch.setattr(startup_module, "sync_registry_to_db", lambda *a, **k: None)
    monkeypatch.setattr(provider_secrets_module, "SessionLocal", TestSessionLocal)

    from app.db.session import get_db

    def _get_db_override():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db_override
    db_models.Base.metadata.create_all(test_engine)

    with TestClient(app) as c:
        yield c, TestSessionLocal

    app.dependency_overrides.clear()


# ── conversation CRUD tests ──────────────────────────────────────────────────


class TestConversationCRUD:
    def test_create_conversation(self, client):
        c, _ = client
        resp = c.post("/api/conversations", json={"title": "Test Chat", "taskType": "chat"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["id"].startswith("conv_")
        assert data["title"] == "Test Chat"
        assert data["taskType"] == "chat"
        assert data["status"] == "active"
        assert data["createdAt"] is not None
        assert data["updatedAt"] is not None

    def test_list_conversations_active_only(self, client):
        c, SessionLocal = client
        # Create active conversation
        resp1 = c.post("/api/conversations", json={"title": "Active Chat"})
        conv_id = resp1.json()["data"]["id"]

        # Create deleted conversation
        resp2 = c.post("/api/conversations", json={"title": "Deleted Chat"})
        deleted_id = resp2.json()["data"]["id"]

        db = SessionLocal()
        db.query(db_models.Conversation).filter(db_models.Conversation.id == deleted_id).update(
            {"status": "deleted"}
        )
        db.commit()
        db.close()

        resp = c.get("/api/conversations")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) == 1
        assert data[0]["id"] == conv_id

    def test_list_conversations_sorted_by_updated_at(self, client):
        c, SessionLocal = client
        # Create two conversations with different updated_at
        resp1 = c.post("/api/conversations", json={"title": "Older"})
        older_id = resp1.json()["data"]["id"]

        resp2 = c.post("/api/conversations", json={"title": "Newer"})
        newer_id = resp2.json()["data"]["id"]

        # Update older one to have earlier timestamp
        db = SessionLocal()
        db.query(db_models.Conversation).filter(db_models.Conversation.id == older_id).update(
            {"updated_at": datetime.now(UTC) - timedelta(hours=1)}
        )
        db.commit()
        db.close()

        resp = c.get("/api/conversations")
        data = resp.json()["data"]
        assert data[0]["id"] == newer_id
        assert data[1]["id"] == older_id

    def test_get_conversation_with_messages(self, client):
        c, SessionLocal = client
        # Create conversation
        resp = c.post("/api/conversations", json={"title": "With Messages"})
        conv_id = resp.json()["data"]["id"]

        # Add messages directly to DB
        now = datetime.now(UTC)
        db = SessionLocal()
        msg1 = db_models.Message(
            id="msg_1",
            conversation_id=conv_id,
            role="user",
            content="Hello",
            status="completed",
            created_at=now,
        )
        msg2 = db_models.Message(
            id="msg_2",
            conversation_id=conv_id,
            role="assistant",
            content="Hi there",
            status="completed",
            created_at=now,
        )
        db.add_all([msg1, msg2])
        db.commit()
        db.close()

        resp = c.get(f"/api/conversations/{conv_id}")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["id"] == conv_id
        assert len(data["messages"]) == 2
        assert data["messages"][0]["role"] == "user"
        assert data["messages"][1]["role"] == "assistant"

    def test_patch_conversation(self, client):
        c, _ = client
        resp = c.post("/api/conversations", json={"title": "Original"})
        conv_id = resp.json()["data"]["id"]

        resp = c.patch(f"/api/conversations/{conv_id}", json={"title": "Updated"})
        assert resp.status_code == 200
        assert resp.json()["data"]["title"] == "Updated"

    def test_delete_conversation_soft_delete(self, client):
        c, SessionLocal = client
        resp = c.post("/api/conversations", json={"title": "To Delete"})
        conv_id = resp.json()["data"]["id"]

        # Add a message
        now = datetime.now(UTC)
        db = SessionLocal()
        msg = db_models.Message(
            id="msg_del",
            conversation_id=conv_id,
            role="user",
            content="test",
            status="completed",
            created_at=now,
        )
        db.add(msg)
        db.commit()
        db.close()

        resp = c.delete(f"/api/conversations/{conv_id}")
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "deleted"

        # Verify conversation is soft-deleted
        db = SessionLocal()
        conv = db.get(db_models.Conversation, conv_id)
        assert conv.status == "deleted"

        # Verify messages are deleted (hard delete)
        msgs = (
            db.query(db_models.Message).filter(db_models.Message.conversation_id == conv_id).all()
        )
        assert len(msgs) == 0
        db.close()

        # Verify not in list
        resp = c.get("/api/conversations")
        assert all(cr["id"] != conv_id for cr in resp.json()["data"])

    def test_get_deleted_conversation_404(self, client):
        c, SessionLocal = client
        resp = c.post("/api/conversations", json={"title": "Deleted"})
        conv_id = resp.json()["data"]["id"]

        db = SessionLocal()
        db.query(db_models.Conversation).filter(db_models.Conversation.id == conv_id).update(
            {"status": "deleted"}
        )
        db.commit()
        db.close()

        resp = c.get(f"/api/conversations/{conv_id}")
        assert resp.status_code == 404


# ── message ordering tests ───────────────────────────────────────────────────


class TestMessageOrdering:
    def test_messages_ordered_by_created_at_asc(self, client):
        c, SessionLocal = client
        resp = c.post("/api/conversations", json={"title": "Ordering"})
        conv_id = resp.json()["data"]["id"]

        now = datetime.now(UTC)
        db = SessionLocal()
        msg1 = db_models.Message(
            id="msg_first",
            conversation_id=conv_id,
            role="user",
            content="first",
            status="completed",
            created_at=now - timedelta(minutes=5),
        )
        msg2 = db_models.Message(
            id="msg_second",
            conversation_id=conv_id,
            role="assistant",
            content="second",
            status="completed",
            created_at=now,
        )
        db.add_all([msg2, msg1])  # Add out of order
        db.commit()
        db.close()

        resp = c.get(f"/api/conversations/{conv_id}")
        messages = resp.json()["data"]["messages"]
        assert messages[0]["id"] == "msg_first"
        assert messages[1]["id"] == "msg_second"
