from sqlalchemy.orm import Session

from app.db.models import Model, ParamSchema, Provider
from app.services.model_registry import ModelRegistry


def sync_registry_to_db(registry: ModelRegistry, db: Session) -> None:
    for provider in registry.providers:
        record = db.get(Provider, provider["id"])
        values = {
            "name": provider["name"],
            "base_url": provider["baseUrl"],
            "auth_type": provider["authType"],
            "env_key": provider.get("envKey"),
            "adapter": provider["adapter"],
            "enabled": provider["enabled"],
            "metadata_json": provider.get("metadata", {}),
        }
        if record is None:
            db.add(Provider(id=provider["id"], **values))
        else:
            for key, value in values.items():
                setattr(record, key, value)

    for schema in registry.param_schemas:
        record = db.get(ParamSchema, schema["id"])
        values = {
            "name": schema["name"],
            "schema_json": schema,
        }
        if record is None:
            db.add(ParamSchema(id=schema["id"], **values))
        else:
            for key, value in values.items():
                setattr(record, key, value)

    db.flush()

    for model in registry.models:
        record = db.get(Model, model["id"])
        values = {
            "provider_id": model["provider"],
            "official_model_name": model["officialModelName"],
            "display_name": model["displayName"],
            "category": model["category"],
            "runtime": model["runtime"],
            "capabilities": model["capabilities"],
            "input_types": model["inputTypes"],
            "output_types": model["outputTypes"],
            "task_types": model["taskTypes"],
            "context_window": model.get("contextWindow"),
            "params_schema_id": model.get("paramsSchema"),
            "is_async": model["async"],
            "enabled": model["enabled"],
            "metadata_json": model.get("adapterConfig", {}),
        }
        if record is None:
            db.add(Model(id=model["id"], **values))
        else:
            for key, value in values.items():
                setattr(record, key, value)

    db.commit()
