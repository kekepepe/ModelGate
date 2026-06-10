from __future__ import annotations

import json
import logging
import re
import sys
from datetime import UTC, datetime
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
_VALID_LOG_FORMATS = {"text", "json"}


def configure_logging() -> None:
    """Install the application-wide logging handlers.

    Honors ``settings.log_format`` (``text`` or ``json``) and
    ``settings.log_level``. Idempotent: a second call only swaps the
    handler on the root logger, it does not duplicate handlers.
    """
    fmt = settings.log_format.lower()
    if fmt not in _VALID_LOG_FORMATS:
        raise ValueError(
            f"Invalid LOG_FORMAT: {settings.log_format!r}. Expected one of: {sorted(_VALID_LOG_FORMATS)}"
        )

    handler: logging.Handler
    if fmt == "json":
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
    else:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s :: %(message)s"))

    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)


class JSONFormatter(logging.Formatter):
    """Render log records as one JSON object per line.

    Reserved keys (``timestamp``, ``level``, ``logger``, ``message``) are
    emitted on every record. Any extra fields passed via
    ``logger.info("msg", extra={"k": "v"})`` are merged in. The message
    body is run through :func:`redact_text` so secrets leaked into log
    format strings are scrubbed before emission.
    """

    RESERVED_KEYS = frozenset(
        {
            "name",
            "msg",
            "args",
            "levelname",
            "levelno",
            "pathname",
            "filename",
            "module",
            "exc_info",
            "exc_text",
            "stack_info",
            "lineno",
            "funcName",
            "created",
            "msecs",
            "relativeCreated",
            "thread",
            "threadName",
            "processName",
            "process",
            "asctime",
            "message",
            "taskName",
        }
    )

    def format(self, record: logging.LogRecord) -> str:
        timestamp = datetime.fromtimestamp(record.created, tz=UTC).isoformat()
        payload: dict[str, Any] = {
            "timestamp": timestamp,
            "level": record.levelname,
            "logger": record.name,
            "message": redact_text(record.getMessage()),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)

        for key, value in record.__dict__.items():
            if key in self.RESERVED_KEYS or key.startswith("_"):
                continue
            payload[key] = _safe_json_value(value)

        return json.dumps(payload, ensure_ascii=False, default=str)


def _safe_json_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    if isinstance(value, dict):
        return {str(k): _safe_json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_safe_json_value(v) for v in value]
    return str(value)


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
    redacted = re.sub(
        r"(?i)(api[-_]?key\s*[:=]\s*)[A-Za-z0-9._\-+/=]{8,}", r"\1[REDACTED]", redacted
    )
    redacted = _redact_workspace_paths(redacted)
    return redacted


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("_", "-")
    return normalized in {item.replace("_", "-") for item in SENSITIVE_KEYS}


def _configured_secrets() -> list[str]:
    secrets = [
        settings.mimo_api_key,
        settings.minimax_api_key,
        settings.volcengine_api_key,
        settings.moonshot_api_key,
        settings.zhipu_api_key,
    ]
    try:
        from app.services.provider_secrets import list_local_provider_secrets

        secrets.extend(list_local_provider_secrets())
    except Exception:
        pass
    return secrets


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
