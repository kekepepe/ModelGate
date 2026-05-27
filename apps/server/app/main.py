from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, models, providers
from app.core.errors import register_exception_handlers
from app.core.middleware import RequestIdMiddleware
from app.core.startup import lifespan

app = FastAPI(title="ModelGate API", version="0.1.0", lifespan=lifespan)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(health.router)
app.include_router(providers.router, prefix="/api/providers", tags=["providers"])
app.include_router(models.router, prefix="/api/models", tags=["models"])
