from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ProviderSecret
from app.db.session import SessionLocal


def get_provider_secret(provider_id: str, env_key: str | None, db: Session | None = None) -> str:
    local_secret = get_local_provider_secret(provider_id, db=db)
    if local_secret:
        return local_secret
    return settings.get_secret(env_key or "")


def get_provider_secret_source(provider_id: str, env_key: str | None, db: Session | None = None) -> str | None:
    if get_local_provider_secret(provider_id, db=db):
        return "local"
    if settings.get_secret(env_key or ""):
        return "env"
    return None


def set_local_provider_secret(provider_id: str, secret_value: str, db: Session) -> ProviderSecret:
    record = db.get(ProviderSecret, provider_id)
    if record is None:
        record = ProviderSecret(provider_id=provider_id, secret_value=secret_value)
        db.add(record)
    else:
        record.secret_value = secret_value
        record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    return record


def delete_local_provider_secret(provider_id: str, db: Session) -> bool:
    record = db.get(ProviderSecret, provider_id)
    if record is None:
        return False
    db.delete(record)
    db.commit()
    return True


def get_local_provider_secret(provider_id: str, db: Session | None = None) -> str:
    if db is not None:
        record = db.get(ProviderSecret, provider_id)
        return record.secret_value if record else ""

    try:
        with SessionLocal() as session:
            record = session.get(ProviderSecret, provider_id)
            return record.secret_value if record else ""
    except Exception:
        return ""


def list_local_provider_secrets() -> list[str]:
    try:
        with SessionLocal() as session:
            return [
                item
                for item in session.scalars(select(ProviderSecret.secret_value)).all()
                if item and len(item) >= 8
            ]
    except Exception:
        return []
