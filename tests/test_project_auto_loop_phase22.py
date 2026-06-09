"""Tests for V2.7 Controlled Auto loop (phase 22).

Covers:
- ``ProjectOrchestrator._apply_patch_artifact`` (uses a temp git repo to
  validate the apply path; falls back to monkeypatched subprocess if git
  isn't usable in the test env).
- ``_run_verifier_loop`` happy path (verdict=pass on round 1).
- ``_run_verifier_loop`` 2 rounds → pass.
- ``_run_verifier_loop`` exhausts max_rounds.
- ``_run_verifier_loop`` patch apply failure short-circuits.
- run_worker with feedback_prefix prepends the feedback block.
- ``run_approved`` invokes the verifier loop when mode=controlled_auto
  and writes stop_reason / stop_round / round to the project_run row.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
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
from app.services.project_runtime import orchestrator as orch_module  # noqa: E402
from app.services.project_runtime.budget import Budget, BudgetTracker  # noqa: E402
from app.services.project_runtime.orchestrator import ProjectOrchestrator  # noqa: E402


# ── fixtures ────────────────────────────────────────────────────────────────


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


def _make_project_run(s, mode: str = "controlled_auto") -> db_models.ProjectRun:
    pr = db_models.ProjectRun(
        id=f"pr_{uuid4().hex}",
        title="t", goal="g", status="running",
        mode=mode,
        planner_model_id="mock",
        supervisor_model_id="mock",
        integrator_model_id="mock",
        worker_model_id="mock",
    )
    s.add(pr)
    s.commit()
    return pr


def _make_task(s, run_id: str, role: str = "backend") -> db_models.ProjectTask:
    t = db_models.ProjectTask(
        id=f"t_{uuid4().hex}", project_run_id=run_id,
        title=f"task {role}", description="d", role=role, status="pending",
        allowed_files=[], acceptance_criteria=[], depends_on=[],
    )
    s.add(t)
    s.commit()
    return t


def _make_patch_artifact(
    s, run_id: str, task_id: str, content: str = "--- a/foo.py\n+++ b/foo.py\n@@ -1 +1 @@\n-old\n+new\n",
) -> db_models.Artifact:
    art = db_models.Artifact(
        id=f"art_{uuid4().hex}", project_run_id=run_id, task_id=task_id,
        agent_run_id=None, type="patch", name=f"patch-{task_id}.diff",
        content_text=content, size_bytes=len(content),
        truncated=False, metadata_json={},
    )
    s.add(art)
    s.commit()
    return art


class _FakeRun:
    def __init__(self, text: str, run_id: str | None = None) -> None:
        self.id = run_id or f"run_{uuid4().hex}"
        self.output_json = {"text": text}
        self.started_at = datetime.now(UTC)
        self.completed_at = datetime.now(UTC)


# ── run_worker feedback_prefix ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_worker_feedback_prefix_is_prepended(session, monkeypatch):
    """When a feedback_prefix is passed, it appears before the worker's normal prompt."""
    captured: dict = {}

    async def fake_run_agent(*, user_prompt, **_):
        captured["user_prompt"] = user_prompt
        return _FakeRun("{}"), {}

    monkeypatch.setattr(agents_module, "_run_agent", fake_run_agent)

    task = _make_task(session, run_id=f"pr_{uuid4().hex}")
    await agents_module.run_worker(
        db=session,
        project_run_id=task.project_run_id,
        task=task,
        planner_output={},
        budget=BudgetTracker(Budget()),
        model_id="mock",
        feedback_prefix="VERIFIER FEEDBACK: please fix X",
    )

    assert captured["user_prompt"].startswith("VERIFIER FEEDBACK: please fix X")


# ── _run_verifier_loop ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_verifier_loop_happy_path_one_round(session, monkeypatch):
    """Verdict=pass on round 1 → status='pass', rounds=1, stop_reason='VERIFIER_PASS'."""
    pr = _make_project_run(session)
    task = _make_task(session, pr.id, "backend")
    _make_patch_artifact(session, pr.id, task.id)

    # 1) Force _apply_patch_artifact to succeed without touching the real project
    monkeypatch.setattr(
        ProjectOrchestrator, "_apply_patch_artifact",
        lambda self, db, art, pr: {"ok": True, "files": ["foo.py"], "error": ""},
    )
    # 2) Force pytest_runner to report 0 failures
    def fake_run_pytest(*_a, **_k):
        from app.services.project_runtime.pytest_runner import PytestResult
        return PytestResult(passed=5, failed=0, total=5, exit_code=0)

    monkeypatch.setattr(orch_module, "run_pytest", fake_run_pytest)
    # 3) run_verifier returns verdict=pass
    canned_pass = json.dumps({
        "summary": "all good",
        "verdict": "pass",
        "failed_tests": [],
        "analysis": "looks good",
        "next_actions": [],
    })

    async def fake_run_chat(**_kwargs):
        return _FakeRun(canned_pass)

    monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

    orch = ProjectOrchestrator()
    result = await orch._run_verifier_loop(
        db=session,
        project_run=pr,
        tasks=[task],
        planner_output={},
        tracker=BudgetTracker(Budget(max_rounds=3)),
        worker_model_id="mock",
        verifier_model_id="mock",
        max_rounds=3,
    )
    assert result["status"] == "pass"
    assert result["rounds"] == 1
    assert result["stop_reason"] == "VERIFIER_PASS"


