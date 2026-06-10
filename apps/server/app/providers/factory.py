from __future__ import annotations

from app.core.config import settings
from app.core.errors import AppError
from app.providers.anthropic_compatible import AnthropicCompatibleAdapter
from app.providers.base import GenerationInput
from app.providers.openai_compatible import OpenAICompatibleAdapter
from app.providers.volcengine_seedance import VolcengineSeedanceAdapter
from app.services.provider_secrets import get_provider_secret


def create_chat_adapter(*, provider: dict, model: dict):
    adapter_config = model.get("adapterConfig") or {}
    provider_metadata = provider.get("metadata") or {}
    protocol = adapter_config.get("protocol")
    api_key = get_provider_secret(provider["id"], provider.get("envKey"))
    if not api_key:
        raise AppError(
            "PROVIDER_AUTH_MISSING",
            f"Missing API key for provider: {provider.get('id')}",
            status_code=400,
        )

    if protocol == "openai_compatible":
        base_url = (
            adapter_config.get("baseUrl")
            or provider_metadata.get("openaiBaseUrl")
            or provider["baseUrl"]
        )
        _validate_base_url(provider=provider, base_url=base_url)
        return OpenAICompatibleAdapter(
            provider_id=provider["id"], base_url=base_url, api_key=api_key
        )

    if protocol == "anthropic_compatible":
        base_url = (
            adapter_config.get("baseUrl")
            or provider_metadata.get("anthropicBaseUrl")
            or provider["baseUrl"]
        )
        _validate_base_url(provider=provider, base_url=base_url)
        return AnthropicCompatibleAdapter(
            provider_id=provider["id"], base_url=base_url, api_key=api_key
        )

    raise AppError(
        "PROVIDER_PROTOCOL_UNSUPPORTED",
        f"Unsupported provider protocol: {protocol}",
        status_code=400,
    )


def create_generation_adapter(*, provider: dict, model: dict):
    adapter_config = model.get("adapterConfig") or {}
    protocol = adapter_config.get("protocol")
    if protocol == "volcengine_seedance":
        if not settings.enable_seedance:
            return UnsupportedGenerationAdapter(
                provider_id=provider["id"],
                reason="Seedance generation is disabled by MODELGATE_ENABLE_SEEDANCE.",
            )
        api_key = get_provider_secret(provider["id"], provider.get("envKey"))
        if not api_key:
            raise AppError(
                "PROVIDER_AUTH_MISSING",
                f"Missing API key for provider: {provider.get('id')}",
                status_code=400,
            )
        base_url = adapter_config.get("baseUrl") or provider["baseUrl"]
        _validate_base_url(provider=provider, base_url=base_url)
        return VolcengineSeedanceAdapter(
            provider_id=provider["id"],
            base_url=base_url,
            api_key=api_key,
        )

    if protocol == "async_generation":
        return UnsupportedGenerationAdapter(
            provider_id=provider["id"],
            reason="Generation protocol is reserved but not implemented in this version.",
        )

    raise AppError(
        "PROVIDER_GENERATION_UNSUPPORTED",
        f"Generation adapter is not implemented for provider: {provider.get('id')}",
        status_code=501,
    )


class UnsupportedGenerationAdapter:
    def __init__(self, *, provider_id: str, reason: str | None = None):
        self.provider_id = provider_id
        self.reason = reason or "Generation provider is reserved but not enabled in this version."

    async def create_generation_task(self, input_data: GenerationInput):
        raise AppError(
            "PROVIDER_GENERATION_DISABLED",
            self.reason,
            status_code=501,
        )

    async def get_generation_task(self, input_data: GenerationInput, provider_task_id: str):
        raise AppError(
            "PROVIDER_GENERATION_DISABLED",
            self.reason,
            status_code=501,
        )

    async def cancel_generation_task(self, input_data: GenerationInput, provider_task_id: str):
        raise AppError(
            "PROVIDER_GENERATION_DISABLED",
            self.reason,
            status_code=501,
        )


def _validate_base_url(*, provider: dict, base_url: str) -> None:
    forbidden = (provider.get("metadata") or {}).get("forbiddenBaseUrls") or []
    normalized = base_url.rstrip("/")
    if normalized in {url.rstrip("/") for url in forbidden}:
        raise AppError(
            "PROVIDER_BASE_URL_FORBIDDEN",
            "Provider base URL is forbidden by ModelGate safety policy.",
            status_code=500,
        )
