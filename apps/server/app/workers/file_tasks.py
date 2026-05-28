from pathlib import Path

from app.db.models import FileRecord
from app.db.session import SessionLocal
from app.services.file_parser import parse_uploaded_file
from app.workers.celery_app import celery_app


@celery_app.task(name="file.parse")
def parse_file(file_id: str) -> dict:
    with SessionLocal() as db:
        record = db.get(FileRecord, file_id)
        if record is None or record.status == "deleted":
            return {"fileId": file_id, "status": "not_found"}

        record.status = "parsing"
        record.error_message = None
        db.commit()

        metadata = record.metadata_json or {}
        parse_result = parse_uploaded_file(
            stored_path=Path(record.stored_path),
            original_name=record.original_name,
            mime_type=record.mime_type,
            detected_type=record.detected_type,
            safe_extension=metadata.get("extension", Path(record.original_name).suffix.lower()),
        )
        record.status = parse_result.status
        record.direct_usable = parse_result.direct_usable
        record.metadata_json = metadata | parse_result.metadata
        record.preview_path = parse_result.preview_path
        record.error_message = parse_result.error_message
        db.commit()
        return {"fileId": file_id, "status": record.status}
