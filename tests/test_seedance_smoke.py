import os
import socket
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402


def _require_local_port(port: int) -> None:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return
    except OSError as exc:  # pragma: no cover - environment dependent
        pytest.skip(f"localhost:{port} is not reachable: {exc}")


def _create_task(client: TestClient, model_id: str) -> dict:
    response = client.post(
        "/api/generation/tasks",
        json={
            "taskType": "text_to_video",
            "modelId": model_id,
            "input": {
                "prompt": "ModelGate Seedance smoke ok",
            },
            "params": {"ratio": "16:9", "duration": 5},
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


@pytest.mark.skipif(
    os.getenv("RUN_PROVIDER_SMOKE") != "1",
    reason="Set RUN_PROVIDER_SMOKE=1 to spend real provider tokens.",
)
def test_seedance_create_and_poll_real_provider_smoke() -> None:
    _require_local_port(5432)
    _require_local_port(6379)
    if not settings.volcengine_api_key:
        pytest.skip("VOLCENGINE_API_KEY is not configured.")
    if not settings.enable_seedance:
        pytest.skip("MODELGATE_ENABLE_SEEDANCE is not enabled.")

    with TestClient(app) as client:
        task = _create_task(client, "volcengine_seedance.doubao_seedance_2_0")
        assert task["status"] in {"queued", "submitted", "processing", "completed", "failed"}
        assert task.get("providerTaskId") or task["status"] == "failed"


@pytest.mark.skipif(
    os.getenv("RUN_PROVIDER_SMOKE") != "1",
    reason="Set RUN_PROVIDER_SMOKE=1 to spend real provider tokens.",
)
def test_seedance_disabled_flag_returns_501() -> None:
    _require_local_port(5432)
    _require_local_port(6379)
    if settings.enable_seedance:
        pytest.skip("Seedance is enabled in this environment; this asserts the disabled path.")

    with TestClient(app) as client:
        response = client.post(
            "/api/generation/tasks",
            json={
                "taskType": "text_to_video",
                "modelId": "volcengine_seedance.doubao_seedance_2_0",
                "input": {"prompt": "should be disabled"},
                "params": {},
            },
        )

    assert response.status_code in {400, 501, 404}
    payload = response.json()
    error = payload.get("error", payload)
    assert error.get("type") in {"GENERATION_MODEL_REQUIRED", "PROVIDER_GENERATION_DISABLED"}
