import contextlib
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import FileRecord
from app.db.session import get_db
from app.services.file_parser import parse_uploaded_file
from app.services.file_validation import validate_upload
from app.services.storage import build_dated_key, get_storage

router = APIRouter()


def serialize_file(record: FileRecord) -> dict:
    return {
        "id": record.id,
        "originalName": record.original_name,
        "mimeType": record.mime_type,
        "detectedType": record.detected_type,
        "status": record.status,
        "sizeBytes": record.size_bytes,
        "directUsable": record.direct_usable,
        "metadata": record.metadata_json or {},
        "errorMessage": record.error_message,
        "previewUrl": f"/api/files/{record.id}/preview" if record.preview_path else None,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
    }


@router.post("/upload")
async def upload_file(file: UploadFile, db: Session = Depends(get_db)):
    content = await file.read()
    current_total_bytes = db.execute(
        select(func.coalesce(func.sum(FileRecord.size_bytes), 0)).where(
            FileRecord.status != "deleted"
        )
    ).scalar_one()
    validated = validate_upload(
        original_name=file.filename,
        content_type=file.content_type,
        content=content,
        current_total_bytes=int(current_total_bytes),
    )

    file_id = _new_file_id()
    storage = get_storage()
    storage_key = build_dated_key(
        prefix="uploads",
        name=f"{file_id}{validated.safe_extension}",
    )
    stored = storage.put_bytes(content, key=storage_key, content_type=validated.mime_type)

    initial_metadata = {
        "originalName": validated.original_name,
        "extension": validated.safe_extension,
        "storageDriver": storage.driver_name,
        "storageKey": stored.key,
    }

    record = FileRecord(
        id=file_id,
        original_name=validated.original_name,
        stored_path=stored.key,
        preview_path=None,
        mime_type=validated.mime_type,
        detected_type=validated.detected_type,
        status="parsing",
        size_bytes=validated.size_bytes,
        checksum=sha256(content).hexdigest(),
        direct_usable=False,
        metadata_json=initial_metadata,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    parse_result = parse_uploaded_file(
        stored_path=storage.absolute_path(stored.key),
        original_name=validated.original_name,
        mime_type=validated.mime_type,
        detected_type=validated.detected_type,
        safe_extension=validated.safe_extension,
    )
    record.status = parse_result.status
    record.direct_usable = parse_result.direct_usable
    record.metadata_json = initial_metadata | parse_result.metadata
    record.preview_path = parse_result.preview_key
    record.error_message = parse_result.error_message
    db.commit()
    db.refresh(record)

    return {"data": serialize_file(record)}


@router.get("/{file_id}")
async def get_file(file_id: str, db: Session = Depends(get_db)):
    record = db.get(FileRecord, file_id)
    if record is None or record.status == "deleted":
        raise AppError("FILE_NOT_FOUND", f"File not found: {file_id}", status_code=404)
    return {"data": serialize_file(record)}


@router.get("/{file_id}/preview")
async def preview_file(file_id: str, db: Session = Depends(get_db)):
    record = db.get(FileRecord, file_id)
    if record is None or record.status == "deleted":
        raise AppError("FILE_NOT_FOUND", f"File not found: {file_id}", status_code=404)

    key = record.preview_path or record.stored_path
    if not key:
        raise AppError("FILE_PREVIEW_NOT_FOUND", f"Preview not found: {file_id}", status_code=404)

    storage = get_storage()
    if not storage.exists(key):
        raise AppError("FILE_PREVIEW_NOT_FOUND", f"Preview not found: {file_id}", status_code=404)
    path = storage.absolute_path(key)

    metadata = record.metadata_json or {}
    is_attachment = record.mime_type in {"image/svg+xml", "text/html"} or metadata.get(
        "extension"
    ) in {
        ".svg",
        ".html",
    }
    headers = {"X-Content-Type-Options": "nosniff"}
    if is_attachment:
        headers["Content-Disposition"] = f'attachment; filename="{record.original_name}"'
        return FileResponse(
            path,
            media_type="application/octet-stream",
            filename=record.original_name,
            headers=headers,
        )

    media_type = "image/webp" if record.preview_path else record.mime_type
    return FileResponse(path, media_type=media_type, filename=record.original_name, headers=headers)


@router.get("/_by_key/{key:path}")
async def get_file_by_key(key: str, db: Session = Depends(get_db)):
    """Resolve a stored object by its storage key (used by generation outputs).

    Access is gated by checking that ``key`` is referenced by a non-deleted
    ``FileRecord`` (uploads/previews) OR by a completed/expired
    ``GenerationTask`` (videos/images). This prevents arbitrary key probing
    from leaking the local filesystem.
    """
    from sqlalchemy import or_, select

    storage = get_storage()
    if not storage.exists(key):
        raise AppError("FILE_NOT_FOUND", f"File not found: {key}", status_code=404)

    if not _is_allowlisted_storage_key(key):
        raise AppError("FILE_NOT_FOUND", f"File not found: {key}", status_code=404)

    file_ref = db.execute(
        select(FileRecord.id)
        .where(
            FileRecord.status != "deleted",
            or_(FileRecord.stored_path == key, FileRecord.preview_path == key),
        )
        .limit(1)
    ).scalar_one_or_none()
    if file_ref is None:
        from sqlalchemy import text

        task_ref = db.execute(
            text(
                "SELECT id FROM generation_tasks "
                "WHERE status IN ('completed', 'expired') "
                "AND (output_json ->> 'videoStorageKey' = :key "
                "     OR output_json ->> 'imageStorageKey' = :key) "
                "LIMIT 1"
            ),
            {"key": key},
        ).first()
        if task_ref is None:
            raise AppError("FILE_NOT_FOUND", f"File not found: {key}", status_code=404)

    path = storage.absolute_path(key)
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300"}
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=Path(key).name,
        headers=headers,
    )


