from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from time import monotonic
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import GenerationTask, RequestLog
from app.providers.base import GenerationInput, GenerationOutput, TaskStatus
from app.providers.errors import ProviderError
from app.providers.factory import create_generation_adapter
from app.providers.volcengine_seedance import is_volcengine_hosted_url
from app.services.model_registry import model_registry
from app.services.storage import build_dated_key, get_storage

MAX_OUTPUT_DOWNLOAD_BYTES = 200 * 1024 * 1024
OUTPUT_DOWNLOAD_TIMEOUT_SECONDS = 60.0

TERMINAL_STATUSES = {"completed", "failed", "cancelled", "expired"}
POLLABLE_STATUSES = {"submitted", "processing"}

ALLOWED_TRANSITIONS = {
    "queued": {"submitted", "failed", "cancelled", "expired"},
    "submitted": {"processing", "completed", "failed", "cancelled", "expired"},
    "processing": {"processing", "completed", "failed", "cancelled", "expired"},
    "completed": set(),
    "failed": set(),
    "cancelled": set(),
    "expired": set(),
}


class GenerationRuntime:
    async def create_task(
        self,
        *,
        db: Session,
        task_type: str,
        model_id: str,
        input_json: dict,
        params: dict,
        idempotency_key: str | None = None,
        enqueue: bool = True,
    ) -> GenerationTask:
        if idempotency_key:
            existing = (
                db.query(GenerationTask)
                .filter(GenerationTask.idempotency_key == idempotency_key)
                .one_or_none()
            )
            if existing is not None:
                return existing

        model = model_registry.get_model(model_id)
        provider = model_registry.get_provider(model["provider"])
        self._validate_generation_model(model=model, provider=provider, task_type=task_type)

        task = GenerationTask(
            id=f"task_{uuid4().hex}",
            provider_id=model["provider"],
            model_id=model["id"],
            task_type=task_type,
            input_json=input_json,
            params_json=params,
            status="queued",
            progress=0,
            idempotency_key=idempotency_key,
            request_hash=_request_hash(
                {
                    "taskType": task_type,
                    "modelId": model_id,
                    "input": input_json,
                    "params": params,
                }
            ),
            expires_at=_expires_at(params),
        )
        db.add(task)
        db.commit()
        db.refresh(task)

        if enqueue:
            _dispatch_submit(task.id)

        return task

    async def submit_provider_task(self, *, db: Session, task_id: str) -> GenerationTask | None:
        task = db.get(GenerationTask, task_id)
        if task is None or task.status in TERMINAL_STATUSES:
            return task
        if task.status != "queued":
            return task
        if _is_expired(task):
            _mark_terminal(task, "expired", progress=task.progress)
            db.commit()
            db.refresh(task)
            return task

        model = model_registry.get_model(task.model_id)
        provider = model_registry.get_provider(task.provider_id)
        self._validate_generation_model(model=model, provider=provider, task_type=task.task_type)

        provider_params = self._map_provider_params(model=model, params=task.params_json or {})
        generation_input = _generation_input(
            task=task, model=model, provider=provider, params=provider_params
        )
        request_payload = _safe_request_payload(generation_input)
        latency_ms = None

        try:
            transition_generation_task(
                task, to_status="submitted", from_status=["queued"], reason="worker_submit"
            )
            task.started_at = _now()
            db.commit()

            adapter = create_generation_adapter(provider=provider, model=model)
            started = monotonic()
            output = await adapter.create_generation_task(generation_input)
            latency_ms = int((monotonic() - started) * 1000)

            _apply_provider_output(task, output)
            self._write_request_log(
                db=db,
                task=task,
                request_payload=request_payload,
                response_payload=_safe_response_payload(output),
                status_code=200,
                latency_ms=latency_ms,
            )
        except ProviderError as exc:
            _mark_failed(task, exc.error_type, exc.message)
            self._write_request_log(
                db=db,
                task=task,
                request_payload=request_payload,
                response_payload=None,
                status_code=exc.details.get("providerStatusCode") if exc.details else None,
                latency_ms=latency_ms,
                error_type=exc.error_type,
                error_message=exc.message,
            )
        except AppError as exc:
            _mark_failed(task, exc.error_type, exc.message)
            self._write_request_log(
                db=db,
                task=task,
                request_payload=request_payload,
                response_payload=None,
                status_code=exc.status_code,
                latency_ms=latency_ms,
                error_type=exc.error_type,
                error_message=exc.message,
            )
        except Exception as exc:
            _mark_failed(task, "GENERATION_RUNTIME_ERROR", "Generation runtime failed.")
            self._write_request_log(
                db=db,
                task=task,
                request_payload=request_payload,
                response_payload=None,
                status_code=None,
                latency_ms=latency_ms,
                error_type="GENERATION_RUNTIME_ERROR",
                error_message=str(exc)[:500],
            )
        finally:
            db.commit()
            db.refresh(task)

        return task

    async def poll_provider_task(self, *, db: Session, task_id: str) -> GenerationTask | None:
        task = db.get(GenerationTask, task_id)
        if task is None or task.status in TERMINAL_STATUSES:
            return task
        if task.status not in POLLABLE_STATUSES:
            return task
        if task.poll_after and task.poll_after > _now():
            return task
        if _is_expired(task):
            _mark_terminal(task, "expired", progress=task.progress)
            db.commit()
            db.refresh(task)
            return task
        if not task.provider_task_id:
            _mark_failed(task, "PROVIDER_TASK_ID_MISSING", "Provider task id is missing.")
            db.commit()
            db.refresh(task)
            return task

        model = model_registry.get_model(task.model_id)
        provider = model_registry.get_provider(task.provider_id)
        provider_params = self._map_provider_params(model=model, params=task.params_json or {})
        generation_input = _generation_input(
            task=task, model=model, provider=provider, params=provider_params
        )
        request_payload = _safe_request_payload(generation_input) | {
            "providerTaskId": task.provider_task_id
        }
        latency_ms = None

        try:
            adapter = create_generation_adapter(provider=provider, model=model)
            started = monotonic()
            output = await adapter.get_generation_task(generation_input, task.provider_task_id)
            latency_ms = int((monotonic() - started) * 1000)
            _apply_provider_output(task, output)
            self._write_request_log(
                db=db,
                task=task,
                request_payload=request_payload,
                response_payload=_safe_response_payload(output),
                status_code=200,
                latency_ms=latency_ms,
            )
        except ProviderError as exc:
            _mark_failed(task, exc.error_type, exc.message)
            self._write_request_log(
                db=db,
                task=task,
                request_payload=request_payload,
                response_payload=None,
                status_code=exc.details.get("providerStatusCode") if exc.details else None,
                latency_ms=latency_ms,
                error_type=exc.error_type,
                error_message=exc.message,
            )
        except Exception as exc:
            _mark_failed(task, "GENERATION_POLL_ERROR", "Generation polling failed.")
            self._write_request_log(
                db=db,
                task=task,
                request_payload=request_payload,
                response_payload=None,
                status_code=None,
                latency_ms=latency_ms,
                error_type="GENERATION_POLL_ERROR",
                error_message=str(exc)[:500],
            )
        finally:
            db.commit()
            db.refresh(task)

        return task

    async def cancel_task(self, *, db: Session, task_id: str) -> tuple[GenerationTask, bool]:
        task = db.get(GenerationTask, task_id)
        if task is None:
            raise AppError("GENERATION_TASK_NOT_FOUND", f"Task not found: {task_id}", 404)
        if task.status in TERMINAL_STATUSES:
            return task, False

        provider_cancelled = False
        if task.provider_task_id:
            try:
                model = model_registry.get_model(task.model_id)
                provider = model_registry.get_provider(task.provider_id)
                provider_params = self._map_provider_params(
                    model=model, params=task.params_json or {}
                )
                generation_input = _generation_input(
                    task=task, model=model, provider=provider, params=provider_params
                )
                adapter = create_generation_adapter(provider=provider, model=model)
                await adapter.cancel_generation_task(generation_input, task.provider_task_id)
                provider_cancelled = True
            except Exception:
                provider_cancelled = False

        transition_generation_task(
            task,
            to_status="cancelled",
            from_status=["queued", "submitted", "processing"],
            reason="user_cancelled",
        )
        task.completed_at = _now()
        task.poll_after = None
        db.commit()
        db.refresh(task)
        return task, provider_cancelled

    async def rerun_task(
        self, *, db: Session, task_id: str, enqueue: bool = True
    ) -> GenerationTask:
        record = db.get(GenerationTask, task_id)
        if record is None:
            raise AppError("GENERATION_TASK_NOT_FOUND", f"Task not found: {task_id}", 404)
        return await self.create_task(
            db=db,
            task_type=record.task_type,
            model_id=record.model_id,
            input_json=record.input_json,
            params=record.params_json,
            idempotency_key=None,
            enqueue=enqueue,
        )

    def _validate_generation_model(self, *, model: dict, provider: dict, task_type: str) -> None:
        if not provider.get("enabled", False):
            raise AppError("PROVIDER_DISABLED", "Selected provider is disabled.", 400)
        if not model.get("enabled", False):
            raise AppError("MODEL_DISABLED", "Selected model is disabled.", 400)
        if task_type not in model.get("taskTypes", []):
            raise AppError(
                "MODEL_TASK_UNSUPPORTED", "Selected model does not support this task.", 400
            )
        if model.get("category") != "generation" or not model.get("async"):
            raise AppError(
                "GENERATION_MODEL_REQUIRED", "Selected model is not an async generation model.", 400
            )

    def _map_provider_params(self, *, model: dict, params: dict) -> dict:
        schema = model_registry.get_param_schema(model["paramsSchema"])
        mapped = {}
        for field in schema.get("fields", []):
            key = field["key"]
            if key not in params:
                continue
            provider_key = (field.get("providerMapping") or {}).get(model["provider"], key)
            value = params[key]
            if value in ("", None):
                continue
            mapped[provider_key] = value
        return mapped

    def _write_request_log(
        self,
        *,
        db: Session,
        task: GenerationTask,
        request_payload: dict,
        response_payload: dict | None,
        status_code: int | None,
        latency_ms: int | None,
        error_type: str | None = None,
        error_message: str | None = None,
    ) -> None:
        db.add(
            RequestLog(
                id=f"log_{uuid4().hex}",
                record_type="generation_task",
                record_id=task.id,
                provider_id=task.provider_id,
                model_id=task.model_id,
                request_json=request_payload,
                response_json=response_payload,
                status_code=status_code,
                latency_ms=latency_ms,
                error_type=error_type,
                error_message=error_message,
            )
        )


