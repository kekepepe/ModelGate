from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, delete, desc, func, select
from sqlalchemy.orm import Session

from app.core.logging import redact
from app.db.models import (
    GenerationTask,
    Model,
    Provider,
    RequestLog,
    Run,
    UsageLog,
)
from app.db.session import get_db

router = APIRouter()

_FAILED_BUCKETS = (
    "failed",
    "timeout",
    "rate_limited",
    "invalid_params",
    "invalid_api_key",
    "cancelled",
)


def _apply_date_range(stmt, start: datetime | None, end: datetime | None, col=UsageLog.created_at):
    if start is not None:
        stmt = stmt.where(col >= start)
    if end is not None:
        stmt = stmt.where(col < end)
    return stmt


def _parent_joins(stmt):
    """LEFT JOIN the parent record (Run OR GenerationTask) for each UsageLog row.

    `UsageLog` is linked polymorphically via (record_type, record_id). At most one
    of the two joins matches because `record_type` is either 'run' or
    'generation_task'. We coalesce the parent columns so a single set of labels
    is usable downstream.
    """
    return stmt.outerjoin(
        Run,
        and_(UsageLog.record_type == "run", Run.id == UsageLog.record_id),
    ).outerjoin(
        GenerationTask,
        and_(
            UsageLog.record_type == "generation_task",
            GenerationTask.id == UsageLog.record_id,
        ),
    )


def _parent_columns():
    return [
        func.coalesce(Run.task_type, GenerationTask.task_type).label("task_type"),
        func.coalesce(Run.status, GenerationTask.status).label("parent_status"),
        func.coalesce(Run.error_type, GenerationTask.error_type).label("error_type"),
        func.coalesce(Run.error_message, GenerationTask.error_message).label(
            "parent_error_message"
        ),
        func.coalesce(Run.started_at, GenerationTask.started_at).label("started_at"),
        func.coalesce(Run.completed_at, GenerationTask.completed_at).label("completed_at"),
    ]


def _latency_seconds(started_col, completed_col):
    """Return a SQL expression for wall-clock seconds between two timestamps."""
    return func.extract("epoch", completed_col - started_col)


def _status_bucket(parent_status_col, error_type_col):
    """Normalize (parent_status, error_type) into the buckets listed in the
    Usage page design doc (Success / Failed / Timeout / Rate Limited / Invalid
    Params / Invalid API Key) plus a couple of internal states (running,
    cancelled) that are useful for debugging.
    """
    return case(
        (parent_status_col == "completed", "success"),
        (parent_status_col == "running", "running"),
        (parent_status_col == "cancelled", "cancelled"),
        (parent_status_col != "failed", "failed"),
        (error_type_col == "PROVIDER_TIMEOUT", "timeout"),
        (error_type_col == "PROVIDER_RATE_LIMITED", "rate_limited"),
        (
            error_type_col.in_(
                (
                    "INVALID_API_KEY",
                    "PROVIDER_AUTH_FAILED",
                    "PROVIDER_FORBIDDEN",
                )
            ),
            "invalid_api_key",
        ),
        (
            error_type_col.in_(
                (
                    "PROVIDER_BAD_REQUEST",
                    "INVALID_PARAMS",
                    "INVALID_PROMPT",
                )
            ),
            "invalid_params",
        ),
        else_="failed",
    )


# --- Serializers -----------------------------------------------------------


def _safe_iso(value):
    return value.isoformat() if value else None


def serialize_usage_log(
    row: UsageLog,
    *,
    task_type: str | None,
    status: str | None,
    latency_ms: int | None,
    error_message: str | None,
) -> dict:
    return {
        "id": row.id,
        "recordType": row.record_type,
        "recordId": row.record_id,
        "providerId": row.provider_id,
        "modelId": row.model_id,
        "inputTokens": row.input_tokens,
        "outputTokens": row.output_tokens,
        "totalTokens": row.total_tokens,
        "estimatedCost": float(row.estimated_cost) if row.estimated_cost is not None else None,
        "currency": row.currency,
        "metadata": redact(row.metadata_json),
        "createdAt": _safe_iso(row.created_at),
        "taskType": task_type,
        "status": status,
        "latencyMs": latency_ms,
        "errorMessage": error_message,
    }


