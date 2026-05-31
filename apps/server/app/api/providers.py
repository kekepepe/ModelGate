from fastapi import APIRouter

from app.services.model_registry import model_registry

router = APIRouter()


def serialize_provider(provider: dict) -> dict:
    return {
        "id": provider["id"],
        "name": provider["name"],
        "authType": provider["authType"],
        "envKey": provider.get("envKey"),
        "adapter": provider["adapter"],
        "enabled": provider["enabled"],
        "configured": bool(model_registry.get_provider_secret(provider["id"])),
        "metadata": {
            key: value
            for key, value in (provider.get("metadata") or {}).items()
            if key in {"protocols", "reservedForFutureVersion"}
        },
    }


@router.get("")
async def list_providers():
    return {"data": [serialize_provider(provider) for provider in model_registry.providers]}
