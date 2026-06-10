import socket
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.main import app  # noqa: E402
from app.providers.base import ChatOutput  # noqa: E402


class FakeAdapter:
    async def chat(self, input_data):
        return ChatOutput(
            content="fake provider response",
            usage={"input_tokens": 1, "output_tokens": 2, "total_tokens": 3},
        )


def require_local_port(port: int) -> None:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return
    except OSError as exc:
        pytest.skip(f"localhost:{port} is not reachable: {exc}")


def test_phase3_core_api_smoke(monkeypatch) -> None:
    require_local_port(5432)
    require_local_port(6379)
    monkeypatch.setattr(
        "app.services.chat_runtime.create_chat_adapter", lambda **kwargs: FakeAdapter()
    )

    with TestClient(app) as client:
        providers_response = client.get("/api/providers")
        assert providers_response.status_code == 200
        assert providers_response.json()["data"]

        models_response = client.get("/api/models")
        assert models_response.status_code == 200
        models = models_response.json()["data"]
        assert models

        model = models[0]
        schema_response = client.get(f"/api/param-schemas/{model['paramsSchema']}")
        assert schema_response.status_code == 200

        recommend_response = client.post(
            "/api/models/recommend",
            json={"taskType": "chat", "inputTypes": ["text"], "requiredOutput": "text"},
        )
        assert recommend_response.status_code == 200
        assert recommend_response.json()["data"]["availableModels"]

        run_response = client.post(
            "/api/chat/runs",
            json={
                "taskType": "chat",
                "modelId": model["id"],
                "prompt": "hello",
                "params": {},
            },
        )
        assert run_response.status_code == 200
        run = run_response.json()["data"]
        assert run["status"] == "completed"

        history_response = client.get("/api/history/runs")
        assert history_response.status_code == 200
        assert any(item["id"] == run["id"] for item in history_response.json()["data"])
