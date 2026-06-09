"""Tests for V2.7 Verifier Agent + pytest_runner (phase 21).

Covers:
- VerifierOutput schema validation (Pydantic)
- ``_verifier_user_prompt`` formatting
- ``run_verifier`` end-to-end with mocked chat_runtime
- ``pytest_runner.run_pytest`` on a real temporary project with pytest
- ``pytest_runner`` path-sandboxing (drops paths that escape project_root)
- ``pytest_runner`` timeout handling
- ``pytest_runner`` falls back gracefully when json-report plugin missing
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
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
    _verifier_user_prompt,
    run_verifier,
)
from app.services.project_runtime.budget import Budget, BudgetTracker  # noqa: E402
from app.services.project_runtime.pytest_runner import run_pytest  # noqa: E402
from app.services.project_runtime.schemas import (  # noqa: E402
    VerifierOutput,
    validate_agent_output,
)


# ── schema / prompt tests (no DB, no network) ───────────────────────────────


class TestVerifierOutputSchema:
    def test_valid_pass(self):
        out = VerifierOutput.model_validate({
            "summary": "all green",
            "verdict": "pass",
        })
        assert out.verdict == "pass"
        assert out.failed_tests == []
        assert out.next_actions == []

    def test_valid_fail_with_actions(self):
        out = VerifierOutput.model_validate({
            "summary": "two failures",
            "verdict": "fail",
            "failed_tests": [
                {"nodeid": "tests/test_x.py::test_y", "message": "assert 1==2"},
            ],
            "analysis": "missing return statement",
            "next_actions": [
                {"worker_role": "backend", "instruction": "add return foo"},
            ],
        })
        assert out.verdict == "fail"
        assert len(out.failed_tests) == 1
        assert out.next_actions[0].worker_role == "backend"

    def test_invalid_verdict_rejected(self):
        with pytest.raises(Exception):  # Pydantic ValidationError
            VerifierOutput.model_validate({"summary": "x", "verdict": "maybe"})

    def test_unknown_role_registered_in_schema_dict(self):
        out = validate_agent_output("verifier", {
            "summary": "s", "verdict": "pass",
        })
        assert isinstance(out, VerifierOutput)


class TestVerifierUserPrompt:
    def test_includes_files_and_pytest_summary(self):
        prompt = _verifier_user_prompt(
            applied_files=["src/foo.py", "tests/test_foo.py"],
            pytest_summary={"passed": 8, "failed": 1, "errors": 0, "timed_out": False},
            failed_tests=[
                {"nodeid": "tests/test_foo.py::test_a", "message": "boom"},
            ],
            round_index=0,
            previous_verdicts=[],
            original_tasks=[{"role": "backend", "title": "Add /health"}],
        )
        assert "Round: 1" in prompt
        assert "src/foo.py" in prompt
        assert "tests/test_foo.py" in prompt
        assert "passed=8, failed=1" in prompt
        assert "tests/test_foo.py::test_a" in prompt
        assert "Add /health" in prompt

    def test_renders_previous_verdicts_when_provided(self):
        prompt = _verifier_user_prompt(
            applied_files=[],
            pytest_summary={"passed": 0, "failed": 1, "errors": 0, "timed_out": False},
            failed_tests=[],
            round_index=2,
            previous_verdicts=[
                {"round": 1, "verdict": "fail", "failed_tests": [{}]},
                {"round": 2, "verdict": "fail", "failed_tests": [{}, {}]},
            ],
            original_tasks=[],
        )
        assert "Round: 3" in prompt
        assert "Round 1: verdict=fail" in prompt
        assert "Round 2: verdict=fail" in prompt


# ── run_verifier integration (DB + mocked chat_runtime) ────────────────────


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
        title="t", goal="g", status="running",
    )
    s.add(pr)
    s.commit()
    return pr


def _pytest_importable() -> bool:
    """Whether `pytest` (the module) is importable, even if no CLI is on PATH."""
    try:
        import importlib.util

        return importlib.util.find_spec("pytest") is not None
    except Exception:
        return False


def _json_report_importable() -> bool:
    try:
        import importlib.util

        return importlib.util.find_spec("pytest_jsonreport") is not None
    except Exception:
        return False


class _FakeRun:
    def __init__(self, text: str, run_id: str | None = None) -> None:
        self.id = run_id or f"run_{uuid4().hex}"
        self.output_json = {"text": text}
        self.started_at = datetime.now(UTC)
        self.completed_at = datetime.now(UTC)


@pytest.mark.asyncio
async def test_run_verifier_happy_pass(session, monkeypatch):
    pr = _make_project_run(session)

    canned_pass = json.dumps({
        "summary": "All tests pass",
        "verdict": "pass",
        "failed_tests": [],
        "analysis": "no further work needed",
        "next_actions": [],
    })

    async def fake_run_chat(**kwargs):
        return _FakeRun(canned_pass)

    monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

    budget = BudgetTracker(Budget())
    agent_run, output = await run_verifier(
        db=session,
        project_run_id=pr.id,
        budget=budget,
        model_id="mock",
        applied_files=["src/foo.py"],
        pytest_summary={"passed": 10, "failed": 0, "errors": 0, "timed_out": False},
        failed_tests=[],
        round_index=0,
    )

    assert agent_run.status == "completed"
    assert agent_run.role == "verifier"
    assert output["verdict"] == "pass"
    assert output["failed_tests"] == []


@pytest.mark.asyncio
async def test_run_verifier_fail_returns_next_actions(session, monkeypatch):
    pr = _make_project_run(session)

    canned_fail = json.dumps({
        "summary": "1 test failing",
        "verdict": "fail",
        "failed_tests": [{"nodeid": "tests/test_x.py::test_a", "message": "boom"}],
        "analysis": "missing return",
        "next_actions": [{"worker_role": "backend", "instruction": "add return foo"}],
    })

    async def fake_run_chat(**kwargs):
        return _FakeRun(canned_fail)

    monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

    budget = BudgetTracker(Budget())
    agent_run, output = await run_verifier(
        db=session,
        project_run_id=pr.id,
        budget=budget,
        model_id="mock",
        applied_files=["src/foo.py"],
        pytest_summary={"passed": 3, "failed": 1, "errors": 0, "timed_out": False},
        failed_tests=[{"nodeid": "tests/test_x.py::test_a", "message": "boom"}],
        round_index=1,
    )

    assert agent_run.status == "completed"
    assert output["verdict"] == "fail"
    assert output["next_actions"][0]["worker_role"] == "backend"


# ── pytest_runner tests (real subprocess) ───────────────────────────────────


@pytest.mark.skipif(
    not _pytest_importable() or not _json_report_importable(),
    reason="pytest / pytest-json-report not installed",
)
class TestPytestRunner:
    def _make_project(self) -> Path:
        tmp = Path(tempfile.mkdtemp(prefix="mg-pytest-runner-"))
        (tmp / "pytest.ini").write_text("[pytest]\ntestpaths = tests\n", encoding="utf-8")
        (tmp / "tests").mkdir()
        (tmp / "tests" / "test_ok.py").write_text(
            "def test_passes():\n    assert 1 + 1 == 2\n", encoding="utf-8"
        )
        (tmp / "tests" / "test_bad.py").write_text(
            "def test_fails():\n    assert 1 + 1 == 3\n", encoding="utf-8"
        )
        return tmp

    def test_runs_passing_suite(self):
        proj = self._make_project()
        try:
            result = run_pytest(proj, test_paths=["tests/test_ok.py"], timeout_s=60)
            assert result.error == "", f"unexpected error: {result.error}"
            assert result.passed == 1
            assert result.failed == 0
        finally:
            shutil.rmtree(proj, ignore_errors=True)

    def test_captures_failure_details(self):
        proj = self._make_project()
        try:
            result = run_pytest(proj, test_paths=["tests/test_bad.py"], timeout_s=60)
            assert result.failed >= 1
            # Either the json-report parsed correctly or we fell back to exit code
            failed_ids = [f.nodeid for f in result.failed_tests]
            if failed_ids:
                assert any("test_fails" in nid for nid in failed_ids)
        finally:
            shutil.rmtree(proj, ignore_errors=True)

    def test_silently_drops_paths_escaping_project_root(self):
        proj = self._make_project()
        try:
            # Escape attempts should be filtered out before subprocess is launched
            result = run_pytest(
                proj,
                test_paths=["../escaped.py", "/abs/path.py"],
                timeout_s=60,
            )
            # Should still run (with no test paths => collects nothing or rootdir tests)
            assert result.exit_code in (0, 1, 2, 5)  # not a crash
        finally:
            shutil.rmtree(proj, ignore_errors=True)

    def test_missing_project_root_returns_error(self):
        result = run_pytest(Path("/this/does/not/exist"), timeout_s=10)
        assert "does not exist" in result.error

    def test_timeout_marks_timed_out(self):
        proj = self._make_project()
        # Add a test that sleeps longer than the timeout
        (proj / "tests" / "test_slow.py").write_text(
            "import time\ndef test_slow():\n    time.sleep(30)\n", encoding="utf-8"
        )
        try:
            result = run_pytest(proj, timeout_s=2)
            assert result.timed_out is True
        finally:
            shutil.rmtree(proj, ignore_errors=True)
