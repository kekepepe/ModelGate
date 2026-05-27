from contextlib import asynccontextmanager

from fastapi import FastAPI
from redis import Redis
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine
from app.services.model_registry import RegistryValidationError, model_registry


@asynccontextmanager
async def lifespan(app: FastAPI):
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    redis_client = Redis.from_url(settings.redis_url)
    try:
        redis_client.ping()
    finally:
        redis_client.close()

    try:
        model_registry.validate()
    except RegistryValidationError as exc:
        raise RuntimeError(f"Model registry validation failed: {exc}") from exc

    yield
