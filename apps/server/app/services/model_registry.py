import json
from functools import cached_property
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProviderConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    base_url: str = Field(alias="baseUrl")
    auth_type: str = Field(alias="authType")
    env_key: str | None = Field(default=None, alias="envKey")
    adapter: str
    enabled: bool
    metadata: dict[str, Any] = Field(default_factory=dict)


class TaskTypeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    required_input_types: list[str] = Field(alias="requiredInputTypes")
    optional_input_types: list[str] = Field(default_factory=list, alias="optionalInputTypes")
    output_types: list[str] = Field(alias="outputTypes")
    runtime: str
    required_capabilities: list[str] = Field(alias="requiredCapabilities")


class ParamFieldConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    key: str
    type: str
    label: str
    default: Any = None
    required: bool = False
    provider_mapping: dict[str, str] = Field(default_factory=dict, alias="providerMapping")


class ParamSchemaConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    version: int
    runtime: str
    fields: list[ParamFieldConfig]


class ModelConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    official_model_name: str = Field(alias="officialModelName")
    display_name: str = Field(alias="displayName")
    provider: str
    category: str
    runtime: str
    capabilities: list[str]
    input_types: list[str] = Field(alias="inputTypes")
    output_types: list[str] = Field(alias="outputTypes")
    task_types: list[str] = Field(alias="taskTypes")
    context_window: int | None = Field(default=None, alias="contextWindow")
    is_async: bool = Field(alias="async")
    enabled: bool
    params_schema: str = Field(alias="paramsSchema")
    adapter_config: dict[str, Any] = Field(default_factory=dict, alias="adapterConfig")


class RegistryValidationError(ValueError):
    pass


