"""Storage adapter + file-id safety tests."""

import sys
from pathlib import Path

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.api.files import _is_allowlisted_storage_key, _new_file_id  # noqa: E402
from app.services.storage import LocalStorageAdapter, build_dated_key  # noqa: E402


def test_new_file_id_has_256_bit_entropy() -> None:
    ids = {_new_file_id() for _ in range(100)}
    assert len(ids) == 100  # uniqueness in 100 draws
    sample = next(iter(ids))
    hex_payload = sample.removeprefix("file_")
    assert len(hex_payload) == 64
    assert all(ch in "0123456789abcdef" for ch in hex_payload)


def test_new_file_id_is_not_sequential() -> None:
    a = _new_file_id()
    b = _new_file_id()
    assert a != b
    # last char should rarely be the same, but assert against any prefix
    # relation that would suggest ordering
    assert a.split("_", 1)[1][:8] != b.split("_", 1)[1][:8]


def test_is_allowlisted_storage_key_accepts_known_namespaces() -> None:
    assert _is_allowlisted_storage_key("uploads/2026/06/x.png")
    assert _is_allowlisted_storage_key("previews/2026/06/x.webp")
    assert _is_allowlisted_storage_key("outputs/videos/2026/06/x.mp4")
    assert _is_allowlisted_storage_key("outputs/images/2026/06/x.png")


def test_is_allowlisted_storage_key_blocks_unrelated_paths() -> None:
    assert not _is_allowlisted_storage_key("")
    assert not _is_allowlisted_storage_key("etc/passwd")
    assert not _is_allowlisted_storage_key("../etc/passwd")
    assert not _is_allowlisted_storage_key("/absolute/etc")
    assert not _is_allowlisted_storage_key("some_random_key")


def test_local_storage_put_bytes_writes_atomic_file(tmp_path: Path) -> None:
    storage = LocalStorageAdapter(root=tmp_path)
    stored = storage.put_bytes(b"hello", key="uploads/2026/06/x.txt")
    assert stored.key == "uploads/2026/06/x.txt"
    target = tmp_path / "uploads" / "2026" / "06" / "x.txt"
    assert target.exists()
    assert target.read_bytes() == b"hello"


def test_local_storage_rejects_path_escape(tmp_path: Path) -> None:
    storage = LocalStorageAdapter(root=tmp_path)
    with pytest.raises(ValueError):
        storage.put_bytes(b"x", key="../../etc/passwd")


def test_local_storage_rejects_dot_dot_in_path(tmp_path: Path) -> None:
    storage = LocalStorageAdapter(root=tmp_path)
    with pytest.raises(ValueError):
        storage.absolute_path("../etc/passwd")
    with pytest.raises(ValueError):
        storage.absolute_path("foo/../../etc/passwd")


def test_local_storage_rejects_empty_or_null_key(tmp_path: Path) -> None:
    storage = LocalStorageAdapter(root=tmp_path)
    with pytest.raises(ValueError):
        storage.absolute_path("")
    with pytest.raises(ValueError):
        storage.absolute_path("foo\x00bar")


def test_local_storage_delete_is_safe(tmp_path: Path) -> None:
    storage = LocalStorageAdapter(root=tmp_path)
    storage.put_bytes(b"x", key="uploads/2026/06/x.txt")
    assert storage.delete("uploads/2026/06/x.txt") is True
    assert storage.delete("uploads/2026/06/x.txt") is False
    with pytest.raises(ValueError):
        storage.delete("../../../etc")


def test_build_dated_key_uses_utc_yyyy_mm() -> None:
    key = build_dated_key(prefix="uploads", name="file_xxx.png")
    parts = key.split("/")
    assert parts[0] == "uploads"
    assert len(parts[1]) == 4 and parts[1].isdigit()
    assert len(parts[2]) == 2 and parts[2].isdigit()
    assert parts[-1] == "file_xxx.png"
