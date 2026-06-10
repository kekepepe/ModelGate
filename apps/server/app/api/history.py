from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.chat import serialize_run
from app.api.generation import serialize_task
from app.core.errors import AppError
from app.db.models import GenerationTask, Run
from app.db.session import get_db

router = APIRouter()


@router.get("/runs")
async def list_runs(db: Session = Depends(get_db)):
    records = db.scalars(select(Run).order_by(desc(Run.created_at)).limit(50)).all()
    return {"data": [serialize_run(record) for record in records]}


@router.get("/generation-tasks")
async def list_generation_tasks(db: Session = Depends(get_db)):
    records = db.scalars(
        select(GenerationTask).order_by(desc(GenerationTask.created_at)).limit(50)
    ).all()
    return {"data": [serialize_task(record) for record in records]}


@router.get("/{record_id}")
async def get_history_record(record_id: str, db: Session = Depends(get_db)):
    if record_id.startswith("run_"):
        record = db.get(Run, record_id)
        if record:
            return {"data": {"recordType": "run", **serialize_run(record)}}
    if record_id.startswith("task_"):
        record = db.get(GenerationTask, record_id)
        if record:
            return {"data": {"recordType": "generation_task", **serialize_task(record)}}
    raise AppError("HISTORY_RECORD_NOT_FOUND", f"History record not found: {record_id}", 404)


@router.delete("/{record_id}")
async def delete_history_record(record_id: str, db: Session = Depends(get_db)):
    if record_id.startswith("run_"):
        record = db.get(Run, record_id)
    else:
        record = db.get(GenerationTask, record_id)
    if record is None:
        raise AppError("HISTORY_RECORD_NOT_FOUND", f"History record not found: {record_id}", 404)
    db.delete(record)
    db.commit()
    return {"data": {"deleted": True, "id": record_id}}
