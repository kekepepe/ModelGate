from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.session import get_db
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
async def update_provider_key(provider_id: str, input_data: ProviderKeyInput, db: Session = Depends(get_db)):
    provider = model_registry.get_provider(provider_id)
    if provider.get("authType") != "bearer":
        raise AppError("PROVIDER_KEY_UNSUPPORTED", "This provider does not support bearer API keys.", 400)
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
