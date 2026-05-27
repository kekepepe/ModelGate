import json
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CONFIG_DIR = PROJECT_ROOT / "configs"


def load_json(filename: str) -> Any:
    with (CONFIG_DIR / filename).open("r", encoding="utf-8") as file:
        return json.load(file)


def validate_unique(label: str, values: list[str], errors: list[str]) -> None:
    duplicates = sorted({value for value in values if values.count(value) > 1})
    if duplicates:
        errors.append(f"{label} contains duplicate ids: {duplicates}")


def main() -> None:
    providers = load_json("providers.json")
    capabilities = load_json("capabilities.json")
    task_types = load_json("task-types.json")
    param_schemas = load_json("param-schemas.json")
    models = load_json("models.json")

    errors: list[str] = []
    provider_ids = {provider["id"] for provider in providers}
    capability_ids = set(capabilities)
    task_types_by_id = {task_type["id"]: task_type for task_type in task_types}
    param_schema_ids = {schema["id"] for schema in param_schemas}

    validate_unique("providers", [provider["id"] for provider in providers], errors)
    validate_unique("models", [model["id"] for model in models], errors)
    validate_unique("task-types", [task_type["id"] for task_type in task_types], errors)
    validate_unique("param-schemas", [schema["id"] for schema in param_schemas], errors)

    for schema in param_schemas:
        validate_unique(
            f"param schema {schema['id']} fields",
            [field["key"] for field in schema.get("fields", [])],
            errors,
        )

    for task_type in task_types:
        missing_capabilities = set(task_type.get("requiredCapabilities", [])) - capability_ids
        if missing_capabilities:
            errors.append(
                f"taskType {task_type['id']} references unknown capabilities: "
                f"{sorted(missing_capabilities)}"
            )

    for model in models:
        model_id = model["id"]
        if model.get("provider") not in provider_ids:
            errors.append(f"model {model_id} references unknown provider: {model.get('provider')}")
        if model.get("paramsSchema") not in param_schema_ids:
            errors.append(
                f"model {model_id} references unknown paramsSchema: {model.get('paramsSchema')}"
            )

        missing_capabilities = set(model.get("capabilities", [])) - capability_ids
        if missing_capabilities:
            errors.append(
                f"model {model_id} references unknown capabilities: {sorted(missing_capabilities)}"
            )

        missing_task_types = set(model.get("taskTypes", [])) - set(task_types_by_id)
        if missing_task_types:
            errors.append(
                f"model {model_id} references unknown taskTypes: {sorted(missing_task_types)}"
            )

        for task_type_id in model.get("taskTypes", []):
            task_type = task_types_by_id.get(task_type_id)
            if not task_type:
                continue
            missing_required_capabilities = set(task_type.get("requiredCapabilities", [])) - set(
                model.get("capabilities", [])
            )
            if missing_required_capabilities:
                errors.append(
                    f"model {model_id} lacks required capabilities for taskType "
                    f"{task_type_id}: {sorted(missing_required_capabilities)}"
                )

    if errors:
        raise SystemExit("Model registry validation failed:\n- " + "\n- ".join(errors))

    print("Model registry validation passed.")


if __name__ == "__main__":
    main()