class ModelRegistry:
    def __init__(self, config_dir: Path | None = None):
        self.config_dir = config_dir or Path.cwd() / "configs"

    def _load_json(self, filename: str):
        with (self.config_dir / filename).open("r", encoding="utf-8") as file:
            return json.load(file)

    @cached_property
    def providers(self) -> list[dict]:
        return self._load_json("providers.json")

    @cached_property
    def capabilities(self) -> list[str]:
        return self._load_json("capabilities.json")

    @cached_property
    def models(self) -> list[dict]:
        return self._load_json("models.json")

    @cached_property
    def task_types(self) -> list[dict]:
        return self._load_json("task-types.json")

    @cached_property
    def param_schemas(self) -> list[dict]:
        return self._load_json("param-schemas.json")

    @cached_property
    def provider_configs(self) -> list[ProviderConfig]:
        return [ProviderConfig.model_validate(provider) for provider in self.providers]

    @cached_property
    def task_type_configs(self) -> list[TaskTypeConfig]:
        return [TaskTypeConfig.model_validate(task_type) for task_type in self.task_types]

    @cached_property
    def param_schema_configs(self) -> list[ParamSchemaConfig]:
        return [ParamSchemaConfig.model_validate(schema) for schema in self.param_schemas]

    @cached_property
    def model_configs(self) -> list[ModelConfig]:
        return [ModelConfig.model_validate(model) for model in self.models]

    @cached_property
    def providers_by_id(self) -> dict[str, ProviderConfig]:
        return {provider.id: provider for provider in self.provider_configs}

    @cached_property
    def task_types_by_id(self) -> dict[str, TaskTypeConfig]:
        return {task_type.id: task_type for task_type in self.task_type_configs}

    @cached_property
    def param_schemas_by_id(self) -> dict[str, ParamSchemaConfig]:
        return {schema.id: schema for schema in self.param_schema_configs}

    def validate(self) -> None:
        errors: list[str] = []
        self._validate_unique("providers", [provider.id for provider in self.provider_configs], errors)
        self._validate_unique("models", [model.id for model in self.model_configs], errors)
        self._validate_unique("task-types", [task_type.id for task_type in self.task_type_configs], errors)
        self._validate_unique(
            "param-schemas", [schema.id for schema in self.param_schema_configs], errors
        )

        capabilities = set(self.capabilities)
        provider_ids = set(self.providers_by_id)
        task_type_ids = set(self.task_types_by_id)
        param_schema_ids = set(self.param_schemas_by_id)

        for task_type in self.task_type_configs:
            missing_capabilities = set(task_type.required_capabilities) - capabilities
            if missing_capabilities:
                errors.append(
                    f"taskType {task_type.id} references unknown capabilities: "
                    f"{sorted(missing_capabilities)}"
                )

        for schema in self.param_schema_configs:
            self._validate_unique(
                f"param schema {schema.id} fields",
                [field.key for field in schema.fields],
                errors,
            )

        for model in self.model_configs:
            if model.provider not in provider_ids:
                errors.append(f"model {model.id} references unknown provider: {model.provider}")
            if model.params_schema not in param_schema_ids:
                errors.append(
                    f"model {model.id} references unknown paramsSchema: {model.params_schema}"
                )

            missing_capabilities = set(model.capabilities) - capabilities
            if missing_capabilities:
                errors.append(
                    f"model {model.id} references unknown capabilities: {sorted(missing_capabilities)}"
                )

            missing_task_types = set(model.task_types) - task_type_ids
            if missing_task_types:
                errors.append(
                    f"model {model.id} references unknown taskTypes: {sorted(missing_task_types)}"
                )

            for task_type_id in model.task_types:
                task_type = self.task_types_by_id.get(task_type_id)
                if task_type is None:
                    continue
                missing_required_capabilities = set(task_type.required_capabilities) - set(
                    model.capabilities
                )
                if missing_required_capabilities:
                    errors.append(
                        f"model {model.id} lacks required capabilities for taskType "
                        f"{task_type_id}: {sorted(missing_required_capabilities)}"
                    )

        if errors:
            raise RegistryValidationError("; ".join(errors))

    def _validate_unique(self, label: str, values: list[str], errors: list[str]) -> None:
        duplicates = sorted({value for value in values if values.count(value) > 1})
        if duplicates:
            errors.append(f"{label} contains duplicate ids: {duplicates}")

    def get_model(self, model_id: str) -> dict:
        for model in self.models:
            if model["id"] == model_id:
                return model
        raise_app_error("MODEL_NOT_FOUND", f"Model not found: {model_id}", status_code=404)

    def get_provider(self, provider_id: str) -> dict:
        for provider in self.providers:
            if provider["id"] == provider_id:
                return provider
        raise_app_error("PROVIDER_NOT_FOUND", f"Provider not found: {provider_id}", status_code=404)

    def get_param_schema(self, schema_id: str) -> dict:
        for schema in self.param_schemas:
            if schema["id"] == schema_id:
                return schema
        raise_app_error("PARAM_SCHEMA_NOT_FOUND", f"Param schema not found: {schema_id}", 404)

    def recommend(
        self,
        task_type: str,
        input_types: list[str] | None = None,
        required_output: str | None = None,
        preferred_providers: list[str] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict:
        task_type_config = self.task_types_by_id.get(task_type)
        if task_type_config is None:
            raise_app_error("TASK_TYPE_NOT_FOUND", f"Task type not found: {task_type}", 404)

        effective_input_types = input_types or task_type_config.required_input_types
        preferred_providers = preferred_providers or []
        params = params or {}

        available: list[dict] = []
        hidden: list[dict] = []

        for raw_model, model in zip(self.models, self.model_configs, strict=True):
            reasons = self._get_hidden_reasons(
                model=model,
                task_type=task_type,
                task_type_config=task_type_config,
                input_types=effective_input_types,
                required_output=required_output,
                preferred_providers=preferred_providers,
                params=params,
            )
            if reasons:
                hidden.append(
                    {
                        "id": model.id,
                        "officialModelName": model.official_model_name,
                        "displayName": model.display_name,
                        "reasons": reasons,
                    }
                )
            else:
                available.append(raw_model)

        available.sort(key=lambda model: self._provider_sort_key(model["provider"], preferred_providers))
        return {"availableModels": available, "hiddenModels": hidden}

    def _get_hidden_reasons(
        self,
        model: ModelConfig,
        task_type: str,
        task_type_config: TaskTypeConfig,
        input_types: list[str],
        required_output: str | None,
        preferred_providers: list[str],
        params: dict[str, Any],
    ) -> list[str]:
        reasons: list[str] = []
        provider = self.providers_by_id.get(model.provider)

        if not model.enabled:
            reasons.append("model_disabled")
        if provider is None:
            reasons.append("provider_missing")
        elif not provider.enabled:
            reasons.append("provider_disabled")
        if preferred_providers and model.provider not in preferred_providers:
            reasons.append("provider_not_preferred")
        if task_type not in model.task_types:
            reasons.append("task_type_not_supported")

        missing_inputs = sorted(set(input_types) - set(model.input_types))
        if missing_inputs:
            reasons.append(f"missing_input_types:{','.join(missing_inputs)}")

        missing_capabilities = sorted(
            set(task_type_config.required_capabilities) - set(model.capabilities)
        )
        if missing_capabilities:
            reasons.append(f"missing_capabilities:{','.join(missing_capabilities)}")

        if required_output and required_output not in model.output_types:
            reasons.append(f"output_type_not_supported:{required_output}")
        if required_output and required_output not in task_type_config.output_types:
            reasons.append(f"output_type_not_supported_by_task:{required_output}")

        schema = self.param_schemas_by_id.get(model.params_schema)
        if schema is None:
            reasons.append("param_schema_missing")
        else:
            required_fields = {field.key for field in schema.fields if field.required}
            missing_params = sorted(required_fields - set(params))
            if missing_params:
                reasons.append(f"missing_required_params:{','.join(missing_params)}")

        return reasons

    def _provider_sort_key(self, provider: str, preferred_providers: list[str]) -> tuple[int, str]:
        if provider in preferred_providers:
            return (preferred_providers.index(provider), provider)
        return (len(preferred_providers), provider)


def raise_app_error(error_type: str, message: str, status_code: int):
    from app.core.errors import AppError

    raise AppError(error_type, message, status_code=status_code)


model_registry = ModelRegistry()
