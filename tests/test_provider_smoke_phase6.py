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


def require_local_port(port: int) -> None:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return
    except OSError as exc:
        pytest.skip(f"localhost:{port} is not reachable: {exc}")


@pytest.mark.skipif(
    os.getenv("RUN_PROVIDER_SMOKE") != "1",
    reason="Set RUN_PROVIDER_SMOKE=1 to spend real provider tokens.",
)
def test_mimo_v2_5_pro_real_provider_smoke() -> None:
    require_local_port(5432)
    require_local_port(6379)
    if not settings.mimo_api_key:
        pytest.skip("MIMO_API_KEY is not configured.")

    with TestClient(app) as client:
        response = client.post(
            "/api/chat/runs",
            json={
                "taskType": "chat",
                "modelId": "mimo.mimo_v2_5_pro",
                "prompt": "Reply with exactly: ModelGate smoke ok",
                "params": {
                    "temperature": 0,
                    "max_completion_tokens": 32,
                    "stream": False,
                },
            },
        )

    assert response.status_code == 200
    run = response.json()["data"]
    assert run["status"] == "completed"
    assert isinstance(run["output"]["text"], str)
    assert run["output"]["text"].strip()


@pytest.mark.skipif(
    os.getenv("RUN_PROVIDER_SMOKE") != "1",
    reason="Set RUN_PROVIDER_SMOKE=1 to spend real provider tokens.",
)
def test_minimax_m2_7_real_provider_smoke() -> None:
    require_local_port(5432)
    require_local_port(6379)
    if not settings.minimax_api_key:
        pytest.skip("MINIMAX_API_KEY is not configured.")

    with TestClient(app) as client:
        response = client.post(
            "/api/chat/runs",
            json={
                "taskType": "chat",
                "modelId": "minimax.m2_7",
                "prompt": "Reply with exactly: ModelGate smoke ok",
                "params": {
                    "temperature": 0,
                    "max_completion_tokens": 256,
                    "stream": False,
                },
            },
        )

    assert response.status_code == 200
    run = response.json()["data"]
    assert run["status"] == "completed"
    assert isinstance(run["output"]["text"], str)
    assert run["output"]["text"].strip()
