from pathlib import Path
import sys

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
PROJECT_ROOT = SERVER_ROOT.parents[1]
sys.path.insert(0, str(SERVER_ROOT))

from app.services.model_registry import ModelRegistry  # noqa: E402


def test_model_registry_config_is_valid() -> None:
    registry = ModelRegistry(PROJECT_ROOT / "configs")
    registry.validate()


def test_recommend_filters_by_task_type_and_input_type() -> None:
    registry = ModelRegistry(PROJECT_ROOT / "configs")

    result = registry.recommend(task_type="coding", input_types=["code"])

    assert result["availableModels"]
    assert all("coding" in model["taskTypes"] for model in result["availableModels"])
    assert all("code" in model["inputTypes"] for model in result["availableModels"])
