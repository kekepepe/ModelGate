"""Concurrency / race-condition tests for the Generation Runtime.

The runtime is exposed to three distinct concurrency surfaces:

1. **Idempotency on create** — two requests with the same key must collapse
   into a single task. Enforced at the application layer (lookup-then-insert)
   and at the DB layer (unique partial index on ``idempotency_key``).
2. **Status state machine** — ``transition_generation_task`` rejects
   out-of-order transitions so two workers cannot both move a task from
   ``queued → submitted`` and overwrite each other.
3. **Worker lock** — Celery tasks wrap ``submit`` / ``poll`` with a
   short-lived Redis ``SET NX`` lock so two workers racing on the same
   task id do not run the provider call twice.

The tests below exercise each surface in isolation, then a combined
end-to-end race for the create path. Tests that need a real DB or Redis
skip cleanly when the local services are not reachable.
"""

from __future__ import annotations

import socket
import sys
import threading
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.core.errors import AppError  # noqa: E402
from app.db.models import GenerationTask  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.providers.base import GenerationOutput, TaskStatus  # noqa: E402
from app.services.generation_runtime import (  # noqa: E402
    ALLOWED_TRANSITIONS,
    TERMINAL_STATUSES,
    _dispatch_submit,
    _sync_submit_task,
    generation_runtime,
    transition_generation_task,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_local_port(port: int) -> None:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return
    except OSError as exc:
        pytest.skip(f"localhost:{port} is not reachable: {exc}")


def _fake_model() -> dict:
    return {
        "id": "mimo.mimo_v2_5",
        "officialModelName": "Fake Generation Model",
        "displayName": "Fake Generation Model",
        "provider": "mimo",
        "category": "generation",
        "runtime": "video_generation",
        "capabilities": ["text_to_video", "async_generation"],
        "inputTypes": ["text"],
        "outputTypes": ["video"],
        "taskTypes": ["text_to_video"],
        "contextWindow": None,
        "async": True,
        "enabled": True,
        "paramsSchema": "chat_openai_compatible_schema",
        "adapterConfig": {"protocol": "fake_generation", "providerModelName": "fake-generation"},
    }


def _fake_provider() -> dict:
    return {
        "id": "mimo",
        "name": "Xiaomi MiMo",
        "baseUrl": "https://example.test",
        "authType": "bearer",
        "envKey": "MIMO_API_KEY",
        "adapter": "mimo",
        "enabled": True,
        "metadata": {},
    }


def _patch_registry(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.generation_runtime.model_registry.get_model",
        lambda model_id: _fake_model(),
    )
    monkeypatch.setattr(
        "app.services.generation_runtime.model_registry.get_provider",
        lambda provider_id: _fake_provider(),
    )


class _FakeAdapter:
    """Records the number of times each method is called."""

    create_calls = 0
    get_calls = 0
    cancel_calls = 0

    async def create_generation_task(self, input_data):
        type(self).create_calls += 1
        return GenerationOutput(
            status=TaskStatus.PROCESSING,
            provider_task_id="provider_task_race",
            provider_status="running",
            progress=10,
            metadata={"pollAfterSeconds": 1},
        )

    async def get_generation_task(self, input_data, provider_task_id: str):
        type(self).get_calls += 1
        return GenerationOutput(
            status=TaskStatus.PROCESSING,
            provider_task_id=provider_task_id,
            provider_status="running",
            progress=50,
            metadata={"pollAfterSeconds": 1},
        )

    async def cancel_generation_task(self, input_data, provider_task_id: str):
        type(self).cancel_calls += 1
        return GenerationOutput(status=TaskStatus.CANCELLED, provider_task_id=provider_task_id)


# ---------------------------------------------------------------------------
# 1. Pure state-machine tests (no DB / no Redis)
# ---------------------------------------------------------------------------


class _TaskStub:
    def __init__(self, status: str) -> None:
        self.status = status


def test_state_machine_allows_legal_transitions() -> None:
    task = _TaskStub("queued")
    transition_generation_task(task, to_status="submitted", from_status=["queued"], reason="t")
    assert task.status == "submitted"

    transition_generation_task(task, to_status="processing", from_status=["submitted"], reason="t")
    assert task.status == "processing"

    transition_generation_task(task, to_status="completed", from_status=["processing"], reason="t")
    assert task.status == "completed"


def test_state_machine_blocks_backward_transitions() -> None:
    """A task in ``processing`` cannot jump back to ``submitted``."""
    task = _TaskStub("processing")
    with pytest.raises(AppError) as exc:
        transition_generation_task(
            task, to_status="submitted", from_status=["processing"], reason="late_event"
        )
    assert exc.value.error_type == "GENERATION_STATUS_TRANSITION_INVALID"
    assert task.status == "processing"


def test_state_machine_blocks_terminal_reuse() -> None:
    """Once a task is in a terminal state, no transitions are allowed."""
    for terminal in ("completed", "failed", "cancelled", "expired"):
        task = _TaskStub(terminal)
        for to in ("queued", "submitted", "processing", "completed"):
            with pytest.raises(AppError):
                transition_generation_task(task, to_status=to, from_status=None, reason="t")
        assert task.status == terminal


def test_state_machine_from_status_mismatch_raises_conflict() -> None:
    """If ``from_status`` is set and the current status is not in it, raise."""
    task = _TaskStub("submitted")
    with pytest.raises(AppError) as exc:
        transition_generation_task(
            task,
            to_status="completed",
            from_status=["queued"],  # current status is "submitted"
            reason="race",
        )
    assert exc.value.error_type == "GENERATION_STATUS_CONFLICT"


def test_terminal_statuses_have_no_outgoing_edges() -> None:
    for status in TERMINAL_STATUSES:
        assert (
            ALLOWED_TRANSITIONS[status] == set()
        ), f"terminal state {status} unexpectedly has outgoing transitions"


# ---------------------------------------------------------------------------
# 2. Idempotency on create (DB required)
# ---------------------------------------------------------------------------


def test_create_task_idempotency_returns_existing_row(monkeypatch) -> None:
    _require_local_port(5432)
    _patch_registry(monkeypatch)
    monkeypatch.setattr(
        "app.services.generation_runtime._dispatch_submit",
        lambda task_id: None,
    )

    import asyncio as _asyncio

    idem_key = f"phase_concurrency_{datetime.now(UTC).timestamp()}"

    with SessionLocal() as db:
        task1 = _asyncio.run(
            generation_runtime.create_task(
                db=db,
                task_type="text_to_video",
                model_id="mimo.mimo_v2_5",
                input_json={"prompt": "a cat"},
                params={},
                idempotency_key=idem_key,
                enqueue=False,
            )
        )
        task2 = _asyncio.run(
            generation_runtime.create_task(
                db=db,
                task_type="text_to_video",
                model_id="mimo.mimo_v2_5",
                input_json={"prompt": "a cat"},
                params={},
                idempotency_key=idem_key,
                enqueue=False,
            )
        )
        assert task1.id == task2.id
        task_id = task1.id

    with SessionLocal() as db:
        count = db.query(GenerationTask).filter(GenerationTask.idempotency_key == idem_key).count()
        assert count == 1
        record = db.get(GenerationTask, task_id)
        assert record is not None


# ---------------------------------------------------------------------------
# 3. Concurrent submit races (DB required, adapter is mocked)
# ---------------------------------------------------------------------------


def test_concurrent_submits_only_one_transitions_task(monkeypatch) -> None:
    """Two threads calling ``submit_provider_task`` on the same queued task
    must end with exactly one ``submitted`` transition and exactly one
    provider call.
    """
    _require_local_port(5432)
    _require_local_port(6379)
    _patch_registry(monkeypatch)
    _FakeAdapter.create_calls = 0
    monkeypatch.setattr(
        "app.services.generation_runtime.create_generation_adapter",
        lambda **kwargs: _FakeAdapter(),
    )

    task_id = f"task_race_{datetime.now(UTC).timestamp()}"
    with SessionLocal() as db:
        db.add(
            GenerationTask(
                id=task_id,
                provider_id="mimo",
                model_id="mimo.mimo_v2_5",
                task_type="text_to_video",
                input_json={"prompt": "race"},
                params_json={},
                status="queued",
                progress=0,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        db.commit()

    import asyncio as _asyncio

    barrier = threading.Barrier(2)
    results: list[object] = []

    def _worker() -> None:
        barrier.wait()
        try:
            with SessionLocal() as db:
                result = _asyncio.run(
                    generation_runtime.submit_provider_task(db=db, task_id=task_id)
                )
                results.append(result.status if result else "none")
        except Exception as exc:
            results.append(exc)

    threads = [threading.Thread(target=_worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert (
        _FakeAdapter.create_calls == 1
    ), f"expected exactly one provider call, got {_FakeAdapter.create_calls}; results={results}"
    # We deliberately do NOT assert per-thread returned status here. The losing
    # thread's ``db.get()`` may land before the winner's commit (returning
    # "queued"), between commits (returning "submitted"), or after the
    # winner's _apply_provider_output (returning "processing"). The runtime
    # contract is "only one provider call + final DB state is consistent" —
    # not "exactly one thread returns X". The assertions below cover that.
    assert len(results) == 2
    assert all(r is not None for r in results), f"both threads should return a task; got {results}"

    with SessionLocal() as db:
        record = db.get(GenerationTask, task_id)
        assert record.status == "processing"
        assert record.provider_task_id == "provider_task_race"


def test_poll_on_queued_task_is_noop(monkeypatch) -> None:
    """A poll arriving before the submit completes must not crash and
    must not change the status. This protects against a small window
    where the Celery ``generation.poll`` job is scheduled by a previous
    run and lands while the task is still ``queued``.
    """
    _require_local_port(5432)
    _require_local_port(6379)
    _patch_registry(monkeypatch)

    task_id = f"task_pollqueued_{datetime.now(UTC).timestamp()}"
    with SessionLocal() as db:
        db.add(
            GenerationTask(
                id=task_id,
                provider_id="mimo",
                model_id="mimo.mimo_v2_5",
                task_type="text_to_video",
                input_json={"prompt": "race"},
                params_json={},
                status="queued",
                progress=0,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        db.commit()

    import asyncio as _asyncio

    with SessionLocal() as db:
        result = _asyncio.run(generation_runtime.poll_provider_task(db=db, task_id=task_id))
    assert result is not None
    assert result.status == "queued"

    with SessionLocal() as db:
        record = db.get(GenerationTask, task_id)
        assert record.status == "queued"
        assert record.provider_task_id is None


def test_cancel_after_completion_is_noop(monkeypatch) -> None:
    _require_local_port(5432)
    _require_local_port(6379)
    _patch_registry(monkeypatch)

    _FakeAdapter.cancel_calls = 0
    monkeypatch.setattr(
        "app.services.generation_runtime.create_generation_adapter",
        lambda **kwargs: _FakeAdapter(),
    )

    task_id = f"task_cancelafter_{datetime.now(UTC).timestamp()}"
    with SessionLocal() as db:
        db.add(
            GenerationTask(
                id=task_id,
                provider_id="mimo",
                model_id="mimo.mimo_v2_5",
                task_type="text_to_video",
                input_json={"prompt": "race"},
                params_json={},
                status="completed",
                progress=100,
                output_json={"videoUrl": "https://x/y.mp4"},
                provider_task_id="provider_task_race",
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        db.commit()

    import asyncio as _asyncio

    with SessionLocal() as db:
        result, provider_cancelled = _asyncio.run(
            generation_runtime.cancel_task(db=db, task_id=task_id)
        )
    assert result.status == "completed"
    assert provider_cancelled is False
    assert _FakeAdapter.cancel_calls == 0


# ---------------------------------------------------------------------------
# 4. Dispatch / dev-mode thread dedup (DB + adapter mocked)
# ---------------------------------------------------------------------------


def test_dispatch_submit_dedupes_with_disable_celery(monkeypatch) -> None:
    """When Celery is disabled, every ``_dispatch_submit`` call kicks off
    a daemon thread that calls ``submit_provider_task``. We patch the
    underlying submit to count invocations, then fire two dispatches at
    the same queued task; only the first one should actually call the
    provider (the second is dropped by the runtime's own guard).
    """
    _require_local_port(5432)
    _require_local_port(6379)
    monkeypatch.setattr("app.core.config.settings.disable_celery", True)
    _patch_registry(monkeypatch)
    _FakeAdapter.create_calls = 0
    monkeypatch.setattr(
        "app.services.generation_runtime.create_generation_adapter",
        lambda **kwargs: _FakeAdapter(),
    )

    task_id = f"task_devdispatch_{datetime.now(UTC).timestamp()}"
    with SessionLocal() as db:
        db.add(
            GenerationTask(
                id=task_id,
                provider_id="mimo",
                model_id="mimo.mimo_v2_5",
                task_type="text_to_video",
                input_json={"prompt": "dev dispatch"},
                params_json={},
                status="queued",
                progress=0,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        db.commit()

    # First dispatch should run the submit thread end-to-end.
    _dispatch_submit(task_id)
    # Wait for the daemon thread to finish.
    for _ in range(50):
        if _FakeAdapter.create_calls >= 1:
            break
        time.sleep(0.05)
    first_call_count = _FakeAdapter.create_calls
    assert first_call_count == 1

    # A second dispatch on the now-processing task must NOT re-submit.
    # The runtime guard rejects tasks whose status is not "queued".
    _dispatch_submit(task_id)
    time.sleep(0.5)
    assert (
        _FakeAdapter.create_calls == 1
    ), "second dispatch should have been a no-op on a non-queued task"

    monkeypatch.setattr("app.core.config.settings.disable_celery", False)


# ---------------------------------------------------------------------------
# 5. Worker lock semantics (mocked Redis)
# ---------------------------------------------------------------------------


def test_worker_lock_acquire_release_and_takeover(monkeypatch) -> None:
    """The Celery task uses ``SET NX EX`` for short-lived ownership.
    This test fakes Redis with an in-process dict and verifies the
    semantics used by ``_acquire_lock`` / ``_release_lock``.
    """
    store: dict[str, str] = {}
    fake_redis = SimpleNamespace(
        set=lambda key, value, nx=False, ex=0: (
            (store.update({key: value}) or True) if nx and key not in store else None
        ),
        get=lambda key: store.get(key),
        delete=lambda key: store.pop(key, None) is not None,
        close=lambda: None,
    )
    monkeypatch.setattr("app.workers.generation_tasks._redis", lambda: fake_redis)

    from app.workers.generation_tasks import (
        _acquire_lock,
        _release_lock,
    )

    task_id = "task_lock"
    token_a = _acquire_lock(task_id)
    assert token_a is not None
    token_b = _acquire_lock(task_id)
    assert token_b is None, "second acquire on held lock must return None"

    # Release with wrong token does not free the lock.
    _release_lock(task_id, "not-the-real-token")
    token_c = _acquire_lock(task_id)
    assert token_c is None, "lock must still be held after a foreign release"

    # Release with the correct token frees it.
    _release_lock(task_id, token_a)
    token_d = _acquire_lock(task_id)
    assert token_d is not None
    assert token_d != token_a


def test_sync_submit_task_is_failure_tolerant(monkeypatch) -> None:
    """``_sync_submit_task`` is the dev-mode equivalent of the Celery
    task. It must never raise — a misbehaving task should not crash the
    daemon thread the API spawns during a request.
    """
    monkeypatch.setattr(
        "app.services.generation_runtime.generation_runtime.submit_provider_task",
        MagicMock(side_effect=RuntimeError("boom")),
    )
    monkeypatch.setattr(
        "app.db.session.SessionLocal",
        MagicMock(side_effect=RuntimeError("db down")),
    )
    # Must not raise.
    _sync_submit_task("task_does_not_exist")
