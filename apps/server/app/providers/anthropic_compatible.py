from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.providers.base import ChatInput, ChatOutput
from app.providers.errors import map_httpx_error


class AnthropicCompatibleAdapter:
    def __init__(self, provider_id: str, base_url: str, api_key: str):
        self.provider_id = provider_id
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    async def chat(self, input_data: ChatInput) -> ChatOutput:
        if input_data.cancel_event is not None and input_data.cancel_event.is_set():
            raise asyncio.CancelledError()

        system, messages = _split_system_messages(input_data)
        payload: dict[str, Any] = {
            "model": input_data.provider_model_name,
            "messages": messages,
            "max_tokens": _max_tokens(input_data.params),
            "stream": False,
        }
        if system:
            payload["system"] = system
        payload.update(_normalize_params(input_data.params))

        async with httpx.AsyncClient(timeout=input_data.timeout_seconds) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/v1/messages",
                    headers=self._headers(),
                    json=payload,
                )
                response.raise_for_status()
            except asyncio.CancelledError:
                raise
            except httpx.HTTPError as exc:
                raise map_httpx_error(exc) from exc

        data = response.json()
        text_parts = []
        thinking_parts = []
        for block in data.get("content") or []:
            if block.get("type") == "text":
                text_parts.append(block.get("text") or "")
            elif block.get("type") in {"thinking", "reasoning"}:
                thinking_parts.append(block.get("thinking") or block.get("text") or "")
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        metadata = {
            "providerResponseId": data.get("id"),
            "stopReason": data.get("stop_reason"),
        }
        if thinking_parts:
            metadata["reasoningContent"] = "\n".join(thinking_parts)
        return ChatOutput(
            content="\n".join(part for part in text_parts if part),
            metadata=metadata,
            usage=_normalize_usage(usage),
        )

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "x-api-key": self.api_key,
            "api-key": self.api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }


def _split_system_messages(input_data: ChatInput) -> tuple[str | None, list[dict[str, Any]]]:
    system_parts: list[str] = []
    messages: list[dict[str, Any]] = []
    for message in input_data.messages:
        if message.role == "system":
            if isinstance(message.content, str):
                system_parts.append(message.content)
            else:
                system_parts.append(message.as_text())
            continue
        role = "assistant" if message.role == "assistant" else "user"
        if isinstance(message.content, list):
            anthropic_blocks: list[dict[str, Any]] = []
            for block in message.content:
                if not isinstance(block, dict):
                    continue
                block_type = block.get("type")
                if block_type == "text":
                    text = block.get("text")
                    if isinstance(text, str):
                        anthropic_blocks.append({"type": "text", "text": text})
                elif block_type == "image_url":
                    url = (block.get("image_url") or {}).get("url")
                    source = _to_anthropic_image_source(url)
                    if source is not None:
                        anthropic_blocks.append({"type": "image", "source": source})
            if not anthropic_blocks:
                anthropic_blocks.append({"type": "text", "text": message.as_text()})
            messages.append({"role": role, "content": anthropic_blocks})
        else:
            messages.append({"role": role, "content": [{"type": "text", "text": message.content}]})
    return ("\n\n".join(system_parts) if system_parts else None), messages


def _to_anthropic_image_source(url: str | None) -> dict[str, Any] | None:
    if not isinstance(url, str) or not url:
        return None
    if url.startswith("data:") and ";base64," in url:
        header, _, payload = url.partition(",")
        media_type = header[len("data:") : header.index(";")] or "image/png"
        return {
            "type": "base64",
            "media_type": media_type,
            "data": payload,
        }
    if url.startswith("http://") or url.startswith("https://"):
        return {"type": "url", "url": url}
    return None


def _normalize_params(params: dict[str, Any]) -> dict[str, Any]:
    allowed = {"temperature", "top_p", "stop_sequences"}
    normalized = {
        key: value for key, value in params.items() if key in allowed and value not in ("", None)
    }
    normalized["stream"] = False
    return normalized


def _max_tokens(params: dict[str, Any]) -> int:
    value = params.get("max_tokens") or params.get("max_completion_tokens") or 1024
    try:
        return int(value)
    except (TypeError, ValueError):
        return 1024


def _normalize_usage(usage: dict[str, Any]) -> dict[str, int]:
    input_tokens = _as_int(usage.get("input_tokens"))
    output_tokens = _as_int(usage.get("output_tokens"))
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
    }


def _as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0
