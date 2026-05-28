from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.db.models import FileRecord
from app.db.session import get_db

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
        "createdAt": record.created_at.isoformat() if record.created_at else None,
    }


def detect_type(filename: str, content_type: str | None) -> str:
    suffix = Path(filename).suffix.lower()
    mime = content_type or ""
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    if suffix in {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".sql", ".css", ".html"}:
        return "code"
    if suffix in {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt"}:
        return "document"
    return "file"


@router.post("/upload")
async def upload_file(file: UploadFile, db: Session = Depends(get_db)):
    upload_root = Path(settings.uploads_dir)
    upload_root.mkdir(parents=True, exist_ok=True)

    original_name = file.filename or "upload.bin"
    suffix = Path(original_name).suffix.lower()
    file_id = f"file_{uuid4().hex}"
    stored_path = upload_root / f"{file_id}{suffix}"

    content = await file.read()
    stored_path.write_bytes(content)

    record = FileRecord(
        id=file_id,
        original_name=original_name,
        stored_path=str(stored_path),
        preview_path=None,
        mime_type=file.content_type or "application/octet-stream",
        detected_type=detect_type(original_name, file.content_type),
        status="uploaded",
        size_bytes=len(content),
        checksum=None,
        direct_usable=True,
        metadata_json={"extension": suffix},
    )
    db.add(record)
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
    if record.mime_type in {"image/svg+xml", "text/html"}:
        raise AppError("FILE_PREVIEW_UNSAFE", "This file type cannot be previewed inline.", 400)

    return FileResponse(path, media_type=record.mime_type, filename=record.original_name)


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
