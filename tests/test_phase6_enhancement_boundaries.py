import socket
import sys
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.main import app  # noqa: E402
from app.providers.base import ChatOutput  # noqa: E402
from app.providers.openai_compatible import (  # noqa: E402
    _normalize_params as normalize_openai_params,
)
from app.providers.openai_compatible import (  # noqa: E402
    _parse_openai_stream_line,
)


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


def test_openai_adapter_stream_param_and_sse_delta_parsing() -> None:
    payload = normalize_openai_params({"temperature": 0.2, "stream": False}, stream=True)
    event = _parse_openai_stream_line(
        'data: {"id":"resp_1","choices":[{"delta":{"content":"hello"},"finish_reason":null}]}'
    )

    assert payload["stream"] is True
    assert event is not None
    assert event.type == "delta"
    assert event.delta == "hello"


def test_cancel_completed_run_keeps_terminal_status(monkeypatch) -> None:
    require_local_port(5432)
    require_local_port(6379)
    monkeypatch.setattr(
        "app.services.chat_runtime.create_chat_adapter", lambda **kwargs: CapturingAdapter()
    )

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


def test_image_file_with_non_vision_model_is_rejected(monkeypatch) -> None:
    """Boundary updated in the WIP commit that introduced multimodal support.

    The previous contract (image is treated as metadata text for any model) is
    gone. The new contract: a chat model that lacks ``vision_understanding``
    cannot accept image file inputs and the run must be rejected with a 400
    error code. The vision-capable happy path is covered separately in
    ``test_multimodal_phase6.py``.
    """
    require_local_port(5432)
    require_local_port(6379)
    monkeypatch.setattr(
        "app.services.chat_runtime.create_chat_adapter", lambda **kwargs: CapturingAdapter()
    )

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

    assert run_response.status_code == 400
    body = run_response.json()
    assert body["error"]["type"] == "MODEL_VISION_UNSUPPORTED"