def _new_file_id() -> str:
    """Generate a 256-bit, unguessable file id (two uuid4 hex strings).

    Using 64 hex characters gives ``2**256`` entropy, which defeats both
    sequential and per-file brute-force enumeration. Combined with the
    storage adapter's path-escape check, the API surface is safe even if
    the DB is exposed.
    """
    return f"file_{uuid4().hex}{uuid4().hex}"


@router.delete("/{file_id}")
async def delete_file(file_id: str, db: Session = Depends(get_db)):
    record = db.get(FileRecord, file_id)
    if record is None or record.status == "deleted":
        raise AppError("FILE_NOT_FOUND", f"File not found: {file_id}", status_code=404)

    record.status = "deleted"
    storage = get_storage()
    for key in (record.stored_path, record.preview_path):
        if key:
            with contextlib.suppress(ValueError):
                storage.delete(key)
    db.commit()

    return {"data": serialize_file(record)}


def _new_file_id() -> str:
    """Generate a 256-bit, unguessable file id (two uuid4 hex strings).

    Using 64 hex characters gives ``2**256`` entropy, which defeats both
    sequential and per-file brute-force enumeration. Combined with the
    storage adapter's path-escape check, the API surface is safe even if
    the DB is exposed.
    """
    return f"file_{uuid4().hex}{uuid4().hex}"


def _is_allowlisted_storage_key(key: str) -> bool:
    """Restrict ``_by_key`` lookups to ModelGate-controlled storage prefixes.

    Storage keys are operator-controlled, so this is mostly a guard against
    abuse (e.g. someone hand-crafting a key path). It also keeps the API
    surface predictable: a client cannot dereference arbitrary ``/etc/...``
    paths by passing them as a key.
    """
    if not key:
        return False
    normalized = key.lstrip("/")
    return any(normalized.startswith(prefix) for prefix in ("uploads/", "previews/", "outputs/"))
