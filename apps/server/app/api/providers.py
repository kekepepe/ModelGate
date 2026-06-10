import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.session import get_db
from app.providers.base import ChatInput, ChatMessage
from app.providers.factory import create_chat_adapter
from app.services.model_registry import model_registry
from app.services.provider_secrets import (
    delete_local_provider_secret,
    get_provider_secret_source,
    set_local_provider_secret,
)

router = APIRouter()


class ProviderKeyInput(BaseModel):
    apiKey: str = Field(min_length=8, max_length=8192)


def serialize_provider(provider: dict, db: Session | None = None) -> dict:
    secret_source = get_provider_secret_source(provider["id"], provider.get("envKey"), db=db)
    return {
        "id": provider["id"],
        "name": provider["name"],
        "authType": provider["authType"],
        "envKey": provider.get("envKey"),
        "adapter": provider["adapter"],
        "enabled": provider["enabled"],
        "configured": bool(secret_source),
        "keySource": secret_source,
        "metadata": {
            key: value
            for key, value in (provider.get("metadata") or {}).items()
            if key in {"protocols", "reservedForFutureVersion"}
        },
    }


@router.get("")
async def list_providers(db: Session = Depends(get_db)):
    return {"data": [serialize_provider(provider, db=db) for provider in model_registry.providers]}


@router.put("/{provider_id}/key")
async def update_provider_key(
    provider_id: str, input_data: ProviderKeyInput, db: Session = Depends(get_db)
):
    provider = model_registry.get_provider(provider_id)
    if provider.get("authType") != "bearer":
        raise AppError(
            "PROVIDER_KEY_UNSUPPORTED", "This provider does not support bearer API keys.", 400
        )
    secret = input_data.apiKey.strip()
    if len(secret) < 8:
        raise AppError("PROVIDER_KEY_INVALID", "Provider API key is too short.", 422)
    set_local_provider_secret(provider_id, secret, db)
    return {"data": serialize_provider(provider, db=db)}


@router.delete("/{provider_id}/key")
async def clear_provider_key(provider_id: str, db: Session = Depends(get_db)):
    provider = model_registry.get_provider(provider_id)
    delete_local_provider_secret(provider_id, db)
    return {"data": serialize_provider(provider, db=db)}


@router.post("/{provider_id}/test")
async def test_provider_connection(provider_id: str, db: Session = Depends(get_db)):
    """Probe provider with a minimal chat request.

    Picks the first enabled chat-runtime model registered for the provider
    and issues a 1-token completion. Categorizes the outcome into a stable
    result vocabulary the UI renders directly.
    """
    provider = model_registry.get_provider(provider_id)

    chat_model = _pick_probe_model(provider_id)
    if not chat_model:
        # Check if this is a generation-only provider (e.g. Volcengine Seedance)
        gen_result = await _try_generation_probe(provider_id, provider, db)
        if gen_result is not None:
            return {"data": gen_result}
        return {
            "data": {
                "providerId": provider_id,
                "status": "no_chat_model",
                "message": "No enabled chat model for this provider.",
            }
        }

    try:
        adapter = create_chat_adapter(provider=provider, model=chat_model)
    except AppError as exc:
        # Missing key, forbidden base URL, unsupported protocol, etc.
        status = "missing_key" if exc.error_type == "PROVIDER_AUTH_MISSING" else "config_error"
        return {
            "data": {
                "providerId": provider_id,
                "status": status,
                "errorType": exc.error_type,
                "message": exc.message,
            }
        }

    provider_model_name = (chat_model.get("adapterConfig") or {}).get(
        "providerModelName"
    ) or chat_model.get("officialModelName")
    chat_input = ChatInput(
        provider_id=provider_id,
        model_id=chat_model["id"],
        provider_model_name=provider_model_name,
        task_type="chat",
        messages=[ChatMessage(role="user", content="ping")],
        params={"max_tokens": 1},
        adapter_config=chat_model.get("adapterConfig") or {},
        request_id="probe",
        timeout_seconds=15,
    )

    try:
        await adapter.chat(chat_input)
    except AppError as exc:
        return {
            "data": {
                "providerId": provider_id,
                "status": _classify_probe_error(exc.error_type),
                "errorType": exc.error_type,
                "message": exc.message,
                "modelId": chat_model["id"],
            }
        }
    except Exception as exc:
        return {
            "data": {
                "providerId": provider_id,
                "status": "error",
                "errorType": type(exc).__name__,
                "message": str(exc)[:500],
                "modelId": chat_model["id"],
            }
        }

    return {
        "data": {
            "providerId": provider_id,
            "status": "ok",
            "message": "Connected",
            "modelId": chat_model["id"],
        }
    }


