"""Storage adapter abstraction.

A thin Protocol + factory that lets business code reference binary blobs
(uploaded files, parsed previews, generation results) by a stable storage
``key`` instead of an absolute path. The default :class:`LocalStorageAdapter`
writes under ``settings.storage_root`` using a ``YYYY/MM/`` prefix.

Adding S3 / R2 / OSS later only requires a new adapter implementation and a
``settings.storage_driver`` switch — file_parser, file API, and generation
runtime stay untouched.
"""

from __future__ import annotations

import contextlib
import os
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from app.core.config import settings


@dataclass(frozen=True)
class StoredObject:
    key: str
    size_bytes: int
    content_type: str | None = None


class StorageAdapter(Protocol):
    """Storage backend contract."""

    driver_name: str

    def put_bytes(
        self,
        content: bytes,
        *,
        key: str,
        content_type: str | None = None,
    ) -> StoredObject: ...

    def get_path(self, key: str) -> Path: ...

    def exists(self, key: str) -> bool: ...

    def delete(self, key: str) -> bool: ...

    def absolute_path(self, key: str) -> Path: ...


class LocalStorageAdapter:
    driver_name = "local"

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        with contextlib.suppress(OSError):
            self.root.chmod(0o700)

    def _resolve(self, key: str) -> Path:
        if not isinstance(key, str) or not key:
            raise ValueError(f"Storage key must be a non-empty string: {key!r}")
        if "\x00" in key:
            raise ValueError(f"Storage key contains NUL: {key!r}")
        normalized = key.replace("\\", "/").lstrip("/")
        if ".." in normalized.split("/"):
            raise ValueError(f"Storage key contains parent traversal: {key!r}")
        if normalized.startswith("/"):
            raise ValueError(f"Storage key is absolute: {key!r}")
        root = self.root.resolve()
        path = (root / normalized).resolve()
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise ValueError(f"Storage key escapes root: {key!r}") from exc
        return path

    def put_bytes(
        self,
        content: bytes,
        *,
        key: str,
        content_type: str | None = None,
    ) -> StoredObject:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with contextlib.suppress(OSError):
            path.parent.chmod(0o700)
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        with open(tmp_path, "wb") as fh:
            fh.write(content)
        os.replace(tmp_path, path)
        with contextlib.suppress(OSError):
            path.chmod(0o600)
        return StoredObject(key=key, size_bytes=len(content), content_type=content_type)

    def get_path(self, key: str) -> Path:
        return self._resolve(key)

    def absolute_path(self, key: str) -> Path:
        return self._resolve(key)

    def exists(self, key: str) -> bool:
        return self._resolve(key).exists()

    def delete(self, key: str) -> bool:
        path = self._resolve(key)
        if not path.exists():
            return False
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
        return True


def build_dated_key(*, prefix: str, name: str) -> str:
    now = datetime.now(UTC)
    return f"{prefix.rstrip('/')}/{now:%Y}/{now:%m}/{name}"


_storage: StorageAdapter | None = None


def get_storage() -> StorageAdapter:
    """Return the process-wide storage adapter instance."""
    global _storage
    if _storage is not None:
        return _storage

    driver = (settings.storage_driver or "local").lower()
    if driver == "local":
        _storage = LocalStorageAdapter(root=Path(settings.storage_root))
    else:
        raise RuntimeError(
            f"Unknown storage driver {settings.storage_driver!r}. "
            "Set MODELGATE_STORAGE_DRIVER=local or wire a new adapter."
        )
    return _storage


def reset_storage_for_tests(adapter: StorageAdapter | None = None) -> None:
    """Test helper: drop the cached adapter so a different one can be installed."""
    global _storage
    _storage = adapter