def transition_generation_task(
    task: GenerationTask,
    *,
    to_status: str,
    from_status: list[str] | set[str] | None = None,
    reason: str | None = None,
) -> None:
    if from_status is not None and task.status not in set(from_status):
        raise AppError(
            "GENERATION_STATUS_CONFLICT",
            f"Cannot transition generation task from {task.status} to {to_status}.",
            409,
        )
    if to_status not in ALLOWED_TRANSITIONS.get(task.status, set()):
        raise AppError(
            "GENERATION_STATUS_TRANSITION_INVALID",
            f"Invalid generation task transition: {task.status} -> {to_status}.",
            409,
        )
    task.status = to_status


def _apply_provider_output(task: GenerationTask, output: GenerationOutput) -> None:
    status = str(output.status)
    if status.startswith("TaskStatus."):
        status = output.status.value

    if output.provider_task_id:
        task.provider_task_id = output.provider_task_id
    if output.provider_status:
        task.provider_status = output.provider_status
    if output.progress is not None:
        task.progress = max(0, min(100, output.progress))

    if status == "submitted":
        if task.status != "submitted":
            transition_generation_task(
                task, to_status="submitted", from_status=["queued"], reason="provider_submitted"
            )
        task.poll_after = _now() + timedelta(seconds=_next_poll_delay_seconds(task, output))
        return

    if status == "processing":
        transition_generation_task(
            task,
            to_status="processing",
            from_status=["submitted", "processing"],
            reason="provider_processing",
        )
        task.poll_after = _now() + timedelta(seconds=_next_poll_delay_seconds(task, output))
        return

    if status == "completed":
        merged_output = dict(output.output or {})
        persisted = _persist_generation_artifacts(task=task, output=merged_output)
        merged_output.update(persisted)

        transition_generation_task(
            task,
            to_status="completed",
            from_status=["submitted", "processing"],
            reason="provider_completed",
        )
        task.progress = 100
        task.output_json = merged_output
        task.completed_at = _now()
        task.poll_after = None
        return

    if status == "failed":
        _mark_failed(
            task,
            output.error_type or "PROVIDER_GENERATION_FAILED",
            output.error_message or "Provider generation task failed.",
        )
        return

    if status in {"cancelled", "expired"}:
        _mark_terminal(task, status, progress=task.progress)
        return

    raise AppError("PROVIDER_STATUS_UNSUPPORTED", f"Unsupported provider status: {status}", 502)


