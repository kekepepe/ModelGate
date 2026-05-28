from pathlib import Path
import sys

import httpx

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.providers.errors import map_provider_status  # noqa: E402


def test_provider_error_mapping_rate_limit() -> None:
    response = httpx.Response(
        429,
        json={"error": {"message": "too many requests"}},
        request=httpx.Request("POST", "https://provider.example/v1/messages"),
    )

    error = map_provider_status(response)

    assert error.error_type == "PROVIDER_RATE_LIMITED"
    assert error.status_code == 429
    assert error.details["providerStatusCode"] == 429
