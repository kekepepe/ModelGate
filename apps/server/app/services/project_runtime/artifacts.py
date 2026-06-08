"""Artifact read/write with 1MB cap.

Artifacts are persisted to the ``artifacts`` table. ``content_json`` is
preferred for structured outputs (Planner/Worker/Supervisor); ``content_text``
is used for free-form text (Integrator's final_plan and progress updates).
Anything beyond ``MAX_ARTIFACT_BYTES`` is truncated with ``truncated=True``.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.models import Artifact

MAX_ARTIFACT_BYTES = 1_048_576  # 1 MiB hard cap


def _now() -> datetime:
    return datetime.now(UTC)


def write_artifact(
    *,
    db: Session,
    project_run_id: str,
    artifact_type: str,
    name: str,
    content: dict | list | str,
    task_id: str | None = None,
    agent_run_id: str | None = None,
    metadata: dict | None = None,
) -> Artifact:
    """Persist an artifact. Returns the saved row.

    ``content`` may be a dict/list (stored as JSON) or a string (stored as
    text). Over-limit content is truncated and flagged.
    """
    truncated = False
    content_json: dict | list | None = None
    content_text: str | None = None
    if isinstance(content, (dict, list)):
        payload = json.dumps(content, ensure_ascii=False)
        size = len(payload.encode("utf-8"))
        if size > MAX_ARTIFACT_BYTES:
            payload = payload[:MAX_ARTIFACT_BYTES]
            truncated = True
            content_text = payload + "\n[truncated]"
        else:
            content_json = content
        size_bytes = size
    else:
        text = str(content)
        size_bytes = len(text.encode("utf-8"))
        if size_bytes > MAX_ARTIFACT_BYTES:
            text = text[:MAX_ARTIFACT_BYTES] + "\n[truncated]"
            truncated = True
        content_text = text

    artifact = Artifact(
        id=f"art_{uuid4().hex}",
        project_run_id=project_run_id,
        task_id=task_id,
        agent_run_id=agent_run_id,
        type=artifact_type,
        name=name,
        content_json=content_json,
        content_text=content_text,
        size_bytes=min(size_bytes, MAX_ARTIFACT_BYTES),
        truncated=truncated,
        metadata_json=metadata,
    )
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return artifact


def serialize_artifact(artifact: Artifact) -> dict:
    return {
        "id": artifact.id,
        "projectRunId": artifact.project_run_id,
        "taskId": artifact.task_id,
        "agentRunId": artifact.agent_run_id,
        "type": artifact.type,
        "name": artifact.name,
        "content": artifact.content_json if artifact.content_json is not None else artifact.content_text,
        "contentKind": "json" if artifact.content_json is not None else "text",
        "sizeBytes": artifact.size_bytes,
        "truncated": artifact.truncated,
        "metadata": artifact.metadata_json,
        "createdAt": artifact.created_at.isoformat() if artifact.created_at else None,
    }
