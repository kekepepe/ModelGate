from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "ModelGate"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    log_level: str = "INFO"
    log_partial_secrets: bool = False

    database_url: str = "postgresql+psycopg://modelgate:modelgate_password@localhost:5432/modelgate"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"

    mimo_api_key: str = ""
    minimax_api_key: str = ""
    volcengine_api_key: str = ""
    moonshot_api_key: str = ""
    zhipu_api_key: str = ""

    storage_driver: str = "local"
    storage_root: str = "./storage"
    uploads_dir: str = "./storage/uploads"
    outputs_dir: str = "./storage/outputs"
    previews_dir: str = "./storage/previews"

    max_image_mb: int = 20
    max_video_mb: int = 500
    max_audio_mb: int = 100
    max_document_mb: int = 100
    max_code_mb: int = 5

    enable_streaming: bool = False
    enable_seedance: bool = False
    enable_auth: bool = False
    enable_object_storage: bool = False

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    def get_secret(self, env_key: str) -> str:
        normalized = env_key.lower()
        return getattr(self, normalized, "")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

