from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.logging import redact
from app.db.models import UsageLog
from app.db.session import get_db

router = APIRouter()


def serialize_usage_log(record: UsageLog) -> dict:
    return {
        "id": record.id,
        "recordType": record.record_type,
        "recordId": record.record_id,
        "providerId": record.provider_id,
        "modelId": record.model_id,
        "inputTokens": record.input_tokens,
        "outputTokens": record.output_tokens,
        "totalTokens": record.total_tokens,
        "estimatedCost": float(record.estimated_cost) if record.estimated_cost is not None else None,
        "currency": record.currency,
        "metadata": redact(record.metadata_json),
        "createdAt": record.created_at.isoformat() if record.created_at else None,
    }


@router.get("/summary")
async def get_usage_summary(db: Session = Depends(get_db)):
    totals = db.execute(
        select(
            func.coalesce(func.sum(UsageLog.input_tokens), 0),
            func.coalesce(func.sum(UsageLog.output_tokens), 0),
            func.coalesce(func.sum(UsageLog.total_tokens), 0),
            func.coalesce(func.sum(UsageLog.estimated_cost), 0),
        )
    ).one()
    return {
        "data": {
            "inputTokens": int(totals[0]),
            "outputTokens": int(totals[1]),
            "totalTokens": int(totals[2]),
            "estimatedCost": float(totals[3]),
        }
    }


@router.get("/logs")
async def list_usage_logs(db: Session = Depends(get_db)):
    records = db.scalars(select(UsageLog).order_by(desc(UsageLog.created_at)).limit(100)).all()
    return {"data": [serialize_usage_log(record) for record in records]}
