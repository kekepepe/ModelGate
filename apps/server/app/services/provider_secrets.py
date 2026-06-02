from __future__ import annotations

import base64
import os
from datetime import UTC, datetime

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import ProviderSecret
from app.db.session import SessionLocal

ALGORITHM = "AES-256-GCM"
KEY_VERSION = "v1"
NONCE_BYTES = 12
HKDF_SALT = b"modelgate-provider-secrets-v1"
HKDF_INFO = b"provider-secret-store"
DEV_SECRET_MATERIAL = "modelgate-dev-local-provider-secret"


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
    encrypted_value, nonce = encrypt_provider_secret(provider_id, secret_value)
    record = db.get(ProviderSecret, provider_id)
    if record is None:
        record = ProviderSecret(
            provider_id=provider_id,
            encrypted_value=encrypted_value,
            nonce=nonce,
            key_version=KEY_VERSION,
            algorithm=ALGORITHM,
        )
        db.add(record)
    else:
        record.encrypted_value = encrypted_value
        record.nonce = nonce
        record.key_version = KEY_VERSION
        record.algorithm = ALGORITHM
        record.updated_at = datetime.now(UTC)
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
        return decrypt_provider_secret(record) if record else ""

    try:
        with SessionLocal() as session:
            record = session.get(ProviderSecret, provider_id)
            return decrypt_provider_secret(record) if record else ""
    except Exception:
        return ""


def list_local_provider_secrets() -> list[str]:
    try:
        with SessionLocal() as session:
            return [
                secret
                for secret in (decrypt_provider_secret(record) for record in session.scalars(select(ProviderSecret)).all())
                if secret and len(secret) >= 8
            ]
    except Exception:
        return []


def encrypt_provider_secret(provider_id: str, secret_value: str) -> tuple[str, str]:
    nonce = os.urandom(NONCE_BYTES)
    ciphertext = AESGCM(_derive_key()).encrypt(
        nonce,
        secret_value.encode("utf-8"),
        _associated_data(provider_id),
    )
    return _b64encode(ciphertext), _b64encode(nonce)


def decrypt_provider_secret(record: ProviderSecret) -> str:
    if record.algorithm != ALGORITHM or record.key_version != KEY_VERSION:
        return ""
    try:
        plaintext = AESGCM(_derive_key()).decrypt(
            _b64decode(record.nonce),
            _b64decode(record.encrypted_value),
            _associated_data(record.provider_id),
        )
        return plaintext.decode("utf-8")
    except Exception:
        return ""


def _derive_key() -> bytes:
    material = settings.modelgate_secret_key
    if not material:
        if settings.app_env.lower() == "production":
            raise RuntimeError("MODELGATE_SECRET_KEY is required for encrypted provider key storage.")
        material = DEV_SECRET_MATERIAL
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=HKDF_SALT,
        info=HKDF_INFO,
    ).derive(material.encode("utf-8"))


def _associated_data(provider_id: str) -> bytes:
    return f"modelgate-provider-secret:{provider_id}".encode()


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value.encode("ascii"))
