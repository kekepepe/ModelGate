from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.model_registry import model_registry

router = APIRouter()


class RecommendModelsInput(BaseModel):
    taskType: str
    inputTypes: list[str] | None = None
    fileIds: list[str] = Field(default_factory=list)
    requiredOutput: str | None = None
    preferredProviders: list[str] = Field(default_factory=list)
    params: dict = Field(default_factory=dict)


@router.get("")
async def list_models():
    return {"data": model_registry.models}


@router.get("/{model_id}")
async def get_model(model_id: str):
    return {"data": model_registry.get_model(model_id)}


@router.post("/recommend")
async def recommend_models(input_data: RecommendModelsInput):
    return {
        "data": model_registry.recommend(
            task_type=input_data.taskType,
            input_types=input_data.inputTypes,
            required_output=input_data.requiredOutput,
            preferred_providers=input_data.preferredProviders,
            params=input_data.params,
        )
    }
