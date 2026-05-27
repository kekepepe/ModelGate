from typing import Protocol

from pydantic import BaseModel


class ChatInput(BaseModel):
    provider_id: str
    model_id: str
    official_model_name: str
    task_type: str
    messages: list[dict]
    params: dict
    adapter_config: dict = {}
    request_id: str


class ChatOutput(BaseModel):
    type: str = "text"
    content: str
    metadata: dict = {}


class ProviderAdapter(Protocol):
    provider_id: str

    async def chat(self, input_data: ChatInput) -> ChatOutput:
        ...

