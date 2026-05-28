from __future__ import annotations

from app.core.config import settings
from app.core.errors import AppError
from app.providers.anthropic_compatible import AnthropicCompatibleAdapter
from app.providers.openai_compatible import OpenAICompatibleAdapter


def create_chat_adapter(*, provider: dict, model: dict):
    adapter_config = model.get("adapterConfig") or {}
    provider_metadata = provider.get("metadata") or {}
    protocol = adapter_config.get("protocol")
    api_key = settings.get_secret(provider.get("envKey") or "")
    if not api_key:
        raise AppError(
            "PROVIDER_AUTH_MISSING",
            f"Missing API key for provider: {provider.get('id')}",
            status_code=400,
        )

    if protocol == "openai_compatible":
        base_url = adapter_config.get("baseUrl") or provider_metadata.get("openaiBaseUrl") or provider["baseUrl"]
        _validate_base_url(provider=provider, base_url=base_url)
        return OpenAICompatibleAdapter(provider_id=provider["id"], base_url=base_url, api_key=api_key)

    if protocol == "anthropic_compatible":
        base_url = (
            adapter_config.get("baseUrl")
            or provider_metadata.get("anthropicBaseUrl")
            or provider["baseUrl"]
        )
        _validate_base_url(provider=provider, base_url=base_url)
        return AnthropicCompatibleAdapter(provider_id=provider["id"], base_url=base_url, api_key=api_key)

    raise AppError(
        "PROVIDER_PROTOCOL_UNSUPPORTED",
        f"Unsupported provider protocol: {protocol}",
        status_code=400,
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
