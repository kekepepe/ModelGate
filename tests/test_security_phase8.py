from decimal import Decimal
from pathlib import Path
import socket
import sys

import httpx
import pytest
from fastapi.testclient import TestClient

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
PROJECT_ROOT = SERVER_ROOT.parents[1]
sys.path.insert(0, str(SERVER_ROOT))

from app.core.config import settings  # noqa: E402
from app.core.logging import redact  # noqa: E402
from app.db.models import RequestLog, UsageLog  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.providers.errors import map_provider_status  # noqa: E402


def require_local_port(port: int) -> None:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return
    except OSError as exc:
        pytest.skip(f"localhost:{port} is not reachable: {exc}")


def test_provider_and_model_api_do_not_expose_internal_urls_or_keys() -> None:
    require_local_port(5432)
    require_local_port(6379)

    with TestClient(app) as client:
        providers_response = client.get("/api/providers")
        models_response = client.get("/api/models")

    assert providers_response.status_code == 200
    assert models_response.status_code == 200
    provider = providers_response.json()["data"][0]
    model = models_response.json()["data"][0]

    assert "baseUrl" not in provider
    assert "anthropicBaseUrl" not in provider.get("metadata", {})
    assert "openaiBaseUrl" not in provider.get("metadata", {})
    assert isinstance(provider["configured"], bool)
    assert "baseUrl" not in model["adapterConfig"]


def test_request_and_usage_logs_are_queryable_and_redacted() -> None:
    require_local_port(5432)
    require_local_port(6379)
    secret = "phase8-secret-token"
    settings.mimo_api_key = secret

    with SessionLocal() as db:
        request_log = RequestLog(
            id="log_phase8_security",
            record_type="run",
            record_id="run_phase8_security",
            provider_id="mimo",
            model_id="mimo.mimo_v2_5",
            request_json={
                "headers": {"Authorization": f"Bearer {secret}", "api-key": secret},
                "storedPath": str(PROJECT_ROOT / "storage" / "uploads" / "secret.txt"),
            },
            response_json={"message": f"failed with {secret}"},
            status_code=502,
            latency_ms=12,
            error_type="PROVIDER_AUTH_FAILED",
            error_message=f"bad key {secret}",
        )
        usage_log = UsageLog(
            id="usage_phase8_security",
            record_type="run",
            record_id="run_phase8_security",
            provider_id="mimo",
            model_id="mimo.mimo_v2_5",
            input_tokens=1,
            output_tokens=2,
            total_tokens=3,
            estimated_cost=Decimal("0"),
            currency="USD",
            metadata_json={"token": secret, "source": "phase8"},
        )
        db.merge(request_log)
        db.merge(usage_log)
        db.commit()

    with TestClient(app) as client:
        logs_response = client.get("/api/logs/requests")
        usage_response = client.get("/api/usage/logs")

    assert logs_response.status_code == 200
    assert usage_response.status_code == 200
    serialized_logs = str(logs_response.json())
    serialized_usage = str(usage_response.json())
    assert secret not in serialized_logs
    assert secret not in serialized_usage
    assert str(PROJECT_ROOT) not in serialized_logs
    assert "[REDACTED]" in serialized_logs
    assert "[REDACTED]" in serialized_usage


def test_provider_error_messages_are_redacted() -> None:
    secret = "phase8-provider-secret"
    settings.mimo_api_key = secret
    response = httpx.Response(
        401,
        json={"error": {"message": f"Authorization Bearer {secret} is invalid"}},
        request=httpx.Request("POST", "https://provider.example/v1/messages"),
    )

    error = map_provider_status(response)

    assert secret not in error.message
    assert "[REDACTED]" in error.message


def test_frontend_source_does_not_reference_provider_api_keys() -> None:
    source_files = list((PROJECT_ROOT / "apps" / "web" / "src").rglob("*"))
    checked_text = "\n".join(path.read_text(encoding="utf-8") for path in source_files if path.is_file())

    forbidden = ["MIMO_API_KEY", "MINIMAX_API_KEY", "VOLCENGINE_API_KEY", "Authorization", "api-key"]
    assert all(item not in checked_text for item in forbidden)


def test_redact_removes_sensitive_keys_and_local_paths() -> None:
    secret = "phase8-redact-secret"
    settings.minimax_api_key = secret
    payload = {
        "authorization": f"Bearer {secret}",
        "nested": {"api_key": secret, "path": str(PROJECT_ROOT / "storage" / "uploads" / "file.txt")},
        "message": f"token={secret}",
    }

    redacted = redact(payload)
    serialized = str(redacted)

    assert secret not in serialized
    assert str(PROJECT_ROOT) not in serialized
    assert redacted["authorization"] == "[REDACTED]"
    assert "path" not in redacted["nested"]