def serialize_model_usage_row(row) -> dict:
    """Shape one (model, provider) row from `get_usage_models` aggregation.

    `row` is a SQLAlchemy Row produced by the GROUP BY query in
    `get_usage_models`; field access goes through column labels
    (`model_id`, `provider_id`, `provider_name`, `total_requests`,
    `sum_total`, `sum_cost`, `success_requests`, `failed_requests`,
    `sum_latency_seconds`).
    """
    requests = int(row.total_requests or 0)
    return {
        "model": row.model_name or row.model_id,
        "modelId": row.model_id,
        "provider": row.provider_name or row.provider_id,
        "providerId": row.provider_id,
        "requests": requests,
        "tokens": int(row.sum_total or 0),
        "cost": float(row.sum_cost or 0),
        "successRate": ((int(row.success_requests or 0) / requests) if requests else 0.0),
        "avgLatencyMs": (
            int((float(row.sum_latency_seconds or 0) / requests) * 1000) if requests else None
        ),
    }


def _serialize_run(run: Run | None, task: GenerationTask | None) -> dict:
    if run is not None:
        return {
            "recordKind": "run",
            "taskType": run.task_type,
            "status": run.status,
            "errorType": run.error_type,
            "errorMessage": run.error_message,
            "startedAt": _safe_iso(run.started_at),
            "completedAt": _safe_iso(run.completed_at),
            "input": redact(run.input_json),
            "params": redact(run.params_json),
            "output": redact(run.output_json),
            "idempotencyKey": run.idempotency_key,
        }
    if task is not None:
        return {
            "recordKind": "generation_task",
            "taskType": task.task_type,
            "status": task.status,
            "errorType": task.error_type,
            "errorMessage": task.error_message,
            "startedAt": _safe_iso(task.started_at),
            "completedAt": _safe_iso(task.completed_at),
            "progress": task.progress,
            "providerStatus": task.provider_status,
            "input": redact(task.input_json),
            "params": redact(task.params_json),
            "output": redact(task.output_json),
            "idempotencyKey": task.idempotency_key,
        }
    return {}


def _serialize_request_log(log: RequestLog) -> dict:
    return {
        "id": log.id,
        "providerId": log.provider_id,
        "modelId": log.model_id,
        "statusCode": log.status_code,
        "latencyMs": log.latency_ms,
        "errorType": log.error_type,
        "errorMessage": log.error_message,
        "request": redact(log.request_json),
        "response": redact(log.response_json),
        "createdAt": _safe_iso(log.created_at),
    }


# --- Endpoints -------------------------------------------------------------


