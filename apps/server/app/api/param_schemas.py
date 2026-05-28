from fastapi import APIRouter

from app.services.model_registry import model_registry

router = APIRouter()


@router.get("/{schema_id}")
async def get_param_schema(schema_id: str):
    return {"data": model_registry.get_param_schema(schema_id)}
