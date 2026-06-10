"""Tests for Project Mode JSON parse fix (phase 20).

Covers:
- ``_try_parse_json`` extracts JSON from prose-wrapped / markdown-fenced /
  partial output.
- ``_extract_first_json_object`` handles string-state and escapes.
- On parse failure, ``_run_agent`` falls into the JSON_PARSE_ERROR branch and
  writes ``{"raw": ..., "parse_error": ...}`` to ``AgentRun.output_json``
  (status="failed", error_type="JSON_PARSE_ERROR") instead of raising.
- ``_run_agent`` forwards ``system_prompt`` to ``chat_runtime.run_chat`` as a
  top-level kwarg (the previous ``params={"system_prompt": ...}`` channel was
  silently dropped by chat_runtime).
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import models as db_models  # noqa: E402
from app.services.project_runtime import agents as agents_module  # noqa: E402
from app.services.project_runtime.agents import (  # noqa: E402
    _extract_first_json_object,
    _try_parse_json,
)
from app.services.project_runtime.budget import Budget, BudgetTracker  # noqa: E402

# ── pure-function tests (no DB) ──────────────────────────────────────────────


class TestTryParseJson:
    def test_plain_json(self):
        assert _try_parse_json('{"a": 1}') == {"a": 1}

    def test_strips_markdown_fence(self):
        text = '```json\n{"a": 1}\n```'
        assert _try_parse_json(text) == {"a": 1}

    def test_strips_fence_without_lang(self):
        text = '```\n{"a": 1}\n```'
        assert _try_parse_json(text) == {"a": 1}

    def test_prose_prefix_then_json(self):
        text = 'Sure, here is the plan:\n{"plan": "x"}'
        assert _try_parse_json(text) == {"plan": "x"}

    def test_prose_prefix_and_suffix_with_fence(self):
        text = (
            "I will now produce the JSON:\n"
            "```json\n"
            '{"role": "planner", "tasks": []}\n'
            "```\n"
            "Let me know if you need adjustments."
        )
        assert _try_parse_json(text) == {"role": "planner", "tasks": []}

    def test_json_with_escaped_quotes_in_string(self):
        text = 'preamble\n{"msg": "He said \\"hi\\" to me"}\nfooter'
        assert _try_parse_json(text) == {"msg": 'He said "hi" to me'}

    def test_nested_braces_in_string_dont_break_balance(self):
        text = '{"code": "if (x) { return y; }"}'
        assert _try_parse_json(text) == {"code": "if (x) { return y; }"}

    def test_completely_non_json_raises_with_preview(self):
        with pytest.raises(ValueError) as exc_info:
            _try_parse_json("I cannot help with that request.")
        msg = str(exc_info.value)
        assert "Raw preview" in msg
        assert "I cannot help" in msg


class TestExtractFirstJsonObject:
    def test_returns_first_balanced_block(self):
        text = 'noise {"a": {"b": 1}} more noise {"c": 2}'
        assert _extract_first_json_object(text) == '{"a": {"b": 1}}'

    def test_returns_none_when_no_braces(self):
        assert _extract_first_json_object("plain text") is None

    def test_returns_none_on_unbalanced(self):
        assert _extract_first_json_object("{ unclosed") is None

    def test_handles_string_with_brace(self):
        text = '{"s": "} not a close"}'
        assert _extract_first_json_object(text) == '{"s": "} not a close"}'


# ── integration tests (DB + mocked chat_runtime) ────────────────────────────


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    db_models.Base.metadata.create_all(engine)
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


def _make_project_run(s) -> db_models.ProjectRun:
    pr = db_models.ProjectRun(
        id=f"pr_{uuid4().hex}",
        title="t",
        goal="goal",
        status="running",
    )
    s.add(pr)
    s.commit()
    return pr


class _FakeRun:
    def __init__(self, text: str, run_id: str | None = None) -> None:
        self.id = run_id or f"run_{uuid4().hex}"
        self.output_json = {"text": text}
        self.started_at = datetime.now(UTC)
        self.completed_at = datetime.now(UTC)


class TestRunAgentParseFailureBranch:
    @pytest.mark.asyncio
    async def test_unparseable_output_lands_in_output_json_raw(self, session, monkeypatch):
        pr = _make_project_run(session)

        async def fake_run_chat(**kwargs):
            return _FakeRun("I refuse to output JSON, sorry.")

        monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

        budget = BudgetTracker(Budget())
        agent_run, _ = await agents_module._run_agent(
            db=session,
            project_run_id=pr.id,
            task=None,
            role="intake",
            system_prompt="be intake",
            user_prompt="goal: test",
            budget=budget,
            model_id="mock",
            schema_role="intake",
        )

        assert agent_run.status == "failed"
        assert agent_run.error_type == "JSON_PARSE_ERROR"
        assert agent_run.output_json is not None
        assert "raw" in agent_run.output_json
        assert "parse_error" in agent_run.output_json
        assert "refuse to output JSON" in agent_run.output_json["raw"]


class TestRunAgentSystemPromptForwarded:
    @pytest.mark.asyncio
    async def test_system_prompt_passed_as_top_level_kwarg(self, session, monkeypatch):
        pr = _make_project_run(session)
        captured: dict = {}

        async def fake_run_chat(**kwargs):
            captured.update(kwargs)
            # Minimal valid intake schema
            return _FakeRun(
                '{"summary": "s", "risks": [], "required_outputs": [], '
                '"clarifying_questions": []}'
            )

        monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

        budget = BudgetTracker(Budget())
        await agents_module._run_agent(
            db=session,
            project_run_id=pr.id,
            task=None,
            role="intake",
            system_prompt="YOU ARE INTAKE BOT — JSON ONLY",
            user_prompt="goal: test",
            budget=budget,
            model_id="mock",
            schema_role="intake",
        )

        assert captured.get("system_prompt") == "YOU ARE INTAKE BOT — JSON ONLY"
        # Confirm we are NOT smuggling it through params anymore
        assert "system_prompt" not in (captured.get("params") or {})