async def _try_generation_probe(
    provider_id: str,
    provider: dict,
    db: Session,
) -> dict | None:
    """Attempt a GET-based probe for generation-only providers (e.g. Volcengine Seedance).

    Returns a result dict if the provider is generation-only, or None if it has
    chat-capable models (in which case the normal chat probe path applies).
    """
    # Only attempt for providers that have generation models but no chat models
    has_generation = any(
        m.get("provider") == provider_id
        and m.get("enabled")
        and m.get("runtime") not in {"chat", "chat_completion"}
        for m in model_registry.models
    )
    if not has_generation:
        return None

    # Check adapter type — only volcengine_seedance supports GET probe
    adapter_type = provider.get("adapter")
    if adapter_type != "volcengine_seedance":
        return None

    # Get API key
    secret_source = get_provider_secret_source(provider_id, provider.get("envKey"), db=db)
    if not secret_source:
        return {
            "providerId": provider_id,
            "status": "missing_key",
            "errorType": "PROVIDER_AUTH_MISSING",
            "message": "No API key configured for this provider.",
        }

    from app.services.provider_secrets import get_provider_secret

    api_key = get_provider_secret(provider_id, provider.get("envKey"), db=db)
    if not api_key:
        return {
            "providerId": provider_id,
            "status": "missing_key",
            "errorType": "PROVIDER_AUTH_MISSING",
            "message": "No API key configured for this provider.",
        }

    base_url = provider.get("baseUrl", "")
    if not base_url:
        return {
            "providerId": provider_id,
            "status": "config_error",
            "errorType": "PROVIDER_BAD_REQUEST",
            "message": "Provider base URL is not configured.",
        }

    # GET probe: use a fake task id — 404 means auth passed and endpoint is reachable
    probe_url = f"{base_url.rstrip('/')}/contents/generations/tasks/__modelgate_probe__"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                probe_url,
                headers={"Authorization": f"Bearer {api_key}"},
            )
    except httpx.TimeoutException:
        return {
            "providerId": provider_id,
            "status": "timeout",
            "errorType": "PROVIDER_TIMEOUT",
            "message": "Provider did not respond in time.",
        }
    except httpx.ConnectError:
        return {
            "providerId": provider_id,
            "status": "unreachable",
            "errorType": "PROVIDER_CONNECT_ERROR",
            "message": "Cannot reach provider endpoint.",
        }
    except Exception as exc:
        return {
            "providerId": provider_id,
            "status": "error",
            "errorType": type(exc).__name__,
            "message": str(exc)[:500],
        }

    status_code = response.status_code
    if status_code == 401:
        return {
            "providerId": provider_id,
            "status": "auth_failed",
            "errorType": "PROVIDER_AUTH_FAILED",
            "message": "API key rejected by provider.",
        }
    if status_code == 403:
        return {
            "providerId": provider_id,
            "status": "forbidden",
            "errorType": "PROVIDER_FORBIDDEN",
            "message": "Provider denied access.",
        }
    if status_code == 404:
        # 404 = expected: auth passed, endpoint reachable, task doesn't exist
        return {
            "providerId": provider_id,
            "status": "ok",
            "message": "Connected (generation endpoint reachable).",
        }
    if status_code == 429:
        return {
            "providerId": provider_id,
            "status": "rate_limited",
            "errorType": "PROVIDER_RATE_LIMITED",
            "message": "Provider rate limit hit.",
        }
    if status_code >= 500:
        return {
            "providerId": provider_id,
            "status": "server_error",
            "errorType": "PROVIDER_SERVER_ERROR",
            "message": f"Provider returned HTTP {status_code}.",
        }
    # Any other status — treat as ok (auth passed)
    return {
        "providerId": provider_id,
        "status": "ok",
        "message": f"Connected (HTTP {status_code}).",
    }


def _pick_probe_model(provider_id: str) -> dict | None:
    for model in model_registry.models:
        if model.get("provider") != provider_id:
            continue
        if not model.get("enabled"):
            continue
        if model.get("runtime") not in {"chat", "chat_completion"}:
            continue
        return model
    return None


def _classify_probe_error(error_type: str) -> str:
    mapping = {
        "PROVIDER_AUTH_FAILED": "auth_failed",
        "PROVIDER_AUTH_MISSING": "missing_key",
        "PROVIDER_FORBIDDEN": "forbidden",
        "PROVIDER_RATE_LIMITED": "rate_limited",
        "PROVIDER_TIMEOUT": "timeout",
        "PROVIDER_CONNECT_ERROR": "unreachable",
        "PROVIDER_BAD_REQUEST": "bad_request",
        "PROVIDER_SERVER_ERROR": "server_error",
        "PROVIDER_REQUEST_ERROR": "request_error",
    }
    return mapping.get(error_type, "error")
