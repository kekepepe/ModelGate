from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import RequestLog
from app.db.session import get_db

router = APIRouter()


def serialize_request_log(record: RequestLog) -> dict:
    return {
        "id": record.id,
        "recordType": record.record_type,
        "recordId": record.record_id,
        "providerId": record.provider_id,
        "modelId": record.model_id,
        "request": record.request_json,
        "response": record.response_json,
        "statusCode": record.status_code,
        "latencyMs": record.latency_ms,
        "errorType": record.error_type,
        "errorMessage": record.error_message,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
    }


@router.get("/requests")
async def list_request_logs(db: Session = Depends(get_db)):
    records = db.scalars(select(RequestLog).order_by(desc(RequestLog.created_at)).limit(100)).all()
    return {"data": [serialize_request_log(record) for record in records]}
