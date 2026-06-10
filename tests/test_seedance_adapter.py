"""Unit tests for the Seedance adapter and generation artifact persistence.

These tests are deterministic: they do not hit the real provider.
"""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.core.errors import AppError  # noqa: E402
from app.providers.base import GenerationInput, TaskStatus  # noqa: E402
from app.providers.volcengine_seedance import (  # noqa: E402
    VolcengineSeedanceAdapter,
    is_volcengine_hosted_url,
)
from app.services.generation_runtime import (  # noqa: E402
    _is_safe_download_url,
    _persist_generation_artifacts,
)


def _adapter() -> VolcengineSeedanceAdapter:
    return VolcengineSeedanceAdapter(
        provider_id="volcengine_seedance",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        api_key="test-key",
    )


def _input() -> GenerationInput:
    return GenerationInput(
        provider_id="volcengine_seedance",
        model_id="volcengine_seedance.doubao_seedance_2_0",
        provider_model_name="doubao-seedance-2-0",
        task_type="text_to_video",
        input={"prompt": "A cat walking on the beach"},
        params={"ratio": "16:9", "duration": 5},
        request_id="req_test",
    )


def test_parse_succeeded_response() -> None:
    adapter = _adapter()
    output = adapter._parse_output(
        raw={
            "id": "cgt-abc",
            "status": "succeeded",
            "content": {"video_url": "https://ark.cn-beijing.volces.com/api/v3/files/video.mp4"},
        },
        input_data=_input(),
    )
    assert output.status == TaskStatus.COMPLETED
    assert output.provider_task_id == "cgt-abc"
    assert output.output["videoUrl"] == ("https://ark.cn-beijing.volces.com/api/v3/files/video.mp4")
    assert output.progress == 100


def test_parse_running_response_with_progress() -> None:
    adapter = _adapter()
    output = adapter._parse_output(
        raw={"id": "cgt-xyz", "status": "running", "progress": "45"},
        input_data=_input(),
    )
    assert output.status == TaskStatus.PROCESSING
    assert output.progress == 45


def test_parse_unknown_status_raises() -> None:
    adapter = _adapter()
    with pytest.raises(AppError) as exc:
        adapter._parse_output(raw={"id": "cgt", "status": "wat"}, input_data=_input())
    assert exc.value.error_type == "PROVIDER_STATUS_UNSUPPORTED"


def test_is_volcengine_hosted_url() -> None:
    assert is_volcengine_hosted_url("https://ark.cn-beijing.volces.com/api/v3/files/x.mp4")
    assert is_volcengine_hosted_url("https://x.volcengine.com/x")
    assert is_volcengine_hosted_url("https://x.bytedance.com/x")
    assert not is_volcengine_hosted_url("https://example.com/x")
    assert not is_volcengine_hosted_url("not-a-url")


def test_safe_download_url_blocks_untrusted_hosts() -> None:
    assert _is_safe_download_url("https://ark.cn-beijing.volces.com/api/v3/files/x.mp4")
    assert not _is_safe_download_url("https://example.com/x")
    assert not _is_safe_download_url("file:///etc/passwd")
    assert not _is_safe_download_url("http://169.254.169.254/latest/meta-data/")


def test_persist_generation_artifacts_downloads_and_records_key(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    saved_keys: list[tuple[str, bytes]] = []

    def fake_put_bytes(content: bytes, *, key: str, content_type=None):  # type: ignore[no-untyped-def]
        saved_keys.append((key, content))
        return SimpleNamespace(key=key, size_bytes=len(content), content_type=content_type)

    fake_storage = SimpleNamespace(put_bytes=fake_put_bytes)
    monkeypatch.setattr("app.services.generation_runtime.get_storage", lambda: fake_storage)

    fake_response = MagicMock()
    fake_response.__enter__ = MagicMock(return_value=fake_response)
    fake_response.__exit__ = MagicMock(return_value=False)
    fake_response.headers = {"content-type": "video/mp4"}
    fake_response.raise_for_status = MagicMock()
    fake_response.iter_bytes = MagicMock(return_value=iter([b"hello", b"video-bytes"]))

    with patch("app.services.generation_runtime.httpx.Client") as client_cls:
        client = MagicMock()
        client.stream.return_value = fake_response
        client.__enter__ = MagicMock(return_value=client)
        client.__exit__ = MagicMock(return_value=False)
        client_cls.return_value = client

        task = SimpleNamespace(id="task_test123")
        output = {"videoUrl": "https://ark.cn-beijing.volces.com/api/v3/files/x.mp4"}
        additions = _persist_generation_artifacts(task=task, output=output)

    assert "videoStorageKey" in additions
    assert "videoStorageUrl" in additions
    assert saved_keys, "expected storage.put_bytes to be called"
    saved_key, saved_bytes = saved_keys[0]
    assert saved_key.startswith("outputs/videos/") and saved_key.endswith(".mp4")
    assert saved_bytes == b"hellovideo-bytes"
    assert output.get("videoStorageKey") is None  # additions is what gets merged into output_json


def test_persist_generation_artifacts_records_download_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.generation_runtime.get_storage",
        lambda: SimpleNamespace(
            put_bytes=lambda *_a, **_kw: SimpleNamespace(key="x", size_bytes=0)
        ),
    )
    with patch("app.services.generation_runtime.httpx.Client") as client_cls:
        client = MagicMock()
        client.stream.side_effect = RuntimeError("network down")
        client.__enter__ = MagicMock(return_value=client)
        client.__exit__ = MagicMock(return_value=False)
        client_cls.return_value = client

        task = SimpleNamespace(id="task_err")
        output = {"videoUrl": "https://ark.cn-beijing.volces.com/api/v3/files/x.mp4"}
        additions = _persist_generation_artifacts(task=task, output=output)

    assert "videoStorageKey" not in additions
    errors = additions.get("downloadErrors", [])
    assert errors and errors[0]["field"] == "videoUrl"


def test_persist_generation_artifacts_blocks_untrusted_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.generation_runtime.get_storage",
        lambda: SimpleNamespace(
            put_bytes=lambda *_a, **_kw: SimpleNamespace(key="x", size_bytes=0)
        ),
    )
    task = SimpleNamespace(id="task_blocked")
    output = {"videoUrl": "https://malicious.example.com/x.mp4"}
    additions = _persist_generation_artifacts(task=task, output=output)
    assert additions.get("downloadErrors")
    assert "videoStorageKey" not in additions


@pytest.mark.asyncio
async def test_create_generation_task_invokes_correct_endpoint() -> None:
    adapter = _adapter()
    fake_response = MagicMock()
    fake_response.status_code = 200
    fake_response.raise_for_status = MagicMock()
    fake_response.json = MagicMock(
        return_value={
            "id": "cgt-123",
            "status": "queued",
        }
    )
    fake_client = MagicMock()
    fake_client.__aenter__ = AsyncMock(return_value=fake_client)
    fake_client.__aexit__ = AsyncMock(return_value=False)
    fake_client.post = AsyncMock(return_value=fake_response)

    with patch("app.providers.volcengine_seedance.httpx.AsyncClient") as client_cls:
        client_cls.return_value = fake_client
        output = await adapter.create_generation_task(_input())

    assert output.status == TaskStatus.QUEUED
    assert output.provider_task_id == "cgt-123"
    body = fake_client.post.await_args.kwargs["json"]
    assert body["model"] == "doubao-seedance-2-0"
    assert body["content"] == [{"type": "text", "text": "A cat walking on the beach"}]
    assert body["parameters"] == {"ratio": "16:9", "duration": 5}
    assert fake_client.post.await_args.args[0].endswith("/contents/generations/tasks")