@router.get("/summary")
async def get_usage_summary(
    startDate: datetime | None = Query(default=None, alias="startDate"),
    endDate: datetime | None = Query(default=None, alias="endDate"),
    db: Session = Depends(get_db),
):
    status_col = _status_bucket(
        func.coalesce(Run.status, GenerationTask.status),
        func.coalesce(Run.error_type, GenerationTask.error_type),
    ).label("status_bucket")

    aggregate_stmt = _parent_joins(
        select(
            func.coalesce(func.sum(UsageLog.input_tokens), 0),
            func.coalesce(func.sum(UsageLog.output_tokens), 0),
            func.coalesce(func.sum(UsageLog.total_tokens), 0),
            func.coalesce(func.sum(UsageLog.estimated_cost), 0),
            func.count(UsageLog.id),
            func.coalesce(
                func.sum(
                    _latency_seconds(
                        func.coalesce(Run.started_at, GenerationTask.started_at),
                        func.coalesce(Run.completed_at, GenerationTask.completed_at),
                    )
                ),
                0,
            ).label("sum_latency_seconds"),
            status_col,
        )
    )
    aggregate_stmt = _apply_date_range(aggregate_stmt, startDate, endDate)
    aggregate_stmt = aggregate_stmt.group_by(status_col)

    rows = db.execute(aggregate_stmt).all()

    total_input = 0
    total_output = 0
    total_tokens = 0
    total_cost = 0.0
    total_requests = 0
    total_latency_sec = 0.0
    failed_requests = 0
    success_requests = 0

    for r in rows:
        total_input += int(r[0] or 0)
        total_output += int(r[1] or 0)
        total_tokens += int(r[2] or 0)
        total_cost += float(r[3] or 0)
        count = int(r[4] or 0)
        total_requests += count
        total_latency_sec += float(r.sum_latency_seconds or 0)
        if r.status_bucket in _FAILED_BUCKETS:
            failed_requests += count
        if r.status_bucket == "success":
            success_requests += count

    success_rate = (success_requests / total_requests) if total_requests else 0.0
    avg_latency_ms = int((total_latency_sec / total_requests) * 1000) if total_requests else None

    return {
        "data": {
            "inputTokens": total_input,
            "outputTokens": total_output,
            "totalTokens": total_tokens,
            "estimatedCost": total_cost,
            "totalRequests": total_requests,
            "successRate": success_rate,
            "failedRequests": failed_requests,
            "avgLatencyMs": avg_latency_ms,
        }
    }


@router.get("/daily")
async def get_usage_daily(
    startDate: datetime | None = Query(default=None, alias="startDate"),
    endDate: datetime | None = Query(default=None, alias="endDate"),
    db: Session = Depends(get_db),
):
    day_bucket = func.date_trunc("day", UsageLog.created_at).label("day")
    status_col = _status_bucket(
        func.coalesce(Run.status, GenerationTask.status),
        func.coalesce(Run.error_type, GenerationTask.error_type),
    ).label("status_bucket")

    base = _parent_joins(
        select(
            day_bucket,
            func.coalesce(func.sum(UsageLog.total_tokens), 0).label("sum_total"),
            func.coalesce(func.sum(UsageLog.estimated_cost), 0).label("sum_cost"),
            func.count(UsageLog.id).label("total_requests"),
            status_col,
        )
    )
    base = _apply_date_range(base, startDate, endDate)
    base = base.group_by(day_bucket, status_col).order_by(day_bucket)

    rows = db.execute(base).all()

    daily: dict[str, dict[str, Any]] = {}
    for r in rows:
        day_key = r.day.date().isoformat() if r.day else None
        if not day_key:
            continue
        bucket = daily.setdefault(
            day_key,
            {
                "date": day_key,
                "requests": 0,
                "tokens": 0,
                "cost": 0.0,
                "failedRequests": 0,
                "successRate": 0.0,
            },
        )
        count = int(r.total_requests or 0)
        bucket["requests"] += count
        bucket["tokens"] += int(r.sum_total or 0)
        bucket["cost"] += float(r.sum_cost or 0)
        if r.status_bucket in _FAILED_BUCKETS:
            bucket["failedRequests"] += count

    for bucket in daily.values():
        if bucket["requests"]:
            success = bucket["requests"] - bucket["failedRequests"]
            bucket["successRate"] = success / bucket["requests"]

    return {"data": sorted(daily.values(), key=lambda b: b["date"])}


@router.get("/providers")
async def get_usage_providers(
    startDate: datetime | None = Query(default=None, alias="startDate"),
    endDate: datetime | None = Query(default=None, alias="endDate"),
    db: Session = Depends(get_db),
):
    base = select(
        UsageLog.provider_id.label("provider_id"),
        func.coalesce(Provider.name, UsageLog.provider_id).label("provider_name"),
        func.coalesce(func.sum(UsageLog.total_tokens), 0).label("sum_total"),
        func.coalesce(func.sum(UsageLog.estimated_cost), 0).label("sum_cost"),
        func.count(UsageLog.id).label("total_requests"),
    ).outerjoin(Provider, Provider.id == UsageLog.provider_id)
    base = _apply_date_range(base, startDate, endDate)
    base = base.group_by(UsageLog.provider_id, Provider.name).order_by(desc("total_requests"))

    rows = db.execute(base).all()
    total = sum(int(r.total_requests or 0) for r in rows) or 1

    return {
        "data": [
            {
                "provider": r.provider_name or r.provider_id,
                "providerId": r.provider_id,
                "requests": int(r.total_requests or 0),
                "tokens": int(r.sum_total or 0),
                "cost": float(r.sum_cost or 0),
                "percentage": round((int(r.total_requests or 0) / total) * 100, 1),
            }
            for r in rows
        ]
    }


