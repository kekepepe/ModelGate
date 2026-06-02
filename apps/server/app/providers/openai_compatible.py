from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.providers.base import ChatInput, ChatOutput, ChatStreamEvent
from app.providers.errors import map_httpx_error


class OpenAICompatibleAdapter:
    def __init__(self, *, provider_id: str, base_url: str, api_key: str):
        self.provider_id = provider_id
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    async def chat(self, input_data: ChatInput) -> ChatOutput:
        payload = {
            "model": input_data.provider_model_name,
            "messages": [message.model_dump() for message in input_data.messages],
            "stream": False,
        }
        payload.update(_normalize_params(input_data.params))

        async with httpx.AsyncClient(timeout=input_data.timeout_seconds) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise map_httpx_error(exc) from exc

        data = response.json()
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        content = message.get("content") or ""
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        metadata = {
            "providerResponseId": data.get("id"),
            "finishReason": choice.get("finish_reason"),
        }
        if "reasoning_content" in message:
            metadata["reasoningContent"] = message["reasoning_content"]
        return ChatOutput(content=content, metadata=metadata, usage=_normalize_usage(usage))

    async def stream_chat(self, input_data: ChatInput) -> AsyncIterator[ChatStreamEvent]:
        payload = {
            "model": input_data.provider_model_name,
            "messages": [message.model_dump() for message in input_data.messages],
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        payload.update(_normalize_params(input_data.params, stream=True))

        content_parts: list[str] = []
        metadata: dict[str, Any] = {}
        usage: dict[str, int] = {}
        async with httpx.AsyncClient(timeout=input_data.timeout_seconds) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        event = _parse_openai_stream_line(line)
                        if event is None:
                            continue
                        if event.type == "delta":
                            content_parts.append(event.delta)
                            yield event
                        elif event.type == "metadata":
                            metadata.update(event.metadata)
                            if event.usage:
                                usage = event.usage
                        elif event.type == "done":
                            break
            except httpx.HTTPError as exc:
                raise map_httpx_error(exc) from exc

        yield ChatStreamEvent(
            type="done",
            content="".join(content_parts),
            metadata=metadata,
            usage=usage,
        )

    def _headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if self.provider_id == "mimo":
            headers["api-key"] = self.api_key
        return headers


def _normalize_params(params: dict[str, Any], *, stream: bool = False) -> dict[str, Any]:
    normalized = dict(params)
    normalized["stream"] = stream
    return {key: value for key, value in normalized.items() if value not in ("", None)}


def _parse_openai_stream_line(line: str) -> ChatStreamEvent | None:
    if not line.startswith("data:"):
        return None
    payload = line.removeprefix("data:").strip()
    if not payload:
        return None
    if payload == "[DONE]":
        return ChatStreamEvent(type="done")
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return None

    choice = (data.get("choices") or [{}])[0]
    delta = choice.get("delta") or {}
    content = delta.get("content") or ""
    metadata = {
        key: value
        for key, value in {
            "providerResponseId": data.get("id"),
            "finishReason": choice.get("finish_reason"),
        }.items()
        if value
    }
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    if content:
        return ChatStreamEvent(type="delta", delta=content, metadata=metadata)
    if metadata or usage:
        return ChatStreamEvent(type="metadata", metadata=metadata, usage=_normalize_usage(usage))
    return None


def _normalize_usage(usage: dict[str, Any]) -> dict[str, int]:
    return {
        "input_tokens": _as_int(usage.get("prompt_tokens") or usage.get("input_tokens")),
        "output_tokens": _as_int(usage.get("completion_tokens") or usage.get("output_tokens")),
        "total_tokens": _as_int(usage.get("total_tokens")),
    }


def _as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0
