from celery import Celery, signals
from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings


def ensure_redis_available() -> None:
    redis_client = Redis.from_url(
        settings.redis_url,
        socket_connect_timeout=3,
        socket_timeout=3,
    )
    try:
        redis_client.ping()
    except RedisError as exc:
        raise RuntimeError("Redis is not available for worker startup.") from exc
    finally:
        redis_client.close()


celery_app = Celery(
    "modelgate",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    imports=("app.workers.file_tasks", "app.workers.generation_tasks"),
)


@signals.worker_init.connect
def verify_worker_dependencies(**_: object) -> None:
    ensure_redis_available()
