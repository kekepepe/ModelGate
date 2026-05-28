from datetime import datetime
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.db.models import FileRecord
from app.db.session import get_db
from app.services.file_parser import parse_uploaded_file
from app.services.file_validation import validate_upload

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
        select(func.coalesce(func.sum(FileRecord.size_bytes), 0)).where(FileRecord.status != "deleted")
    ).scalar_one()
    validated = validate_upload(
        original_name=file.filename,
        content_type=file.content_type,
        content=content,
        current_total_bytes=int(current_total_bytes),
    )

    file_id = f"file_{uuid4().hex}"
    stored_path = _dated_upload_root() / f"{file_id}{validated.safe_extension}"
    stored_path.write_bytes(content)

    initial_metadata = {
        "originalName": validated.original_name,
        "extension": validated.safe_extension,
        "storage": "local",
    }

    record = FileRecord(
        id=file_id,
        original_name=validated.original_name,
        stored_path=str(stored_path),
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
        stored_path=stored_path,
        original_name=validated.original_name,
        mime_type=validated.mime_type,
        detected_type=validated.detected_type,
        safe_extension=validated.safe_extension,
    )
    record.status = parse_result.status
    record.direct_usable = parse_result.direct_usable
    record.metadata_json = initial_metadata | parse_result.metadata
    record.preview_path = parse_result.preview_path
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

    path = Path(record.preview_path or record.stored_path)
    if not path.exists():
        raise AppError("FILE_PREVIEW_NOT_FOUND", f"Preview not found: {file_id}", status_code=404)

    metadata = record.metadata_json or {}
    is_attachment = record.mime_type in {"image/svg+xml", "text/html"} or metadata.get("extension") in {
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


@router.delete("/{file_id}")
async def delete_file(file_id: str, db: Session = Depends(get_db)):
    record = db.get(FileRecord, file_id)
    if record is None or record.status == "deleted":
        raise AppError("FILE_NOT_FOUND", f"File not found: {file_id}", status_code=404)

    record.status = "deleted"
    path = Path(record.stored_path)
    if path.exists():
        path.unlink()
    db.commit()

    return {"data": serialize_file(record)}


def _dated_upload_root() -> Path:
    now = datetime.utcnow()
    upload_root = Path(settings.uploads_dir) / f"{now:%Y}" / f"{now:%m}"
    upload_root.mkdir(parents=True, exist_ok=True)
    upload_root.chmod(0o700)
    return upload_root