def _persist_generation_artifacts(*, task: GenerationTask, output: dict) -> dict:
    """Best-effort download of provider-returned media into local storage.

    Updates ``output`` in-place by adding ``videoStorageKey`` / ``imageStorageKey``
    fields. Failures are stored in ``output["downloadErrors"]`` so the user can
    still inspect the original provider URL.
    """
    if not output:
        return {}

    additions: dict = {}
    download_errors: list[dict] = []

    for field, key_prefix, ext in (
        ("videoUrl", "videos", ".mp4"),
        ("imageUrl", "images", ".bin"),
    ):
        url = output.get(field)
        if not url or f"{field.rstrip('Url')}StorageKey" in output:
            continue
        result = _download_to_storage(
            url=url,
            task_id=task.id,
            field=field,
            key_prefix=key_prefix,
            default_extension=ext,
        )
        if result is None:
            continue
        storage_key, error = result
        if error is not None:
            download_errors.append({"field": field, "url": url, "error": error})
            continue
        additions[f"{field.rstrip('Url')}StorageKey"] = storage_key
        additions[f"{field.rstrip('Url')}StorageUrl"] = f"/api/files/_by_key/{storage_key}"

    if download_errors:
        additions["downloadErrors"] = download_errors
    return additions


def resolve_primary_artifact(task: GenerationTask) -> tuple[str | None, str | None]:
    """Return ``(storage_key, kind)`` for the single primary artifact, or
    ``(None, None)`` for multi-artifact or no-artifact tasks.

    The ``/tasks/{id}/result`` endpoint uses this to decide between a
    single-file redirect (for video-only or image-only tasks) and the JSON
    envelope (for first_last_frame_video or any task with multiple outputs).
    """
    output = task.output_json or {}
    keys: list[tuple[str, str]] = []
    for field in ("videoStorageKey", "imageStorageKey"):
        if output.get(field):
            keys.append((output[field], field.replace("StorageKey", "").lower()))
    if len(keys) == 1:
        return keys[0]
    return None, None


