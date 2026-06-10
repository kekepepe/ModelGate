"""Tests for V3.4 Param Schema & Model Capabilities (phase 26).

Covers:
- contextBudget param field exists in chat schema
- contextBudget options are valid
- maxOutputTokens is present on chat models
- maxOutputTokens is null on non-chat models
- _resolve_budget_ratio maps all known values
- _resolve_budget_ratio defaults for unknown values
- Model registry validation passes with new fields
- Param schema field keys are unique per schema
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.services.model_registry import model_registry  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_registry_cache():
    """Force reload of cached properties for each test."""
    for attr in [
        "models",
        "param_schemas",
        "model_configs",
        "param_schema_configs",
        "providers",
        "capabilities",
        "task_types",
    ]:
        if attr in model_registry.__dict__:
            del model_registry.__dict__[attr]
    yield


# ---- contextBudget field in param schema ----


class TestContextBudgetField:
    def test_context_budget_field_exists_in_chat_schema(self):
        schema = model_registry.get_param_schema("chat_openai_compatible_schema")
        keys = [f["key"] for f in schema["fields"]]
        assert "contextBudget" in keys

    def test_context_budget_is_select_type(self):
        schema = model_registry.get_param_schema("chat_openai_compatible_schema")
        cb = next(f for f in schema["fields"] if f["key"] == "contextBudget")
        assert cb["type"] == "select"

    def test_context_budget_has_valid_options(self):
        schema = model_registry.get_param_schema("chat_openai_compatible_schema")
        cb = next(f for f in schema["fields"] if f["key"] == "contextBudget")
        options = cb.get("options", [])
        assert len(options) >= 3
        values = [o["value"] for o in options]
        assert "auto" in values
        assert "conservative" in values
        assert "balanced" in values
        assert "aggressive" in values

    def test_context_budget_default_is_auto(self):
        schema = model_registry.get_param_schema("chat_openai_compatible_schema")
        cb = next(f for f in schema["fields"] if f["key"] == "contextBudget")
        assert cb["default"] == "auto"

    def test_context_budget_not_required(self):
        schema = model_registry.get_param_schema("chat_openai_compatible_schema")
        cb = next(f for f in schema["fields"] if f["key"] == "contextBudget")
        assert cb["required"] is False


# ---- max_completion_tokens field ----


class TestMaxCompletionTokens:
    def test_max_completion_tokens_exists(self):
        schema = model_registry.get_param_schema("chat_openai_compatible_schema")
        keys = [f["key"] for f in schema["fields"]]
        assert "max_completion_tokens" in keys

    def test_max_completion_tokens_label_updated(self):
        schema = model_registry.get_param_schema("chat_openai_compatible_schema")
        field = next(f for f in schema["fields"] if f["key"] == "max_completion_tokens")
        assert field["label"] == "Max Output Tokens"

    def test_max_completion_tokens_default_is_4096(self):
        schema = model_registry.get_param_schema("chat_openai_compatible_schema")
        field = next(f for f in schema["fields"] if f["key"] == "max_completion_tokens")
        assert field["default"] == 4096


# ---- maxOutputTokens on models ----


class TestMaxOutputTokens:
    def test_chat_models_have_max_output_tokens(self):
        for model in model_registry.model_configs:
            if model.runtime == "chat_completion":
                assert (
                    model.max_output_tokens is not None
                ), f"Chat model {model.id} missing maxOutputTokens"
                assert model.max_output_tokens > 0

    def test_video_model_max_output_tokens_is_none(self):
        for model in model_registry.model_configs:
            if model.runtime == "video_generation":
                assert model.max_output_tokens is None

    def test_max_output_tokens_exposed_in_raw_model(self):
        raw = model_registry.get_model("mimo.mimo_v2_5_pro")
        assert raw["maxOutputTokens"] == 16384

    def test_max_output_tokens_exposed_in_config(self):
        config = next(m for m in model_registry.model_configs if m.id == "mimo.mimo_v2_5_pro")
        assert config.max_output_tokens == 16384


# ---- _resolve_budget_ratio ----


class TestResolveBudgetRatio:
    def test_auto_returns_default(self):
        from app.api.chat import DEFAULT_BUDGET_RATIO, _resolve_budget_ratio

        assert _resolve_budget_ratio({}) == DEFAULT_BUDGET_RATIO
        assert _resolve_budget_ratio({"contextBudget": "auto"}) == DEFAULT_BUDGET_RATIO

    def test_conservative(self):
        from app.api.chat import _resolve_budget_ratio

        assert _resolve_budget_ratio({"contextBudget": "conservative"}) == 0.50

    def test_balanced(self):
        from app.api.chat import _resolve_budget_ratio

        assert _resolve_budget_ratio({"contextBudget": "balanced"}) == 0.70

    def test_aggressive(self):
        from app.api.chat import _resolve_budget_ratio

        assert _resolve_budget_ratio({"contextBudget": "aggressive"}) == 0.85

    def test_unknown_value_returns_default(self):
        from app.api.chat import DEFAULT_BUDGET_RATIO, _resolve_budget_ratio

        assert _resolve_budget_ratio({"contextBudget": "unknown"}) == DEFAULT_BUDGET_RATIO
        assert _resolve_budget_ratio({"contextBudget": ""}) == DEFAULT_BUDGET_RATIO

    def test_non_string_value_returns_default(self):
        from app.api.chat import DEFAULT_BUDGET_RATIO, _resolve_budget_ratio

        assert _resolve_budget_ratio({"contextBudget": 123}) == DEFAULT_BUDGET_RATIO


# ---- Schema field uniqueness ----


class TestSchemaFieldUniqueness:
    def test_chat_schema_fields_are_unique(self):
        schema = model_registry.get_param_schema("chat_openai_compatible_schema")
        keys = [f["key"] for f in schema["fields"]]
        assert len(keys) == len(set(keys))

    def test_video_schema_fields_are_unique(self):
        schema = model_registry.get_param_schema("video_generation_schema")
        keys = [f["key"] for f in schema["fields"]]
        assert len(keys) == len(set(keys))


# ---- Registry validation ----


class TestRegistryValidation:
    def test_registry_validates_with_new_fields(self):
        model_registry.validate()
