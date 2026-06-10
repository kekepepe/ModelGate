import socket
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db.models import GenerationTask, RequestLog  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.providers.base import GenerationOutput, TaskStatus  # noqa: E402
from app.workers.generation_tasks import poll_generation_task, submit_generation_task  # noqa: E402


def require_local_port(port: int) -> None:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return
    except OSError as exc:
        pytest.skip(f"localhost:{port} is not reachable: {exc}")


FAKE_GENERATION_MODEL = {
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


FAKE_PROVIDER = {
    "id": "mimo",
    "name": "Xiaomi MiMo",
    "baseUrl": "https://example.test",
    "authType": "bearer",
    "envKey": "MIMO_API_KEY",
    "adapter": "mimo",
    "enabled": True,
    "metadata": {},
}


def patch_generation_registry(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.generation_runtime.model_registry.get_model",
        lambda model_id: FAKE_GENERATION_MODEL,
    )
    monkeypatch.setattr(
        "app.services.generation_runtime.model_registry.get_provider",
        lambda provider_id: FAKE_PROVIDER,
    )


def test_generation_api_creates_idempotent_queued_task(monkeypatch) -> None:
    require_local_port(5432)
    require_local_port(6379)
    patch_generation_registry(monkeypatch)
    enqueued: list[str] = []
    monkeypatch.setattr(
        "app.workers.generation_tasks.submit_generation_task.delay",
        lambda task_id: enqueued.append(task_id),
    )

    payload = {
        "taskType": "text_to_video",
        "modelId": "mimo.mimo_v2_5",
        "input": {"prompt": "a calm ocean shot"},
        "params": {"max_completion_tokens": 128},
        "idempotencyKey": f"phase7_idem_{datetime.now(UTC).timestamp()}",
    }

    with TestClient(app) as client:
        first_response = client.post("/api/generation/tasks", json=payload)
        second_response = client.post("/api/generation/tasks", json=payload)

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first = first_response.json()["data"]
    second = second_response.json()["data"]
    assert first["id"] == second["id"]
    assert first["status"] == "queued"
    assert first["progress"] == 0
    assert enqueued == [first["id"]]

    with SessionLocal() as db:
        record = db.get(GenerationTask, first["id"])
        assert record.request_hash
        assert record.expires_at is not None


def test_disabled_seedance_generation_model_is_not_started() -> None:
    require_local_port(5432)
    require_local_port(6379)

    with TestClient(app) as client:
        response = client.post(
            "/api/generation/tasks",
            json={
                "taskType": "text_to_video",
                "modelId": "volcengine_seedance.doubao_seedance_2_0",
                "input": {"prompt": "reserved architecture only"},
                "params": {},
            },
        )

    assert response.status_code == 400
    assert response.json()["error"]["type"] in {"PROVIDER_DISABLED", "MODEL_DISABLED"}


class FakeGenerationAdapter:
    async def create_generation_task(self, input_data):
        return GenerationOutput(
            status=TaskStatus.PROCESSING,
            provider_task_id="provider_task_phase7",
            provider_status="running",
            progress=35,
            metadata={"pollAfterSeconds": 1},
        )

    async def get_generation_task(self, input_data, provider_task_id: str):
        return GenerationOutput(
            status=TaskStatus.COMPLETED,
            provider_task_id=provider_task_id,
            provider_status="succeeded",
            progress=100,
            output={"outputs": [{"type": "video", "url": "https://provider.example/video.mp4"}]},
        )

    async def cancel_generation_task(self, input_data, provider_task_id: str):
        return GenerationOutput(status=TaskStatus.CANCELLED, provider_task_id=provider_task_id)


def test_generation_worker_submit_poll_and_logs(monkeypatch) -> None:
    require_local_port(5432)
    require_local_port(6379)
    patch_generation_registry(monkeypatch)
    monkeypatch.setattr(
        "app.services.generation_runtime.create_generation_adapter",
        lambda **kwargs: FakeGenerationAdapter(),
    )
    scheduled_polls: list[dict] = []
    scheduled_downloads: list[str] = []
    monkeypatch.setattr(
        "app.workers.generation_tasks.poll_generation_task.apply_async",
        lambda args, countdown: scheduled_polls.append({"args": args, "countdown": countdown}),
    )
    monkeypatch.setattr(
        "app.workers.generation_tasks.download_generation_outputs.delay",
        lambda task_id: scheduled_downloads.append(task_id),
    )

    task_id = f"task_phase7_{datetime.now(UTC).timestamp()}"
    with SessionLocal() as db:
        db.add(
            GenerationTask(
                id=task_id,
                provider_id="mimo",
                model_id="mimo.mimo_v2_5",
                task_type="text_to_video",
                input_json={"prompt": "worker test"},
                params_json={"max_completion_tokens": 128},
                status="queued",
                progress=0,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        db.commit()

    submit_result = submit_generation_task(task_id)
    assert submit_result["status"] == "processing"
    assert scheduled_polls and scheduled_polls[0]["args"] == [task_id]

    with SessionLocal() as db:
        task = db.get(GenerationTask, task_id)
        task.poll_after = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()

    poll_result = poll_generation_task(task_id)
    assert poll_result["status"] == "completed"
    assert scheduled_downloads == [task_id]

    with SessionLocal() as db:
        task = db.get(GenerationTask, task_id)
        logs = (
            db.query(RequestLog)
            .filter(RequestLog.record_id == task_id, RequestLog.record_type == "generation_task")
            .all()
        )

    assert task.provider_task_id == "provider_task_phase7"
    assert task.status == "completed"
    assert task.progress == 100
    assert task.output_json["outputs"][0]["type"] == "video"
    assert len(logs) == 2


def _make_completed_task(*, output_json: dict, task_id: str) -> None:
    """Insert a completed GenerationTask with the given output_json, bypassing
    the worker so the tests don't need to wait for or mock a download path.
    """
    with SessionLocal() as db:
        db.add(
            GenerationTask(
                id=task_id,
                provider_id="mimo",
                model_id="mimo.mimo_v2_5",
                task_type="text_to_video",
                input_json={"prompt": "result test"},
                params_json={},
                output_json=output_json,
                status="completed",
                progress=100,
                completed_at=datetime.now(UTC),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        db.commit()


def test_result_redirects_to_storage_key_for_single_video() -> None:
    require_local_port(5432)
    require_local_port(6379)
    task_id = f"task_result_redir_{datetime.now(UTC).timestamp()}"
    storage_key = "outputs/videos/2026/06/03/fake.mp4"
    _make_completed_task(
        task_id=task_id,
        output_json={
            "videoStorageKey": storage_key,
            "videoStorageUrl": f"/api/files/_by_key/{storage_key}",
        },
    )

    with TestClient(app) as client:
        # follow_redirects=False so we can inspect the 302 itself.
        response = client.get(f"/api/generation/tasks/{task_id}/result", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == f"/api/files/_by_key/{storage_key}"
    assert "Content-Disposition" in response.headers
    assert task_id in response.headers["Content-Disposition"]


def test_result_returns_descriptor_for_multi_artifact() -> None:
    require_local_port(5432)
    require_local_port(6379)
    task_id = f"task_result_multi_{datetime.now(UTC).timestamp()}"
    video_key = "outputs/videos/2026/06/03/first.mp4"
    image_key = "outputs/images/2026/06/03/last.jpg"
    _make_completed_task(
        task_id=task_id,
        output_json={
            "videoStorageKey": video_key,
            "videoStorageUrl": f"/api/files/_by_key/{video_key}",
            "imageStorageKey": image_key,
            "imageStorageUrl": f"/api/files/_by_key/{image_key}",
        },
    )

    with TestClient(app) as client:
        response = client.get(f"/api/generation/tasks/{task_id}/result")

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["taskId"] == task_id
    assert body["data"]["status"] == "completed"
    assert body["data"]["output"]["videoStorageUrl"] == f"/api/files/_by_key/{video_key}"
    assert body["data"]["output"]["imageStorageUrl"] == f"/api/files/_by_key/{image_key}"


def test_result_not_completed_returns_409() -> None:
    require_local_port(5432)
    require_local_port(6379)
    task_id = f"task_result_409_{datetime.now(UTC).timestamp()}"
    with SessionLocal() as db:
        db.add(
            GenerationTask(
                id=task_id,
                provider_id="mimo",
                model_id="mimo.mimo_v2_5",
                task_type="text_to_video",
                input_json={"prompt": "still running"},
                params_json={},
                output_json={},
                status="processing",
                progress=42,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        db.commit()

    with TestClient(app) as client:
        response = client.get(f"/api/generation/tasks/{task_id}/result")

    assert response.status_code == 409
    body = response.json()
    assert body["data"]["status"] == "processing"
    assert body["data"]["progress"] == 42