def _download_to_storage(
    *,
    url: str,
    task_id: str,
    field: str,
    key_prefix: str,
    default_extension: str,
) -> tuple[str, dict] | None:
    if not _is_safe_download_url(url):
        return None, {
            "type": "DOWNLOAD_URL_BLOCKED",
            "message": "Provider URL host is not in the ModelGate allowlist.",
        }
    try:
        with (
            httpx.Client(
                timeout=OUTPUT_DOWNLOAD_TIMEOUT_SECONDS,
                follow_redirects=False,
            ) as client,
            client.stream("GET", url) as response,
        ):
            response.raise_for_status()
            content_type = response.headers.get("content-type") or ""
            extension = _extension_for_content_type(content_type) or default_extension
            if response.headers.get("content-length"):
                try:
                    size = int(response.headers["content-length"])
                    if size > MAX_OUTPUT_DOWNLOAD_BYTES:
                        return None, {
                            "type": "OUTPUT_TOO_LARGE",
                            "message": f"Provider response too large: {size} bytes.",
                        }
                except ValueError:
                    pass
            buf = bytearray()
            for chunk in response.iter_bytes():
                buf.extend(chunk)
                if len(buf) > MAX_OUTPUT_DOWNLOAD_BYTES:
                    return None, {
                        "type": "OUTPUT_TOO_LARGE",
                        "message": f"Provider response exceeded {MAX_OUTPUT_DOWNLOAD_BYTES} bytes.",
                    }
        bytes_content = bytes(buf)
    except Exception as exc:
        return None, {
            "type": "DOWNLOAD_FAILED",
            "message": f"{type(exc).__name__}: {str(exc)[:200]}",
        }

    storage_key = build_dated_key(
        prefix=f"outputs/{key_prefix}",
        name=f"{task_id}_{field.rstrip('Url').lower()}{extension}",
    )
    stored = get_storage().put_bytes(
        bytes_content,
        key=storage_key,
        content_type=content_type or None,
    )
    return stored.key, None


