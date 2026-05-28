from io import BytesIO
from pathlib import Path
import socket
import sys

import pytest
from fastapi.testclient import TestClient
from PIL import Image

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.main import app  # noqa: E402
from app.providers.base import ChatOutput  # noqa: E402
from app.providers.openai_compatible import _normalize_params as normalize_openai_params  # noqa: E402
from app.services.chat_runtime import FILE_CONTEXT_BEGIN  # noqa: E402


def require_local_port(port: int) -> None:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return
    except OSError as exc:
        pytest.skip(f"localhost:{port} is not reachable: {exc}")


class CapturingAdapter:
    last_input = None

    async def chat(self, input_data):
        CapturingAdapter.last_input = input_data
        return ChatOutput(content="enhancement boundary ok")


def test_stream_param_is_forced_to_non_stream_in_openai_adapter() -> None:
    payload = normalize_openai_params({"temperature": 0.2, "stream": True})

    assert payload["temperature"] == 0.2
    assert payload["stream"] is False


def test_cancel_completed_run_keeps_terminal_status(monkeypatch) -> None:
    require_local_port(5432)
    require_local_port(6379)
    monkeypatch.setattr("app.services.chat_runtime.create_chat_adapter", lambda **kwargs: CapturingAdapter())

    with TestClient(app) as client:
        run_response = client.post(
            "/api/chat/runs",
            json={
                "taskType": "chat",
                "modelId": "mimo.mimo_v2_5",
                "prompt": "hello",
                "params": {"stream": True},
            },
        )
        assert run_response.status_code == 200
        run = run_response.json()["data"]

        cancel_response = client.post(f"/api/chat/runs/{run['id']}/cancel")

    assert cancel_response.status_code == 200
    assert cancel_response.json()["data"]["status"] == "completed"


def test_image_file_current_boundary_is_metadata_context_not_multimodal(monkeypatch) -> None:
    require_local_port(5432)
    require_local_port(6379)
    monkeypatch.setattr("app.services.chat_runtime.create_chat_adapter", lambda **kwargs: CapturingAdapter())

    image_buffer = BytesIO()
    Image.new("RGB", (8, 8), color=(255, 0, 0)).save(image_buffer, format="PNG")

    with TestClient(app) as client:
        upload_response = client.post(
            "/api/files/upload",
            files={"file": ("red.png", image_buffer.getvalue(), "image/png")},
        )
        assert upload_response.status_code == 200
        file_id = upload_response.json()["data"]["id"]

        run_response = client.post(
            "/api/chat/runs",
            json={
                "taskType": "document_analysis",
                "modelId": "mimo.mimo_v2_5",
                "prompt": "describe the file metadata",
                "fileIds": [file_id],
                "params": {},
            },
        )

    assert run_response.status_code == 200
    user_message = CapturingAdapter.last_input.messages[1].content
    assert FILE_CONTEXT_BEGIN in user_message
    assert "DETECTED_TYPE: image" in user_message
    assert "data:image/png;base64" not in user_message
