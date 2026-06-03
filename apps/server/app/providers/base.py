from collections.abc import AsyncIterator
from enum import StrEnum
from typing import Any, Protocol

from pydantic import BaseModel, Field


class TaskStatus(StrEnum):
    QUEUED = "queued"
    SUBMITTED = "submitted"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class ChatMessage(BaseModel):
    role: str
    content: str | list[dict[str, Any]]

    def as_text(self) -> str:
        if isinstance(self.content, str):
            return self.content
        parts: list[str] = []
        for block in self.content:
            if not isinstance(block, dict):
                continue
            block_type = block.get("type")
            if block_type == "text":
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
            elif block_type == "image_url":
                url = (block.get("image_url") or {}).get("url")
                if isinstance(url, str):
                    parts.append(f"[image: {url[:120]}]")
        return "\n".join(parts)

    def has_multimodal_content(self) -> bool:
        return isinstance(self.content, list) and any(
            isinstance(block, dict) and block.get("type") == "image_url" for block in self.content
        )


class ChatInput(BaseModel):
    provider_id: str
    model_id: str
    provider_model_name: str
    task_type: str
    messages: list[ChatMessage]
    params: dict[str, Any] = Field(default_factory=dict)
    adapter_config: dict[str, Any] = Field(default_factory=dict)
    request_id: str
    timeout_seconds: float = 120
    cancel_event: Any = None  # asyncio.Event | None — typed as Any so pydantic keeps it out of the schema


class ChatOutput(BaseModel):
    type: str = "text"
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    usage: dict[str, int] = Field(default_factory=dict)


class ChatStreamEvent(BaseModel):
    type: str
    delta: str = ""
    content: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    usage: dict[str, int] = Field(default_factory=dict)


class GenerationInput(BaseModel):
    provider_id: str
    model_id: str
    provider_model_name: str
    task_type: str
    input: dict[str, Any] = Field(default_factory=dict)
    params: dict[str, Any] = Field(default_factory=dict)
    adapter_config: dict[str, Any] = Field(default_factory=dict)
    request_id: str
    timeout_seconds: float = 120


class GenerationOutput(BaseModel):
    status: TaskStatus
    provider_task_id: str | None = None
    provider_status: str | None = None
    progress: int | None = None
    output: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    error_type: str | None = None
    error_message: str | None = None


class ProviderAdapter(Protocol):
    provider_id: str

    async def chat(self, input_data: ChatInput) -> ChatOutput:
        ...

    def stream_chat(self, input_data: ChatInput) -> AsyncIterator[ChatStreamEvent]:
        ...


class GenerationAdapter(Protocol):
    provider_id: str

    async def create_generation_task(self, input_data: GenerationInput) -> GenerationOutput:
        ...

    async def get_generation_task(self, input_data: GenerationInput, provider_task_id: str) -> GenerationOutput:
        ...

    async def cancel_generation_task(self, input_data: GenerationInput, provider_task_id: str) -> GenerationOutput:
        ...