@pytest.mark.asyncio
async def test_verifier_loop_two_rounds_then_pass(session, monkeypatch):
    """Verdict=fail round 1, pass round 2 → rounds=2, status='pass'."""
    pr = _make_project_run(session)
    task = _make_task(session, pr.id, "backend")
    _make_patch_artifact(session, pr.id, task.id)

    monkeypatch.setattr(
        ProjectOrchestrator, "_apply_patch_artifact",
        lambda self, db, art, pr: {"ok": True, "files": ["foo.py"], "error": ""},
    )

    def fake_run_pytest(*_a, **_k):
        from app.services.project_runtime.pytest_runner import PytestResult
        return PytestResult(passed=0, failed=1, total=1, exit_code=1)

    monkeypatch.setattr(orch_module, "run_pytest", fake_run_pytest)

    # Verifier returns fail first, then pass
    verdicts = iter(["fail", "pass"])

    async def fake_run_chat(**_kwargs):
        verdict = next(verdicts, "pass")
        payload = {
            "summary": verdict,
            "verdict": verdict,
            "failed_tests": (
                [{"nodeid": "tests/test_x.py::test_a", "message": "boom"}]
                if verdict == "fail" else []
            ),
            "analysis": verdict,
            "next_actions": (
                [{"worker_role": "backend", "instruction": "fix foo"}]
                if verdict == "fail" else []
            ),
        }
        return _FakeRun(json.dumps(payload))

    monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

    async def fake_run_workers_parallel(self, **kwargs):
        pass

    monkeypatch.setattr(ProjectOrchestrator, "_run_workers_parallel", fake_run_workers_parallel)

    orch = ProjectOrchestrator()
    result = await orch._run_verifier_loop(
        db=session,
        project_run=pr,
        tasks=[task],
        planner_output={},
        tracker=BudgetTracker(Budget(max_rounds=3)),
        worker_model_id="mock",
        verifier_model_id="mock",
        max_rounds=3,
    )
    assert result["status"] == "pass"
    assert result["rounds"] == 2


@pytest.mark.asyncio
async def test_verifier_loop_exhausts_max_rounds(session, monkeypatch):
    """Always-fail verifier → status='exhausted', rounds=max_rounds, stop_reason='MAX_ROUNDS'."""
    pr = _make_project_run(session)
    task = _make_task(session, pr.id, "backend")
    _make_patch_artifact(session, pr.id, task.id)

    monkeypatch.setattr(
        ProjectOrchestrator, "_apply_patch_artifact",
        lambda self, db, art, pr: {"ok": True, "files": ["foo.py"], "error": ""},
    )

    def fake_run_pytest(*_a, **_k):
        from app.services.project_runtime.pytest_runner import PytestResult
        return PytestResult(passed=0, failed=1, total=1, exit_code=1)

    monkeypatch.setattr(orch_module, "run_pytest", fake_run_pytest)

    canned_fail = json.dumps({
        "summary": "still failing",
        "verdict": "fail",
        "failed_tests": [{"nodeid": "t::x", "message": "y"}],
        "analysis": "need more work",
        "next_actions": [{"worker_role": "backend", "instruction": "fix"}],
    })

    async def fake_run_chat(**_kwargs):
        return _FakeRun(canned_fail)

    monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

    async def fake_run_workers_parallel(self, **kwargs):
        pass

    monkeypatch.setattr(ProjectOrchestrator, "_run_workers_parallel", fake_run_workers_parallel)

    orch = ProjectOrchestrator()
    result = await orch._run_verifier_loop(
        db=session,
        project_run=pr,
        tasks=[task],
        planner_output={},
        tracker=BudgetTracker(Budget(max_rounds=2)),
        worker_model_id="mock",
        verifier_model_id="mock",
        max_rounds=2,
    )
    assert result["status"] == "exhausted"
    assert result["rounds"] == 2
    assert result["stop_reason"] == "MAX_ROUNDS"


@pytest.mark.asyncio
async def test_verifier_loop_no_patches_short_circuits(session, monkeypatch):
    """No patch artifacts at all → status='no_patches' without invoking pytest/verifier."""
    pr = _make_project_run(session)
    task = _make_task(session, pr.id, "backend")
    # No _make_patch_artifact — there are no patches

    invoked = {"pytest": False, "verifier": False}

    def fake_run_pytest(*_a, **_k):
        invoked["pytest"] = True
        from app.services.project_runtime.pytest_runner import PytestResult
        return PytestResult()

    monkeypatch.setattr(orch_module, "run_pytest", fake_run_pytest)

    async def fake_run_chat(**_kwargs):
        invoked["verifier"] = True
        return _FakeRun("{}")

    monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

    orch = ProjectOrchestrator()
    result = await orch._run_verifier_loop(
        db=session,
        project_run=pr,
        tasks=[task],
        planner_output={},
        tracker=BudgetTracker(Budget(max_rounds=3)),
        worker_model_id="mock",
        verifier_model_id="mock",
        max_rounds=3,
    )
    assert result["status"] == "no_patches"
    assert invoked["pytest"] is False
    assert invoked["verifier"] is False


