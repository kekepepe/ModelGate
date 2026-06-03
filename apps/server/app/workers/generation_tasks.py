import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from redis import Redis

from app.core.config import settings
from app.db.models import GenerationTask
from app.db.session import SessionLocal
from app.services.generation_runtime import generation_runtime, transition_generation_task
from app.workers.celery_app import celery_app

LOCK_TTL_SECONDS = 120


@celery_app.task(name="generation.submit", bind=True, max_retries=3, default_retry_delay=5)
def submit_generation_task(self, task_id: str) -> dict:
    token = _acquire_lock(task_id)
    if token is None:
        return {"taskId": task_id, "status": "locked"}
    try:
        with SessionLocal() as db:
            task = asyncio.run(generation_runtime.submit_provider_task(db=db, task_id=task_id))
            if task and task.status in {"submitted", "processing"}:
                poll_generation_task.apply_async(args=[task.id], countdown=_poll_delay(task))
            return {"taskId": task_id, "status": task.status if task else "not_found"}
    except Exception as exc:
        raise self.retry(exc=exc) from exc
    finally:
        _release_lock(task_id, token)


@celery_app.task(name="generation.poll", bind=True, max_retries=5, default_retry_delay=10)
def poll_generation_task(self, task_id: str) -> dict:
    token = _acquire_lock(task_id)
    if token is None:
        return {"taskId": task_id, "status": "locked"}
    try:
        with SessionLocal() as db:
            task = asyncio.run(generation_runtime.poll_provider_task(db=db, task_id=task_id))
            if task and task.status in {"submitted", "processing"}:
                poll_generation_task.apply_async(args=[task.id], countdown=_poll_delay(task))
            elif task and task.status == "completed":
                download_generation_outputs.delay(task.id)
            return {"taskId": task_id, "status": task.status if task else "not_found"}
    except Exception as exc:
        raise self.retry(exc=exc) from exc
    finally:
        _release_lock(task_id, token)


@celery_app.task(name="generation.download_outputs", bind=True, max_retries=3, default_retry_delay=10)
def download_generation_outputs(self, task_id: str) -> dict:
    with SessionLocal() as db:
        task = db.get(GenerationTask, task_id)
        if task is None:
            return {"taskId": task_id, "status": "not_found"}
        if task.status != "completed":
            return {"taskId": task_id, "status": task.status}

        output = task.output_json or {}
        task.output_json = output | {"storage": {"mode": "provider_output_reference"}}
        db.commit()
        return {"taskId": task_id, "status": task.status}


@celery_app.task(name="generation.expire")
def expire_generation_task(task_id: str) -> dict:
    with SessionLocal() as db:
        task = db.get(GenerationTask, task_id)
        if task is None:
            return {"taskId": task_id, "status": "not_found"}
        if task.status in {"completed", "failed", "cancelled", "expired"}:
            return {"taskId": task_id, "status": task.status}
        transition_generation_task(
            task,
            to_status="expired",
            from_status=["queued", "submitted", "processing"],
            reason="worker_expired",
        )
        task.completed_at = task.completed_at or task.expires_at
        task.poll_after = None
        db.commit()
        return {"taskId": task_id, "status": task.status}


def _redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


def _lock_key(task_id: str) -> str:
    return f"lock:generation_task:{task_id}"


def _acquire_lock(task_id: str) -> str | None:
    token = uuid4().hex
    client = _redis()
    try:
        acquired = client.set(_lock_key(task_id), token, nx=True, ex=LOCK_TTL_SECONDS)
        return token if acquired else None
    finally:
        client.close()


def _release_lock(task_id: str, token: str) -> None:
    client = _redis()
    try:
        if client.get(_lock_key(task_id)) == token:
            client.delete(_lock_key(task_id))
    finally:
        client.close()


def _poll_delay(task: GenerationTask) -> int:
    if task.poll_after is None:
        return 5
    seconds = int((task.poll_after - datetime.now(UTC)).total_seconds())
    return max(1, min(seconds, 60))
