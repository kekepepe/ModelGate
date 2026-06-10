import asyncio
import socket
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
PROJECT_ROOT = SERVER_ROOT.parents[1]
sys.path.insert(0, str(SERVER_ROOT))

from app.core.errors import AppError  # noqa: E402
from app.db.models import GenerationTask  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.providers.anthropic_compatible import AnthropicCompatibleAdapter  # noqa: E402
from app.providers.base import ChatInput, ChatMessage, ChatOutput  # noqa: E402
from app.providers.openai_compatible import OpenAICompatibleAdapter  # noqa: E402
from app.services.generation_runtime import transition_generation_task  # noqa: E402
from app.services.model_registry import ModelRegistry  # noqa: E402


def require_local_port(port: int) -> None:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return
    except OSError as exc:
        pytest.skip(f"localhost:{port} is not reachable: {exc}")


class FakeChatAdapter:
    async def chat(self, input_data):
        return ChatOutput(
            content="phase9 chat ok",
            metadata={"providerResponseId": "phase9_fake"},
            usage={"input_tokens": 2, "output_tokens": 3, "total_tokens": 5},
        )


def test_capability_router_and_param_schema_contracts() -> None:
    registry = ModelRegistry(PROJECT_ROOT / "configs")
    registry.validate()

    recommendation = registry.recommend(
        task_type="document_analysis",
        input_types=["text", "file"],
        required_output="text",
    )
    assert recommendation["availableModels"]
    assert all(
        "file_understanding" in model["capabilities"] for model in recommendation["availableModels"]
    )

    video_schema = registry.get_param_schema("video_generation_schema")
    fields = {field["key"]: field for field in video_schema["fields"]}
    assert fields["ratio"]["type"] == "select"
    assert "16:9" in fields["ratio"]["options"]
    assert (
        fields["execution_expires_after"]["providerMapping"]["volcengine_seedance"]
        == "execution_expires_after"
    )


def test_provider_adapters_construct_requests_and_parse_responses(monkeypatch) -> None:
    captured: list[dict] = []

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, headers, json):
            captured.append({"url": url, "headers": headers, "json": json})
            if url.endswith("/chat/completions"):
                return httpx.Response(
                    200,
                    json={
                        "id": "openai_response",
                        "choices": [{"message": {"content": "openai ok"}, "finish_reason": "stop"}],
                        "usage": {"prompt_tokens": 4, "completion_tokens": 5, "total_tokens": 9},
                    },
                    request=httpx.Request("POST", url),
                )
            return httpx.Response(
                200,
                json={
                    "id": "anthropic_response",
                    "content": [{"type": "text", "text": "anthropic ok"}],
                    "usage": {"input_tokens": 6, "output_tokens": 7},
                    "stop_reason": "end_turn",
                },
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr("app.providers.openai_compatible.httpx.AsyncClient", FakeAsyncClient)
    monkeypatch.setattr("app.providers.anthropic_compatible.httpx.AsyncClient", FakeAsyncClient)

    input_data = ChatInput(
        provider_id="mimo",
        model_id="mimo.mimo_v2_5",
        provider_model_name="provider-model",
        task_type="chat",
        messages=[
            ChatMessage(role="system", content="system"),
            ChatMessage(role="user", content="hello"),
        ],
        params={"temperature": 0, "max_completion_tokens": 64, "stream": True},
        request_id="run_phase9_adapter",
    )

    openai_output = asyncio.run(
        OpenAICompatibleAdapter(
            provider_id="mimo", base_url="https://provider.test/v1", api_key="secret"
        ).chat(input_data)
    )
    anthropic_output = asyncio.run(
        AnthropicCompatibleAdapter(
            provider_id="minimax", base_url="https://provider.test/anthropic", api_key="secret"
        ).chat(input_data)
    )

    assert openai_output.content == "openai ok"
    assert openai_output.usage["total_tokens"] == 9
    assert captured[0]["json"]["stream"] is False
    assert captured[0]["headers"]["api-key"] == "secret"
    assert anthropic_output.content == "anthropic ok"
    assert anthropic_output.usage["total_tokens"] == 13
    assert captured[1]["json"]["system"] == "system"
    assert captured[1]["json"]["max_tokens"] == 64
    assert captured[1]["json"]["stream"] is False


def test_generation_state_machine_rejects_terminal_regression() -> None:
    task = GenerationTask(
        id=f"task_phase9_state_{uuid4().hex}",
        provider_id="mimo",
        model_id="mimo.mimo_v2_5",
        task_type="text_to_video",
        input_json={},
        params_json={},
        status="completed",
        progress=100,
    )

    with pytest.raises(AppError) as exc_info:
        transition_generation_task(task, to_status="processing", from_status=["completed"])

    assert exc_info.value.error_type == "GENERATION_STATUS_TRANSITION_INVALID"


def test_api_level_e2e_chat_file_recommend_history_logs_and_cancel(monkeypatch) -> None:
    require_local_port(5432)
    require_local_port(6379)
    monkeypatch.setattr(
        "app.services.chat_runtime.create_chat_adapter", lambda **kwargs: FakeChatAdapter()
    )

    with TestClient(app) as client:
        request_id = f"req_phase9_{uuid4().hex}"
        error_response = client.get(
            "/api/history/missing_record", headers={"X-Request-Id": request_id}
        )
        assert error_response.status_code == 404
        assert error_response.json()["error"]["requestId"] == request_id

        upload_response = client.post(
            "/api/files/upload",
            files={"file": ("phase9.txt", b"phase9 file context", "text/plain")},
        )
        assert upload_response.status_code == 200
        file_record = upload_response.json()["data"]

        recommend_response = client.post(
            "/api/models/recommend",
            json={
                "taskType": "document_analysis",
                "inputTypes": ["text"],
                "fileIds": [file_record["id"]],
                "requiredOutput": "text",
            },
        )
        assert recommend_response.status_code == 200
        assert recommend_response.json()["data"]["availableModels"]

        run_response = client.post(
            "/api/chat/runs",
            json={
                "taskType": "document_analysis",
                "modelId": "mimo.mimo_v2_5",
                "prompt": "summarize",
                "fileIds": [file_record["id"]],
                "params": {"max_completion_tokens": 64},
            },
        )
        assert run_response.status_code == 200
        run = run_response.json()["data"]
        assert run["status"] == "completed"
        assert run["output"]["text"] == "phase9 chat ok"

        history_response = client.get(f"/api/history/{run['id']}")
        logs_response = client.get("/api/logs/requests")
        usage_response = client.get("/api/usage/logs")

        assert history_response.status_code == 200
        assert history_response.json()["data"]["recordType"] == "run"
        assert any(item["recordId"] == run["id"] for item in logs_response.json()["data"])
        assert any(item["recordId"] == run["id"] for item in usage_response.json()["data"])

        with SessionLocal() as db:
            generation_task = GenerationTask(
                id=f"task_phase9_cancel_{uuid4().hex}",
                provider_id="mimo",
                model_id="mimo.mimo_v2_5",
                task_type="text_to_video",
                input_json={"prompt": "cancel"},
                params_json={},
                status="queued",
                progress=0,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
            db.add(generation_task)
            db.commit()
            task_id = generation_task.id

        cancel_response = client.post(f"/api/generation/tasks/{task_id}/cancel")
        assert cancel_response.status_code == 200
        assert cancel_response.json()["data"]["status"] == "cancelled"
