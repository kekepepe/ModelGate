from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.logging import redact
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
        "request": redact(record.request_json),
        "response": redact(record.response_json),
        "statusCode": record.status_code,
        "latencyMs": record.latency_ms,
        "errorType": record.error_type,
        "errorMessage": redact(record.error_message),
        "createdAt": record.created_at.isoformat() if record.created_at else None,
    }


@router.get("/requests")
async def list_request_logs(
    db: Session = Depends(get_db),
    providerId: str | None = Query(default=None, description="Filter by provider id (e.g. mimo, minimax)."),
    recordType: str | None = Query(default=None, description="Filter by record type (run, generation_task)."),
    recordId: str | None = Query(default=None, description="Filter by parent record id (run_* or task_*)."),
    limit: int = Query(default=100, ge=1, le=200, description="Maximum number of records to return."),
):
    """List recent request logs with optional server-side filters.

    The v1 history view is a single-user local app, so we keep the response
    bounded (max 200) and let the client scroll rather than paginating.
    """
    stmt = select(RequestLog).order_by(desc(RequestLog.created_at))
    if providerId:
        stmt = stmt.where(RequestLog.provider_id == providerId)
    if recordType:
        stmt = stmt.where(RequestLog.record_type == recordType)
    if recordId:
        stmt = stmt.where(RequestLog.record_id == recordId)
    stmt = stmt.limit(limit)
    records = db.scalars(stmt).all()
    return {"data": [serialize_request_log(record) for record in records]}
