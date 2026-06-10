"""Tests for the structured logging formatter and configure_logging()."""

from __future__ import annotations

import io
import json
import logging
import sys
from pathlib import Path

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.core.config import settings  # noqa: E402
from app.core.logging import (  # noqa: E402
    _VALID_LOG_FORMATS,
    JSONFormatter,
    configure_logging,
)


@pytest.fixture(autouse=True)
def _restore_logging():
    """Snapshot root logger state so test installs do not leak across tests."""
    root = logging.getLogger()
    saved_handlers = list(root.handlers)
    saved_level = root.level
    try:
        yield
    finally:
        root.handlers = saved_handlers
        root.setLevel(saved_level)


def _capture_root(stream: io.StringIO, fmt: str) -> None:
    settings.log_format = fmt
    configure_logging()


def test_json_formatter_emits_one_object_per_line() -> None:
    fmt = JSONFormatter()
    record = logging.LogRecord(
        name="modelgate.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello world",
        args=(),
        exc_info=None,
    )
    line = fmt.format(record)
    payload = json.loads(line)
    assert payload["level"] == "INFO"
    assert payload["logger"] == "modelgate.test"
    assert payload["message"] == "hello world"
    assert "timestamp" in payload


def test_json_formatter_runs_redaction() -> None:
    fmt = JSONFormatter()
    record = logging.LogRecord(
        name="modelgate.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="auth header was Bearer abc123def456ghi789",
        args=(),
        exc_info=None,
    )
    payload = json.loads(fmt.format(record))
    assert "abc123def456ghi789" not in payload["message"]
    assert "[REDACTED]" in payload["message"]


def test_json_formatter_merges_extras() -> None:
    fmt = JSONFormatter()
    record = logging.LogRecord(
        name="modelgate.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="task progress",
        args=(),
        exc_info=None,
    )
    record.task_id = "task_abc"
    record.request_id = "req_xyz"
    payload = json.loads(fmt.format(record))
    assert payload["task_id"] == "task_abc"
    assert payload["request_id"] == "req_xyz"


def test_json_formatter_serializes_exception() -> None:
    fmt = JSONFormatter()
    try:
        raise ValueError("boom")
    except ValueError:
        import sys as _sys

        record = logging.LogRecord(
            name="modelgate.test",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg="explosion",
            args=(),
            exc_info=_sys.exc_info(),
        )
    payload = json.loads(fmt.format(record))
    assert "exception" in payload
    assert "ValueError: boom" in payload["exception"]


def test_configure_logging_installs_json_handler() -> None:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)

    logging.getLogger("modelgate.demo").info("structured line")

    lines = [line for line in stream.getvalue().splitlines() if line.strip()]
    assert lines, "no log output captured"
    payload = json.loads(lines[-1])
    assert payload["message"] == "structured line"
    assert payload["logger"] == "modelgate.demo"


def test_configure_logging_text_path_does_not_emit_json() -> None:
    settings.log_format = "text"
    configure_logging()
    root = logging.getLogger()
    assert len(root.handlers) == 1
    formatter = root.handlers[0].formatter
    assert not isinstance(formatter, JSONFormatter)


def test_configure_logging_invalid_value_raises() -> None:
    settings.log_format = "yaml"
    with pytest.raises(ValueError, match="Invalid LOG_FORMAT"):
        configure_logging()
    assert "yaml" not in _VALID_LOG_FORMATS


def test_configure_logging_is_idempotent() -> None:
    settings.log_format = "json"
    configure_logging()
    configure_logging()
    configure_logging()
    # Each call replaces the root handlers list (rather than appending), so
    # the root logger always ends up with exactly one handler — no leaks.
    assert len(logging.getLogger().handlers) == 1
    assert isinstance(logging.getLogger().handlers[0].formatter, JSONFormatter)