def _is_safe_download_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"}:
        return False
    if not parsed.netloc:
        return False
    if is_volcengine_hosted_url(url):
        return True
    trusted_hosts = {
        "ark.cn-beijing.volces.com",
        "ark.cn-shanghai.volces.com",
        "files.volcengine.com",
    }
    return parsed.hostname and parsed.hostname.lower() in trusted_hosts


def _extension_for_content_type(content_type: str) -> str | None:
    mapping = {
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "application/octet-stream": ".bin",
    }
    primary = content_type.split(";", 1)[0].strip().lower()
    return mapping.get(primary)


def _mark_failed(task: GenerationTask, error_type: str, error_message: str) -> None:
    _mark_terminal(task, "failed", progress=task.progress)
    task.error_type = error_type
    task.error_message = error_message


def _mark_terminal(task: GenerationTask, status: str, *, progress: int) -> None:
    if task.status not in TERMINAL_STATUSES:
        transition_generation_task(
            task,
            to_status=status,
            from_status=["queued", "submitted", "processing"],
            reason=f"mark_{status}",
        )
    task.progress = progress
    task.completed_at = _now()
    task.poll_after = None


def _generation_input(
    *,
    task: GenerationTask,
    model: dict,
    provider: dict,
    params: dict,
) -> GenerationInput:
    return GenerationInput(
        provider_id=provider["id"],
        model_id=model["id"],
        provider_model_name=(model.get("adapterConfig") or {}).get("providerModelName")
        or model["officialModelName"],
        task_type=task.task_type,
        input=task.input_json or {},
        params=params,
        adapter_config=model.get("adapterConfig") or {},
        request_id=task.id,
    )


def _safe_request_payload(input_data: GenerationInput) -> dict:
    return {
        "providerId": input_data.provider_id,
        "modelId": input_data.model_id,
        "providerModelName": input_data.provider_model_name,
        "taskType": input_data.task_type,
        "params": input_data.params,
        "inputKeys": sorted(input_data.input.keys()),
    }


def _safe_response_payload(output: GenerationOutput) -> dict:
    return {
        "status": output.status.value if isinstance(output.status, TaskStatus) else output.status,
        "providerTaskId": output.provider_task_id,
        "providerStatus": output.provider_status,
        "progress": output.progress,
        "metadata": output.metadata,
    }