@router.get("/models")
async def get_usage_models(
    startDate: datetime | None = Query(default=None, alias="startDate"),
    endDate: datetime | None = Query(default=None, alias="endDate"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    status_col = _status_bucket(
        func.coalesce(Run.status, GenerationTask.status),
        func.coalesce(Run.error_type, GenerationTask.error_type),
    ).label("status_bucket")

    base = _parent_joins(
        select(
            UsageLog.model_id.label("model_id"),
            func.coalesce(Model.display_name, Model.official_model_name, UsageLog.model_id).label(
                "model_name"
            ),
            UsageLog.provider_id.label("provider_id"),
            func.coalesce(Provider.name, UsageLog.provider_id).label("provider_name"),
            func.coalesce(func.sum(UsageLog.total_tokens), 0).label("sum_total"),
            func.coalesce(func.sum(UsageLog.estimated_cost), 0).label("sum_cost"),
            func.count(UsageLog.id).label("total_requests"),
            func.coalesce(
                func.sum(case((status_col == "success", 1), else_=0)),
                0,
            ).label("success_requests"),
            func.coalesce(
                func.sum(case((status_col.in_(_FAILED_BUCKETS), 1), else_=0)),
                0,
            ).label("failed_requests"),
            func.coalesce(
                func.sum(
                    _latency_seconds(
                        func.coalesce(Run.started_at, GenerationTask.started_at),
                        func.coalesce(Run.completed_at, GenerationTask.completed_at),
                    )
                ),
                0,
            ).label("sum_latency_seconds"),
        )
        .outerjoin(Model, Model.id == UsageLog.model_id)
        .outerjoin(Provider, Provider.id == UsageLog.provider_id)
    )
    base = base.where(UsageLog.model_id.is_not(None))
    base = _apply_date_range(base, startDate, endDate)
    base = base.group_by(
        UsageLog.model_id,
        UsageLog.provider_id,
        Model.display_name,
        Model.official_model_name,
        Provider.name,
    ).order_by(desc("total_requests"))

    rows = db.execute(base).all()
    return {"data": [serialize_model_usage_row(r) for r in rows[:limit]]}


@router.get("/logs")
async def list_usage_logs(
    startDate: datetime | None = Query(default=None, alias="startDate"),
    endDate: datetime | None = Query(default=None, alias="endDate"),
    compareGroupId: str | None = Query(default=None, alias="compareGroupId"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    status_col = _status_bucket(
        func.coalesce(Run.status, GenerationTask.status),
        func.coalesce(Run.error_type, GenerationTask.error_type),
    ).label("status_bucket")

    latency_col = _latency_seconds(
        func.coalesce(Run.started_at, GenerationTask.started_at),
        func.coalesce(Run.completed_at, GenerationTask.completed_at),
    ).label("latency_seconds")

    base = _parent_joins(select(UsageLog, *_parent_columns(), status_col, latency_col))
    base = _apply_date_range(base, startDate, endDate)
    if compareGroupId:
        base = base.where(
            UsageLog.record_type == "run",
            Run.metadata_json["compare_group_id"].as_string() == compareGroupId,
        )
    base = base.order_by(desc(UsageLog.created_at)).limit(limit).offset(offset)

    rows = db.execute(base).all()
    return {
        "data": [
            serialize_usage_log(
                row.UsageLog,
                task_type=row.task_type,
                status=row.status_bucket,
                latency_ms=(
                    int(row.latency_seconds * 1000) if row.latency_seconds is not None else None
                ),
                error_message=row.parent_error_message,
            )
            for row in rows
        ]
    }


@router.get("/logs/{log_id}")
async def get_usage_log_detail(
    log_id: str,
    db: Session = Depends(get_db),
):
    record = db.get(UsageLog, log_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Usage log not found")

    run: Run | None = None
    task: GenerationTask | None = None
    if record.record_type == "run":
        run = db.get(Run, record.record_id)
    elif record.record_type == "generation_task":
        task = db.get(GenerationTask, record.record_id)

    request_log_stmt = (
        select(RequestLog)
        .where(
            RequestLog.record_type == record.record_type,
            RequestLog.record_id == record.record_id,
        )
        .order_by(desc(RequestLog.created_at))
    )
    request_logs = db.scalars(request_log_stmt).all()

    task_type = (run.task_type if run else None) or (task.task_type if task else None)
    parent_status = (run.status if run else None) or (task.status if task else None)
    error_message = (run.error_message if run else None) or (task.error_message if task else None)
    started_at = (run.started_at if run else None) or (task.started_at if task else None)
    completed_at = (run.completed_at if run else None) or (task.completed_at if task else None)
    latency_ms = (
        int((completed_at - started_at).total_seconds() * 1000)
        if started_at and completed_at
        else None
    )

    return {
        "data": {
            "log": serialize_usage_log(
                record,
                task_type=task_type,
                status=parent_status,
                latency_ms=latency_ms,
                error_message=error_message,
            ),
            "parent": _serialize_run(run, task),
            "requestLogs": [_serialize_request_log(rl) for rl in request_logs],
        }
    }


@router.delete("/logs/{log_id}")
async def delete_usage_log(log_id: str, db: Session = Depends(get_db)):
    record = db.get(UsageLog, log_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Usage log not found")

    deleted = _delete_records_for(db, record.record_type, record.record_id)
    db.delete(record)
    db.commit()

    return {
        "data": {
            "deleted": {
                "usageLogs": 1,
                **deleted,
            }
        }
    }


@router.delete("/logs")
async def delete_usage_logs_batch(
    olderThan: datetime = Query(alias="olderThan"),
    db: Session = Depends(get_db),
):
    stmt = select(UsageLog).where(UsageLog.created_at < olderThan)
    records = db.scalars(stmt).all()

    runs_deleted = 0
    gens_deleted = 0
    req_deleted = 0

    for record in records:
        counts = _delete_records_for(db, record.record_type, record.record_id)
        runs_deleted += counts.get("runs", 0)
        gens_deleted += counts.get("generationTasks", 0)
        req_deleted += counts.get("requestLogs", 0)
        db.delete(record)

    usage_count = len(records)
    db.commit()

    return {
        "data": {
            "deleted": {
                "usageLogs": usage_count,
                "runs": runs_deleted,
                "generationTasks": gens_deleted,
                "requestLogs": req_deleted,
            }
        }
    }


def _delete_records_for(db: Session, record_type: str, record_id: str) -> dict[str, int]:
    """Delete the parent record (Run or GenerationTask) and associated RequestLogs.

    Returns a dict with counts of deleted sub-records.
    """
    runs = 0
    gens = 0

    if record_type == "run":
        parent = db.get(Run, record_id)
        if parent:
            db.delete(parent)
            runs = 1
    elif record_type == "generation_task":
        parent = db.get(GenerationTask, record_id)
        if parent:
            db.delete(parent)
            gens = 1

    req_stmt = delete(RequestLog).where(
        RequestLog.record_type == record_type,
        RequestLog.record_id == record_id,
    )
    result = db.execute(req_stmt)
    req_count = result.rowcount

    return {"runs": runs, "generationTasks": gens, "requestLogs": req_count}


@router.get("/export")
async def export_usage_data(
    scope: str = Query(default="usageLogs"),
    format: str = Query(default="json"),
    olderThan: datetime | None = Query(default=None, alias="olderThan"),
    mask: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    if scope not in ("runs", "requestLogs", "usageLogs"):
        raise HTTPException(status_code=400, detail=f"Invalid scope: {scope}")
    if format not in ("json", "zip"):
        raise HTTPException(status_code=400, detail=f"Invalid format: {format}")

    if scope == "usageLogs":
        rows = _collect_usage_logs(db, olderThan)
        data = [_export_usage_log_row(r, mask=mask) for r in rows]
    elif scope == "runs":
        rows = _collect_runs(db, olderThan)
        data = [_export_run(r, mask=mask) for r in rows]
    else:
        rows = _collect_request_logs(db, olderThan)
        data = [_export_request_log(r, mask=mask) for r in rows]

    if format == "json":
        return {"data": data}

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{scope}.json", json.dumps(data, default=str, ensure_ascii=False))
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={scope}.zip"},
    )


def _mask_text(text: str | None) -> str:
    if not text:
        return ""
    return f"[masked: {len(text)} chars]"


def _mask_dict(d: dict | None) -> dict | None:
    if d is None:
        return None
    masked = {}
    for k, v in d.items():
        if isinstance(v, str) and len(v) > 80:
            masked[k] = _mask_text(v)
        else:
            masked[k] = v
    return masked


def _collect_usage_logs(db: Session, older_than: datetime | None):
    stmt = select(UsageLog).order_by(UsageLog.created_at)
    if older_than:
        stmt = stmt.where(UsageLog.created_at < older_than)
    return db.scalars(stmt).all()


def _collect_runs(db: Session, older_than: datetime | None):
    stmt = select(Run).order_by(Run.created_at)
    if older_than:
        stmt = stmt.where(Run.created_at < older_than)
    return db.scalars(stmt).all()


def _collect_request_logs(db: Session, older_than: datetime | None):
    stmt = select(RequestLog).order_by(RequestLog.created_at)
    if older_than:
        stmt = stmt.where(RequestLog.created_at < older_than)
    return db.scalars(stmt).all()


def _export_usage_log_row(row: UsageLog, *, mask: bool) -> dict:
    return {
        "id": row.id,
        "recordType": row.record_type,
        "recordId": row.record_id,
        "providerId": row.provider_id,
        "modelId": row.model_id,
        "inputTokens": row.input_tokens,
        "outputTokens": row.output_tokens,
        "totalTokens": row.total_tokens,
        "estimatedCost": float(row.estimated_cost) if row.estimated_cost is not None else None,
        "currency": row.currency,
        "metadata": _mask_dict(row.metadata_json) if mask else row.metadata_json,
        "createdAt": _safe_iso(row.created_at),
    }


def _export_run(run: Run, *, mask: bool) -> dict:
    return {
        "id": run.id,
        "taskType": run.task_type,
        "providerId": run.provider_id,
        "modelId": run.model_id,
        "status": run.status,
        "errorType": run.error_type,
        "errorMessage": run.error_message,
        "input": _mask_dict(run.input_json) if mask else run.input_json,
        "params": _mask_dict(run.params_json) if mask else run.params_json,
        "output": _mask_dict(run.output_json) if mask else run.output_json,
        "startedAt": _safe_iso(run.started_at),
        "completedAt": _safe_iso(run.completed_at),
        "createdAt": _safe_iso(run.created_at),
    }


def _export_request_log(log: RequestLog, *, mask: bool) -> dict:
    return {
        "id": log.id,
        "recordType": log.record_type,
        "recordId": log.record_id,
        "providerId": log.provider_id,
        "modelId": log.model_id,
        "statusCode": log.status_code,
        "latencyMs": log.latency_ms,
        "errorType": log.error_type,
        "errorMessage": log.error_message,
        "request": _mask_dict(log.request_json) if mask else log.request_json,
        "response": _mask_dict(log.response_json) if mask else log.response_json,
        "createdAt": _safe_iso(log.created_at),
    }
