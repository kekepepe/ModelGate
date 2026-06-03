"""Validate that ``.env.example`` covers every field defined on ``Settings``.

Run from the repository root::

    PYTHONPATH=apps/server python apps/server/scripts/validate_settings.py

Exit codes: 0 on success, 1 on validation errors.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_EXAMPLE = REPO_ROOT / ".env.example"
SETTINGS_PATH = REPO_ROOT / "apps" / "server" / "app" / "core" / "config.py"


def _parse_env_example(text: str) -> set[str]:
    keys: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r"([A-Z0-9_]+)\s*=", line)
        if match:
            keys.add(match.group(1))
    return keys


def _parse_settings_fields(text: str) -> set[str]:
    """Pull the typed Settings field names from the config module.

    Supports the modern ``field: type = default`` syntax used in
    ``app/core/config.py``. We are intentionally permissive — anything
    that looks like a top-level attribute with a ``=`` after the type
    annotation is treated as a field.
    """
    fields: set[str] = set()
    block = re.search(r"class\s+Settings\b.*?(?=^\S|\Z)", text, re.MULTILINE | re.DOTALL)
    if not block:
        return fields
    for match in re.finditer(
        r"^\s{2,4}([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*[^=]+=\s*",
        block.group(0),
        re.MULTILINE,
    ):
        fields.add(match.group(1))
    return fields


def main() -> int:
    if not ENV_EXAMPLE.exists():
        print(f"FAIL: {ENV_EXAMPLE} is missing.")
        return 1
    if not SETTINGS_PATH.exists():
        print(f"FAIL: {SETTINGS_PATH} is missing.")
        return 1

    env_keys = _parse_env_example(ENV_EXAMPLE.read_text(encoding="utf-8"))
    settings_fields = _parse_settings_fields(SETTINGS_PATH.read_text(encoding="utf-8"))

    # Translate Settings field names into the env-var names pydantic-settings
    # would consume. The defaults are case-insensitive: `MIMO_API_KEY`
    # binds to `mimo_api_key`.
    env_field_names = {name.lower() for name in env_keys}
    setting_field_names = {name.lower() for name in settings_fields}

    # `.env.example` legitimately contains docker-compose plumbing (host
    # ports, db credentials, etc.) that is not part of `Settings`. Treat
    # extras as warnings, not failures.
    missing_in_env = sorted(setting_field_names - env_field_names)
    extra_in_env = sorted(env_field_names - setting_field_names)

    errors: list[str] = []
    if missing_in_env:
        errors.append(
            "Settings fields missing from .env.example: "
            + ", ".join(missing_in_env)
        )

    if errors:
        for line in errors:
            print(f"FAIL: {line}")
        return 1

    if extra_in_env:
        print(
            "WARN: .env.example contains keys outside of Settings (likely "
            "docker-compose plumbing): " + ", ".join(extra_in_env)
        )
    print(
        "Settings validation passed: "
        f"{len(env_field_names)} keys in .env.example, "
        f"{len(setting_field_names)} fields in Settings."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
