from fastapi import APIRouter

from app.services.model_registry import model_registry

router = APIRouter()


@router.get("")
async def list_providers():
    return {"data": model_registry.providers}

