from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import FileRecord
from app.db.session import get_db
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
    return {"data": [serialize_model(model) for model in model_registry.models]}


@router.get("/{model_id}")
async def get_model(model_id: str):
    return {"data": serialize_model(model_registry.get_model(model_id))}


@router.post("/recommend")
async def recommend_models(input_data: RecommendModelsInput, db: Session = Depends(get_db)):
    input_types = _apply_file_input_types(input_data=input_data, db=db)
    result = model_registry.recommend(
        task_type=input_data.taskType,
        input_types=input_types,
        required_output=input_data.requiredOutput,
        preferred_providers=input_data.preferredProviders,
        params=input_data.params,
    )
    return {
        "data": {
            "availableModels": [serialize_model(model) for model in result["availableModels"]],
            "hiddenModels": result["hiddenModels"],
        }
    }


def serialize_model(model: dict) -> dict:
    adapter_config = model.get("adapterConfig") or {}
    public_adapter_config = {
        key: value
        for key, value in adapter_config.items()
        if key in {"protocol", "disabledReason", "reservedForFutureVersion"}
    }
    return {
        "id": model["id"],
        "officialModelName": model["officialModelName"],
        "displayName": model["displayName"],
        "provider": model["provider"],
        "category": model["category"],
        "runtime": model["runtime"],
        "capabilities": model["capabilities"],
        "inputTypes": model["inputTypes"],
        "outputTypes": model["outputTypes"],
        "taskTypes": model["taskTypes"],
        "contextWindow": model.get("contextWindow"),
        "async": model["async"],
        "enabled": model["enabled"],
        "paramsSchema": model["paramsSchema"],
        "adapterConfig": public_adapter_config,
    }


def _apply_file_input_types(input_data: RecommendModelsInput, db: Session) -> list[str] | None:
    input_types = set(input_data.inputTypes or [])
    if not input_data.fileIds:
        return list(input_types) if input_types else None

    for file_id in input_data.fileIds:
        record = db.get(FileRecord, file_id)
        if record is None or record.status == "deleted":
            raise AppError("FILE_NOT_FOUND", f"File not found: {file_id}", status_code=404)
        if record.status == "failed":
            raise AppError(
                "FILE_NOT_USABLE",
                f"File cannot be used because parsing failed: {file_id}",
                status_code=400,
            )
        if not record.direct_usable or record.status not in {"uploaded", "parsed"}:
            raise AppError("FILE_NOT_READY", f"File is not ready: {file_id}", status_code=409)

        input_types.add("file")
        if record.detected_type == "code":
            input_types.add("code")

    return list(input_types)
