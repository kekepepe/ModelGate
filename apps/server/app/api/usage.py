from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import UsageLog
from app.db.session import get_db

router = APIRouter()


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
