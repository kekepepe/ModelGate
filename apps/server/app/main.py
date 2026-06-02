from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    chat,
    files,
    generation,
    health,
    history,
    logs,
    models,
    param_schemas,
    providers,
    usage,
)
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.middleware import RequestIdMiddleware
from app.core.startup import lifespan


def get_cors_allow_origins() -> list[str]:
    return [origin.strip() for origin in settings.cors_allow_origins.split(",") if origin.strip()]


app = FastAPI(title="ModelGate API", version="0.1.0", lifespan=lifespan)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_allow_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(health.router)
app.include_router(providers.router, prefix="/api/providers", tags=["providers"])
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(param_schemas.router, prefix="/api/param-schemas", tags=["param-schemas"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(generation.router, prefix="/api/generation", tags=["generation"])
app.include_router(history.router, prefix="/api/history", tags=["history"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])
app.include_router(usage.router, prefix="/api/usage", tags=["usage"])
