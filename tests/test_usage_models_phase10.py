"""Regression tests for `GET /api/usage/models` (phase 10).

Covers the fixes from `docs/DECISIONS.md` D-2026-06-04-02..05:
  - `providerId` is a non-null FK string on every response row.
  - The same `modelId` served by two providers returns two distinct rows
    (no silent merge by `model_id`).
  - Status-bucket counters are computed in SQL via `case`, not by a
    post-loop in Python.
  - `limit` query param caps the response.
  - Response shape matches the frontend `ModelUsage` type.

Self-contained: does NOT call `require_local_port(5432)` /
`require_local_port(6379)`. Uses an in-memory SQLite engine and stubs
the lifespan's Redis ping and registry sync.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import models as db_models  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402

# The set of fields the frontend `ModelUsage` type in
# `apps/web/src/components/usage/usage-page.tsx` declares. We keep this
# hard-coded (not imported) so the test fails loudly if the frontend
# changes its contract without the backend being updated.
EXPECTED_MODEL_USAGE_FIELDS = {
    "model",
    "modelId",
    "provider",
    "providerId",
    "requests",
    "tokens",
    "cost",
    "successRate",
    "avgLatencyMs",
}


class _FakeRedis:
    """No-op stand-in for `redis.Redis` used by `app.core.startup.lifespan`."""

    def __init__(self, *args, **kwargs) -> None:
        pass

    @classmethod
    def from_url(cls, *args, **kwargs) -> "_FakeRedis":
        return cls()

    def ping(self) -> None:
        return None

    def close(self) -> None:
        return None


def _seed(SessionLocal) -> None:
    """Seed two providers, one model, and four runs/usages covering the
    statuses the response cares about.

    Layout (all four runs use the same `model_id`):

        mimo / run_1 / completed
        minimax / run_2 / completed
        mimo / run_3 / failed + INVALID_API_KEY
        mimo / run_4 / cancelled

    The same `model_id` showing up with two different `provider_id` values
    is the regression case the original code silently merged into one
    bucket.
    """
    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        session.add_all(
            [
                db_models.Provider(
                    id="mimo",
                    name="Xiaomi MiMo",
                    base_url="https://example.test/mimo",
                    auth_type="bearer",
                    adapter="openai_compatible",
                ),
                db_models.Provider(
                    id="minimax",
                    name="MiniMax",
                    base_url="https://example.test/minimax",
                    auth_type="bearer",
                    adapter="openai_compatible",
                ),
            ]
        )
        session.add(
            db_models.Model(
                id="model-x",
                provider_id="mimo",
                official_model_name="model-x",
                display_name="Model X",
                category="chat",
                runtime="sync",
                capabilities=["chat"],
                input_types=["text"],
                output_types=["text"],
                task_types=["chat"],
            )
        )
        session.flush()

        runs = [
            db_models.Run(
                id="run_1",
                task_type="chat",
                provider_id="mimo",
                model_id="model-x",
                input_json={"prompt": "hi"},
                params_json={},
                status="completed",
                started_at=now - timedelta(seconds=2),
                completed_at=now - timedelta(seconds=1),
            ),
            db_models.Run(
                id="run_2",
                task_type="chat",
                provider_id="minimax",
                model_id="model-x",
                input_json={"prompt": "hi"},
                params_json={},
                status="completed",
                started_at=now - timedelta(seconds=3),
                completed_at=now - timedelta(seconds=1),
            ),
            db_models.Run(
                id="run_3",
                task_type="chat",
                provider_id="mimo",
                model_id="model-x",
                input_json={"prompt": "hi"},
                params_json={},
                status="failed",
                error_type="INVALID_API_KEY",
                error_message="bad key",
                started_at=now - timedelta(seconds=4),
                completed_at=now - timedelta(seconds=2),
            ),
            db_models.Run(
                id="run_4",
                task_type="chat",
                provider_id="mimo",
                model_id="model-x",
                input_json={"prompt": "hi"},
                params_json={},
                status="cancelled",
                started_at=now - timedelta(seconds=5),
                completed_at=now - timedelta(seconds=3),
            ),
        ]
        session.add_all(runs)
        session.flush()

        session.add_all(
            [
                db_models.UsageLog(
                    id=f"usage_{i}",
                    record_type="run",
                    record_id=run.id,
                    provider_id=run.provider_id,
                    model_id=run.model_id,
                    input_tokens=10,
                    output_tokens=20,
                    total_tokens=30,
                    estimated_cost=Decimal("0.001"),
                    created_at=run.completed_at or now,
                )
                for i, run in enumerate(runs, start=1)
            ]
        )
        session.commit()


@pytest.fixture
def client(monkeypatch):
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSessionLocal = sessionmaker(
        bind=test_engine, autocommit=False, autoflush=False
    )

    import app.core.startup as startup_module
    import app.db.session as session_module

    # 1. So `lifespan`'s `engine.connect()` and `sync_registry_to_db(session)`
    #    run against the in-memory DB, not the dev Postgres.
    monkeypatch.setattr(session_module, "engine", test_engine)
    monkeypatch.setattr(session_module, "SessionLocal", TestSessionLocal)

    # 2. The lifespan pings Redis on startup; stub it so we don't need a
    #    real Redis to be reachable.
    monkeypatch.setattr(startup_module, "Redis", _FakeRedis)

    # 3. The lifespan syncs the on-disk model registry into the DB. We
    #    already have full control of the seed, so make it a no-op to
    #    avoid the registry overwriting our test providers/models.
    monkeypatch.setattr(startup_module, "sync_registry_to_db", lambda *a, **k: None)

    # 4. Belt-and-suspenders: route the FastAPI `get_db` dependency at
    #    the temp session as well, so any endpoint that doesn't go
    #    through the patched module-level SessionLocal still works.
    def _get_db_override():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db_override

    db_models.Base.metadata.create_all(test_engine)
    _seed(TestSessionLocal)

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    test_engine.dispose()


# --- Tests -----------------------------------------------------------------


def test_returns_provider_id_not_null(client: TestClient) -> None:
    response = client.get("/api/usage/models")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data, "expected seeded rows"
    for row in data:
        assert row["providerId"] is not None
        assert isinstance(row["providerId"], str) and row["providerId"]


def test_multi_provider_for_same_model_returns_distinct_rows(client: TestClient) -> None:
    response = client.get("/api/usage/models")
    data = response.json()["data"]
    model_x_rows = [row for row in data if row["modelId"] == "model-x"]
    assert len(model_x_rows) == 2, (
        f"expected 2 rows for model-x (one per provider), got {len(model_x_rows)}: "
        f"{[(r['modelId'], r['providerId']) for r in model_x_rows]}"
    )
    provider_ids = {row["providerId"] for row in model_x_rows}
    assert provider_ids == {"mimo", "minimax"}


def test_success_rate_in_unit_interval(client: TestClient) -> None:
    response = client.get("/api/usage/models")
    for row in response.json()["data"]:
        rate = row["successRate"]
        assert isinstance(rate, (int, float))
        assert 0.0 <= rate <= 1.0, f"successRate {rate} out of [0,1] for {row}"


def test_avg_latency_is_int_or_null(client: TestClient) -> None:
    response = client.get("/api/usage/models")
    for row in response.json()["data"]:
        latency = row["avgLatencyMs"]
        assert latency is None or isinstance(latency, int), (
            f"avgLatencyMs {latency!r} is neither int nor None for {row}"
        )


def test_limit_query_param_caps_result_count(client: TestClient) -> None:
    response = client.get("/api/usage/models?limit=1")
    assert response.status_code == 200
    assert len(response.json()["data"]) == 1


def test_limit_query_param_rejects_out_of_range(client: TestClient) -> None:
    assert client.get("/api/usage/models?limit=0").status_code == 422
    assert client.get("/api/usage/models?limit=201").status_code == 422


def test_response_shape_matches_frontend_type(client: TestClient) -> None:
    response = client.get("/api/usage/models")
    data = response.json()["data"]
    assert data
    actual_fields = set(data[0].keys())
    assert actual_fields == EXPECTED_MODEL_USAGE_FIELDS, (
        f"response shape drift: extra={actual_fields - EXPECTED_MODEL_USAGE_FIELDS}, "
        f"missing={EXPECTED_MODEL_USAGE_FIELDS - actual_fields}"
    )


def test_does_not_swallow_provider_field_on_merge(client: TestClient) -> None:
    """The two rows for `model-x` must each carry their own provider name,
    not the last-seen value from a Python dict-keyed loop."""
    response = client.get("/api/usage/models")
    by_provider = {
        row["providerId"]: row["provider"] for row in response.json()["data"]
    }
    assert by_provider.get("mimo") == "Xiaomi MiMo"
    assert by_provider.get("minimax") == "MiniMax"