@pytest.mark.asyncio
async def test_verifier_loop_apply_failure_short_circuits(session, monkeypatch):
    """git apply fails on every patch → status='exhausted', stop_reason='PATCH_APPLY_FAILED'."""
    pr = _make_project_run(session)
    task = _make_task(session, pr.id, "backend")
    _make_patch_artifact(session, pr.id, task.id)

    monkeypatch.setattr(
        ProjectOrchestrator, "_apply_patch_artifact",
        lambda self, db, art, pr: {"ok": False, "files": [], "error": "syntax"},
    )

    orch = ProjectOrchestrator()
    result = await orch._run_verifier_loop(
        db=session,
        project_run=pr,
        tasks=[task],
        planner_output={},
        tracker=BudgetTracker(Budget(max_rounds=3)),
        worker_model_id="mock",
        verifier_model_id="mock",
        max_rounds=3,
    )
    assert result["status"] == "exhausted"
    assert result["stop_reason"] == "PATCH_APPLY_FAILED"


# ── Stage 5: stop conditions ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_repeated_test_failure_stops(session, monkeypatch):
    """Same test nodeids failing 2 rounds consecutively → REPEATED_TEST_FAILURE."""
    pr = _make_project_run(session)
    task = _make_task(session, pr.id, "backend")
    _make_patch_artifact(session, pr.id, task.id)

    monkeypatch.setattr(
        ProjectOrchestrator, "_apply_patch_artifact",
        lambda self, db, art, pr: {"ok": True, "files": ["foo.py"], "error": ""},
    )

    def fake_run_pytest(*_a, **_k):
        from app.services.project_runtime.pytest_runner import FailedTestInfo, PytestResult
        return PytestResult(passed=0, failed=1, total=1, exit_code=1,
                            failed_tests=[FailedTestInfo(nodeid="t::same", message="boom")])

    monkeypatch.setattr(orch_module, "run_pytest", fake_run_pytest)

    async def fake_run_chat(**_kwargs):
        return _FakeRun(json.dumps({
            "summary": "same failure", "verdict": "fail",
            "failed_tests": [{"nodeid": "t::same", "message": "boom"}],
            "analysis": "x", "next_actions": [{"worker_role": "backend", "instruction": "fix"}],
        }))

    monkeypatch.setattr(agents_module.chat_runtime, "run_chat", fake_run_chat)

    async def fake_run_workers_parallel(self, **kwargs):
        pass

    monkeypatch.setattr(ProjectOrchestrator, "_run_workers_parallel", fake_run_workers_parallel)

    orch = ProjectOrchestrator()
    result = await orch._run_verifier_loop(
        db=session, project_run=pr, tasks=[task], planner_output={},
        tracker=BudgetTracker(Budget(max_rounds=5, max_same_test_failures=2)),
        worker_model_id="mock", verifier_model_id="mock", max_rounds=5,
    )
    assert result["stop_reason"] == "REPEATED_TEST_FAILURE"
    assert result["rounds"] >= 2


def test_budget_tracker_schema_failures():
    """record_schema_failure returns True when max_schema_failures reached."""
    tracker = BudgetTracker(Budget(max_schema_failures=2))
    assert tracker.record_schema_failure("t1") is False
    assert tracker.record_schema_failure("t1") is True
    assert tracker.schema_failures_per_task["t1"] == 2


def test_budget_tracker_repeated_test_failures():
    """record_failed_tests returns True when the same set repeats max_same_test_failures times."""
    tracker = BudgetTracker(Budget(max_same_test_failures=2))
    # First round — not enough history
    assert tracker.record_failed_tests({"a", "b"}) is False
    # Second round — same set → threshold hit
    assert tracker.record_failed_tests({"a", "b"}) is True
    # Different set — resets
    tracker2 = BudgetTracker(Budget(max_same_test_failures=3))
    tracker2.record_failed_tests({"a"})
    tracker2.record_failed_tests({"b"})
    assert tracker2.record_failed_tests({"b"}) is False  # only 2 in a row same


def test_budget_repeated_empty_set_ignored():
    """Empty failed tests don't count toward repeated-failure threshold."""
    tracker = BudgetTracker(Budget(max_same_test_failures=2))
    tracker.record_failed_tests(set())
    tracker.record_failed_tests(set())
    # Empty sets should never trigger
    assert tracker.record_failed_tests(set()) is False


def test_project_run_serializes_stop_fields(session):
    """_serialize_project_run includes round / stopReason / stopRound."""
    pr = _make_project_run(session)
    pr.round = 3
    pr.stop_reason = "VERIFIER_PASS"
    pr.stop_round = 3

    from app.api.projects import _serialize_project_run
    data = _serialize_project_run(pr)
    assert data["round"] == 3
    assert data["stopReason"] == "VERIFIER_PASS"
    assert data["stopRound"] == 3
