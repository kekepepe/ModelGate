from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.core.config import settings


SENSITIVE_KEYS = {
    "authorization",
    "api-key",
    "apikey",
    "api_key",
    "token",
    "secret",
    "password",
    "credential",
    "cookie",
    "set-cookie",
}


PHYSICAL_PATH_KEYS = {
    "stored_path",
    "storedPath",
    "preview_path",
    "previewPath",
    "path",
    "file_path",
    "filePath",
}

REDACTED = "[REDACTED]"


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: (REDACTED if _is_sensitive_key(key) else redact(item))
            for key, item in value.items()
            if key not in PHYSICAL_PATH_KEYS
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


def redact_text(value: str) -> str:
    redacted = value
    for secret in _configured_secrets():
        if secret and len(secret) >= 8:
            redacted = redacted.replace(secret, REDACTED)
    redacted = re.sub(r"(?i)(bearer\s+)[A-Za-z0-9._\-+/=]{8,}", r"\1[REDACTED]", redacted)
    redacted = re.sub(r"(?i)(api[-_]?key\s*[:=]\s*)[A-Za-z0-9._\-+/=]{8,}", r"\1[REDACTED]", redacted)
    redacted = _redact_workspace_paths(redacted)
    return redacted


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("_", "-")
    return normalized in {item.replace("_", "-") for item in SENSITIVE_KEYS}


def _configured_secrets() -> list[str]:
    return [
        settings.mimo_api_key,
        settings.minimax_api_key,
        settings.volcengine_api_key,
        settings.moonshot_api_key,
        settings.zhipu_api_key,
    ]


def _redact_workspace_paths(value: str) -> str:
    candidates = {
        str(Path.cwd()),
        str(Path(settings.storage_root).resolve()) if settings.storage_root else "",
        str(Path(settings.uploads_dir).resolve()) if settings.uploads_dir else "",
        str(Path(settings.outputs_dir).resolve()) if settings.outputs_dir else "",
        str(Path(settings.previews_dir).resolve()) if settings.previews_dir else "",
    }
    redacted = value
    for candidate in sorted((item for item in candidates if item), key=len, reverse=True):
        redacted = redacted.replace(candidate, "[LOCAL_PATH]")
    return redacted
