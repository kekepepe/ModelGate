"""Unit tests for chat multimodal (image) support."""

import base64
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.core.errors import AppError  # noqa: E402
from app.providers.anthropic_compatible import (  # noqa: E402
    _split_system_messages,
    _to_anthropic_image_source,
)
from app.providers.base import ChatInput, ChatMessage  # noqa: E402
from app.services.chat_runtime import (  # noqa: E402
    ChatRuntime,
    _build_image_data_url,
)


def _image_file(*, preview_key: str | None = "previews/2026/06/x.webp") -> SimpleNamespace:
    metadata = {"storageKey": preview_key or "uploads/2026/06/x.png"}
    return SimpleNamespace(
        id="file_demo",
        original_name="cat.png",
        detected_type="image",
        mime_type="image/png",
        direct_usable=True,
        status="parsed",
        stored_path=metadata["storageKey"] if not preview_key else "uploads/2026/06/x.png",
        preview_path=preview_key,
        metadata_json=metadata,
    )


def test_chat_message_as_text_handles_both_shapes() -> None:
    text_only = ChatMessage(role="user", content="hi")
    assert text_only.as_text() == "hi"
    assert not text_only.has_multimodal_content()

    blocks = ChatMessage(
        role="user",
        content=[
            {"type": "text", "text": "describe"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAA"}},
        ],
    )
    assert blocks.as_text() == "describe\n[image: data:image/png;base64,AAA]"
    assert blocks.has_multimodal_content()


def test_build_image_data_url_reads_preview_first(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    file_record = _image_file(preview_key="previews/2026/06/x.webp")

    preview_bytes = b"webp-bytes"
    upload_bytes = b"original-bytes"
    seen_keys: list[str] = []

    def fake_absolute_path(key: str) -> Path:
        seen_keys.append(key)
        target = tmp_path / key.replace("/", "_")
        if "preview" in key:
            target.write_bytes(preview_bytes)
        else:
            target.write_bytes(upload_bytes)
        return target

    storage = SimpleNamespace(
        exists=lambda key: True,
        absolute_path=fake_absolute_path,
    )
    monkeypatch.setattr("app.services.storage.get_storage", lambda: storage)

    data_url = _build_image_data_url(file_record)

    assert data_url is not None
    assert data_url.startswith("data:image/png;base64,")
    encoded = data_url.split(",", 1)[1]
    assert base64.b64decode(encoded) == preview_bytes
    assert seen_keys[0] == "previews/2026/06/x.webp"


def test_build_messages_rejects_image_on_non_vision_model() -> None:
    runtime = ChatRuntime()
    model = {
        "id": "no_vision",
        "capabilities": ["text", "code"],
        "inputTypes": ["text", "code"],
    }
    with pytest.raises(AppError) as exc:
        runtime._build_messages(
            model=model,
            task_type="chat",
            prompt="what is in the image?",
            files=[_image_file()],
        )
    assert exc.value.error_type == "MODEL_VISION_UNSUPPORTED"


def test_build_messages_emits_image_block_for_vision_model() -> None:
    runtime = ChatRuntime()
    model = {
        "id": "vision_model",
        "capabilities": ["text", "vision_understanding"],
        "inputTypes": ["text", "image"],
    }

    fake_image = b"\x89PNG_FAKE"
    storage = SimpleNamespace(
        exists=lambda key: True,
        absolute_path=lambda key: _mem_path(key, fake_image),
    )
    with patch("app.services.storage.get_storage", return_value=storage):
        messages = runtime._build_messages(
            model=model,
            task_type="chat",
            prompt="describe",
            files=[_image_file()],
        )

    user_message = next(message for message in messages if message.role == "user")
    assert isinstance(user_message.content, list)
    image_blocks = [b for b in user_message.content if b.get("type") == "image_url"]
    text_blocks = [b for b in user_message.content if b.get("type") == "text"]
    assert image_blocks and text_blocks
    assert image_blocks[0]["image_url"]["url"].startswith("data:image/png;base64,")


def _mem_path(key: str, content: bytes) -> Path:
    from io import BytesIO

    class _FakePath:
        def __init__(self, buf: BytesIO):
            self._buf = buf

        def read_bytes(self) -> bytes:
            self._buf.seek(0)
            return self._buf.read()

    return _FakePath(BytesIO(content))  # type: ignore[return-value]


def test_openai_message_dump_preserves_multimodal_blocks() -> None:
    message = ChatMessage(
        role="user",
        content=[
            {"type": "text", "text": "describe"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAA"}},
        ],
    )
    dumped = message.model_dump()
    assert dumped["content"] == [
        {"type": "text", "text": "describe"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAA"}},
    ]


def test_anthropic_split_translates_image_url_block() -> None:
    input_data = ChatInput(
        provider_id="anthropic_test",
        model_id="claude-x",
        provider_model_name="claude-x",
        task_type="chat",
        messages=[
            ChatMessage(role="system", content="be helpful"),
            ChatMessage(
                role="user",
                content=[
                    {"type": "text", "text": "what is in this image?"},
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/png;base64,QUJD"},
                    },
                ],
            ),
        ],
        request_id="req_x",
    )
    system, messages = _split_system_messages(input_data)
    assert system == "be helpful"
    user_blocks = messages[0]["content"]
    assert {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/png", "data": "QUJD"},
    } in user_blocks


def test_anthropic_to_image_source_handles_url() -> None:
    assert _to_anthropic_image_source("https://example.com/x.png") == {
        "type": "url",
        "url": "https://example.com/x.png",
    }
    assert _to_anthropic_image_source(None) is None
    assert _to_anthropic_image_source("not-a-url") is None


@pytest.mark.asyncio
async def test_openai_adapter_serializes_multimodal_payload() -> None:
    from app.providers.openai_compatible import OpenAICompatibleAdapter

    adapter = OpenAICompatibleAdapter(
        provider_id="openai_test",
        base_url="https://example.com/v1",
        api_key="key",
    )
    fake_response = MagicMock()
    fake_response.raise_for_status = MagicMock()
    fake_response.json = MagicMock(
        return_value={
            "id": "resp-1",
            "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
        }
    )
    fake_client = MagicMock()
    fake_client.__aenter__ = AsyncMock(return_value=fake_client)
    fake_client.__aexit__ = AsyncMock(return_value=False)
    fake_client.post = AsyncMock(return_value=fake_response)

    with patch("app.providers.openai_compatible.httpx.AsyncClient") as client_cls:
        client_cls.return_value = fake_client
        await adapter.chat(
            ChatInput(
                provider_id="openai_test",
                model_id="model-x",
                provider_model_name="model-x",
                task_type="chat",
                messages=[
                    ChatMessage(
                        role="user",
                        content=[
                            {"type": "text", "text": "describe"},
                            {
                                "type": "image_url",
                                "image_url": {"url": "data:image/png;base64,QUJD"},
                            },
                        ],
                    )
                ],
                request_id="req-1",
            )
        )

    payload = fake_client.post.await_args.kwargs["json"]
    assert payload["messages"][0]["content"] == [
        {"type": "text", "text": "describe"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,QUJD"}},
    ]
