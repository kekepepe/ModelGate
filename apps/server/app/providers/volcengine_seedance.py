"""Volcengine Seedance video generation adapter.

Implements the ``volcengine_seedance`` protocol — async video generation
via the doubao-seedance-2-0 model on the Volcengine Ark contents API.
The adapter only owns HTTP transport; result-binary persistence is the
caller's responsibility (see ``app.services.storage``).
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from app.providers.base import GenerationInput, GenerationOutput, TaskStatus
from app.providers.errors import ProviderError, map_httpx_error

_STATUS_MAP = {
    "queued": TaskStatus.QUEUED,
    "running": TaskStatus.PROCESSING,
    "in_progress": TaskStatus.PROCESSING,
    "succeeded": TaskStatus.COMPLETED,
    "success": TaskStatus.COMPLETED,
    "completed": TaskStatus.COMPLETED,
    "failed": TaskStatus.FAILED,
    "error": TaskStatus.FAILED,
    "cancelled": TaskStatus.CANCELLED,
    "canceled": TaskStatus.CANCELLED,
    "expired": TaskStatus.EXPIRED,
}


class VolcengineSeedanceAdapter:
    provider_id: str = "volcengine"

    def __init__(
        self,
        *,
        provider_id: str,
        base_url: str,
        api_key: str,
        timeout_seconds: float = 120.0,
    ):
        self.provider_id = provider_id
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _endpoint(self, *parts: str) -> str:
        return "/".join([self.base_url.rstrip("/"), *(p.strip("/") for p in parts if p)])

    @staticmethod
    def _build_content(input_data: GenerationInput) -> list[dict[str, Any]]:
        prompt = (
            (input_data.input or {}).get("prompt") or (input_data.input or {}).get("text") or ""
        )
        content: list[dict[str, Any]] = [{"type": "text", "text": str(prompt)}]
        first_frame = (input_data.input or {}).get("firstFrameUrl") or (input_data.input or {}).get(
            "first_frame_url"
        )
        last_frame = (input_data.input or {}).get("lastFrameUrl") or (input_data.input or {}).get(
            "last_frame_url"
        )
        if isinstance(first_frame, str) and first_frame:
            content.append({"type": "image_url", "image_url": {"url": first_frame}})
        if isinstance(last_frame, str) and last_frame:
            content.append({"type": "image_url", "image_url": {"url": last_frame}})
        return content

    @staticmethod
    def _build_parameters(input_data: GenerationInput) -> dict[str, Any]:
        params: dict[str, Any] = {}
        raw = input_data.params or {}
        for key in (
            "ratio",
            "resolution",
            "duration",
            "fps",
            "watermark",
            "seed",
            "camerafixed",
            "motion_strength",
        ):
            if key in raw and raw[key] not in (None, ""):
                params[key] = raw[key]
        return params

    @staticmethod
    def _normalize_status(raw: str | None) -> TaskStatus:
        if not raw:
            raise ProviderError(
                "PROVIDER_STATUS_MISSING",
                "Volcengine did not return a task status.",
                status_code=502,
            )
        normalized = raw.strip().lower()
        if normalized not in _STATUS_MAP:
            raise ProviderError(
                "PROVIDER_STATUS_UNSUPPORTED",
                f"Volcengine returned unsupported status: {raw!r}",
                status_code=502,
            )
        return _STATUS_MAP[normalized]

    def _parse_output(
        self,
        *,
        raw: dict[str, Any],
        input_data: GenerationInput,
    ) -> GenerationOutput:
        status = self._normalize_status(raw.get("status"))
        provider_task_id = raw.get("id") or raw.get("task_id")
        content = raw.get("content") or {}
        video_url = (
            (content.get("video_url") if isinstance(content, dict) else None)
            or raw.get("video_url")
            or raw.get("output_video_url")
        )
        output: dict[str, Any] = {}
        if video_url:
            output["videoUrl"] = video_url
            output["videoSource"] = "provider"
        first_frame = (
            content.get("first_frame_url") if isinstance(content, dict) else None
        ) or raw.get("first_frame_url")
        last_frame = (
            content.get("last_frame_url") if isinstance(content, dict) else None
        ) or raw.get("last_frame_url")
        if first_frame:
            output["firstFrameUrl"] = first_frame
        if last_frame:
            output["lastFrameUrl"] = last_frame
        usage = raw.get("usage") if isinstance(raw.get("usage"), dict) else {}
        metadata: dict[str, Any] = {
            "model": raw.get("model") or input_data.provider_model_name,
            "createdAt": raw.get("created_at"),
            "updatedAt": raw.get("updated_at"),
            "pollAfterSeconds": _coerce_int(raw.get("poll_after_seconds")) or 5,
        }
        if usage:
            metadata["usage"] = usage
        if raw.get("error"):
            metadata["providerError"] = raw["error"]

        return GenerationOutput(
            status=status,
            provider_task_id=provider_task_id,
            provider_status=raw.get("status"),
            progress=_coerce_int(raw.get("progress"))
            or (100 if status == TaskStatus.COMPLETED else None),
            output=output,
            metadata=metadata,
            error_type=(
                raw.get("error", {}).get("code") if isinstance(raw.get("error"), dict) else None
            ),
            error_message=(
                raw.get("error", {}).get("message") if isinstance(raw.get("error"), dict) else None
            ),
        )

    async def create_generation_task(self, input_data: GenerationInput) -> GenerationOutput:
        body = {
            "model": input_data.provider_model_name,
            "content": self._build_content(input_data),
        }
        parameters = self._build_parameters(input_data)
        if parameters:
            body["parameters"] = parameters

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            try:
                response = await client.post(
                    self._endpoint("contents/generations/tasks"),
                    headers=self._headers(),
                    json=body,
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise map_httpx_error(exc) from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderError(
                "PROVIDER_INVALID_RESPONSE",
                "Volcengine returned a non-JSON response.",
                status_code=502,
            ) from exc

        return self._parse_output(raw=payload, input_data=input_data)

    async def get_generation_task(
        self,
        input_data: GenerationInput,
        provider_task_id: str,
    ) -> GenerationOutput:
        if not provider_task_id:
            raise ProviderError(
                "PROVIDER_TASK_ID_MISSING",
                "Cannot poll Volcengine task without a provider task id.",
                status_code=400,
            )
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            try:
                response = await client.get(
                    self._endpoint("contents/generations/tasks", provider_task_id),
                    headers=self._headers(),
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise map_httpx_error(exc) from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderError(
                "PROVIDER_INVALID_RESPONSE",
                "Volcengine returned a non-JSON response.",
                status_code=502,
            ) from exc

        return self._parse_output(raw=payload, input_data=input_data)

    async def cancel_generation_task(
        self,
        input_data: GenerationInput,
        provider_task_id: str,
    ) -> GenerationOutput:
        if not provider_task_id:
            raise ProviderError(
                "PROVIDER_TASK_ID_MISSING",
                "Cannot cancel Volcengine task without a provider task id.",
                status_code=400,
            )
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            try:
                response = await client.delete(
                    self._endpoint("contents/generations/tasks", provider_task_id),
                    headers=self._headers(),
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise map_httpx_error(exc) from exc

        try:
            payload = response.json()
        except ValueError:
            payload = {"id": provider_task_id, "status": "cancelled"}

        return self._parse_output(raw=payload, input_data=input_data)


def _coerce_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return None


def is_volcengine_hosted_url(url: str) -> bool:
    """Best-effort check that a URL points to a Volcengine-controlled host.

    Used by the runtime to decide whether a result URL is safe to follow
    without SSRF concerns.
    """
    if not url:
        return False
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return (
        host.endswith(".volces.com")
        or host.endswith(".volcengine.com")
        or host.endswith(".bytedance.com")
    )