def _next_poll_delay_seconds(task: GenerationTask, output: GenerationOutput | None = None) -> int:
    runtime = {}
    if isinstance(task.output_json, dict):
        runtime = task.output_json.get("_runtime") or {}
    attempts = int(runtime.get("pollAttempts") or 0) + 1
    delay = int(
        (output.metadata or {}).get("pollAfterSeconds") or min(60, 5 * (2 ** (attempts - 1)))
    )
    current_output = task.output_json if isinstance(task.output_json, dict) else {}
    task.output_json = current_output | {
        "_runtime": {"pollAttempts": attempts, "nextPollDelaySeconds": delay}
    }
    return delay


def _expires_at(params: dict) -> datetime:
    raw_seconds = (
        params.get("execution_expires_after") or params.get("expires_after_seconds") or 24 * 60 * 60
    )
    try:
        seconds = int(raw_seconds)
    except (TypeError, ValueError):
        seconds = 24 * 60 * 60
    seconds = max(60, min(seconds, 7 * 24 * 60 * 60))
    return _now() + timedelta(seconds=seconds)


def _request_hash(payload: dict) -> str:
    import hashlib

    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _is_expired(task: GenerationTask) -> bool:
    return bool(task.expires_at and task.expires_at <= _now())


def _now() -> datetime:
    return datetime.now(UTC)


def _dispatch_submit(task_id: str) -> None:
    """Submit a generation task to the configured worker backend.

    In production, this enqueues a Celery job. In dev mode (or any
    environment where ``MODELGATE_DISABLE_CELERY=true``), it runs the
    submit handler in a background thread so the developer does not
    need a separate worker process. Polling is the caller's
    responsibility (UI refetches or a separate poller triggers it).

    Module-level (not a method) so tests can patch it via
    ``monkeypatch.setattr("app.services.generation_runtime._dispatch_submit", ...)``
    without going through the class.
    """
    from app.core.config import settings

    if settings.disable_celery:
        import threading

        thread = threading.Thread(
            target=_sync_submit_task,
            args=(task_id,),
            name=f"mg-submit-{task_id[:8]}",
            daemon=True,
        )
        thread.start()
        return

    from app.workers.generation_tasks import submit_generation_task

    submit_generation_task.delay(task_id)


def _sync_submit_task(task_id: str) -> None:
    """Inline replacement for the ``generation.submit`` Celery task.

    Used only when ``MODELGATE_DISABLE_CELERY=true``. Each call gets its
    own DB session, submits the task to the provider, and (if still
    pollable) schedules a synchronous poll loop in another daemon
    thread that re-runs the same handler with a delay.
    """
    import asyncio
    import threading
    import time

    from app.db.session import SessionLocal

    def _run_poll_loop(target_id: str) -> None:
        time.sleep(_poll_delay_seconds(target_id))
        for _ in range(60):  # cap at ~5 min of polling
            try:
                with SessionLocal() as db:
                    task = asyncio.run(
                        generation_runtime.poll_provider_task(db=db, task_id=target_id)
                    )
                if task is None or task.status in {"completed", "failed", "cancelled", "expired"}:
                    return
            except Exception:
                return
            time.sleep(_poll_delay_seconds(target_id))
        return

    try:
        with SessionLocal() as db:
            task = asyncio.run(generation_runtime.submit_provider_task(db=db, task_id=task_id))
        if task and task.status in {"submitted", "processing"}:
            threading.Thread(
                target=_run_poll_loop,
                args=(task_id,),
                name=f"mg-poll-{task_id[:8]}",
                daemon=True,
            ).start()
    except Exception:
        return


def _poll_delay_seconds(task_id: str) -> int:
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        from app.db.models import GenerationTask

        task = db.get(GenerationTask, task_id)
        if task is None or task.poll_after is None:
            return 5
        delta = (task.poll_after - _now()).total_seconds()
    return max(1, min(int(delta), 60))


generation_runtime = GenerationRuntime()
