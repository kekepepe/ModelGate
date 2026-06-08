"""Agent classes — each wraps a single ChatRuntime.run_chat call.

Every agent returns validated structured output matching the schema in
``schemas.py``. Token consumption is reported back to the BudgetTracker
via the ``Run`` UsageLog records.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.models import AgentRun, ProjectMemory, ProjectTask
from app.services.chat_runtime import chat_runtime
from app.services.project_runtime.artifacts import write_artifact
from app.services.project_runtime.budget import BudgetExceeded, BudgetTracker
from app.services.project_runtime.prompts import PROMPT_BY_ROLE, worker_prompt
from app.services.project_runtime.schemas import validate_agent_output

_ALLOWED_WORKER_ROLES = {"backend", "frontend", "database", "test", "docs", "refactor", "security"}


def _now_iso() -> datetime:
    return datetime.now(UTC)


def _agent_id() -> str:
    return f"agent_{uuid4().hex}"


async def _run_agent(
    *,
    db: Session,
    project_run_id: str,
    task: ProjectTask | None,
    role: str,
    system_prompt: str,
    user_prompt: str,
    budget: BudgetTracker,
    model_id: str,
    provider_id: str | None = None,
    schema_role: str | None = None,
) -> tuple[AgentRun, dict]:
    """Execute a single agent via chat_runtime.

    Returns the (AgentRun row, parsed output dict) pair.
    """
    agent_run = AgentRun(
        id=_agent_id(),
        project_run_id=project_run_id,
        task_id=task.id if task else None,
        role=role,
        status="running",
        model_id=model_id,
        provider_id=provider_id,
        prompt=f"{system_prompt}\n\n{user_prompt}",
        started_at=_now_iso(),
    )
    db.add(agent_run)
    db.commit()
    db.refresh(agent_run)

    try:
        budget.reserve_agent()
        budget.check_runtime()

        run = await chat_runtime.run_chat(
            db=db,
            task_type="chat",
            model_id=model_id,
            prompt=user_prompt,
            file_ids=[],
            params={"system_prompt": system_prompt},
        )

        raw_output = (run.output_json or {}).get("text", "")
        parsed = _try_parse_json(raw_output)
        validated = validate_agent_output(schema_role or role, parsed)
        output_dict = validated.model_dump(by_alias=True)

        agent_run.status = "completed"
        agent_run.run_id = run.id
        agent_run.output_json = output_dict
        agent_run.input_tokens = _get_run_tokens(db, run.id, "input_tokens")
        agent_run.output_tokens = _get_run_tokens(db, run.id, "output_tokens")
        agent_run.total_tokens = _get_run_tokens(db, run.id, "total_tokens")
        agent_run.latency_ms = _compute_latency(run)
        agent_run.completed_at = _now_iso()

        budget.add_tokens(agent_run.total_tokens or 0)
    except BudgetExceeded as exc:
        agent_run.status = "failed"
        agent_run.error_type = "BUDGET_EXCEEDED"
        agent_run.error_message = exc.reason
        agent_run.completed_at = _now_iso()
        db.commit()
        raise
    except Exception as exc:
        agent_run.status = "failed"
        agent_run.error_type = getattr(exc, "error_type", type(exc).__name__)
        agent_run.error_message = str(exc)[:500]
        agent_run.completed_at = _now_iso()

    db.commit()
    db.refresh(agent_run)
    return agent_run, (agent_run.output_json or {})


def _try_parse_json(text: str) -> dict:
    """Best-effort JSON extraction. Handles markdown-fenced JSON."""
    import json

    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        cleaned = []
        for line in lines:
            if line.strip().startswith("```"):
                continue
            cleaned.append(line)
        text = "\n".join(cleaned)
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        raise ValueError(f"Agent output is not valid JSON")


def _get_run_tokens(db: Session, run_id: str, field: str) -> int | None:
    from app.db.models import UsageLog

    usage = db.query(UsageLog).filter(UsageLog.record_type == "run", UsageLog.record_id == run_id).first()
    if usage:
        return getattr(usage, field, None) or 0
    return None


def _compute_latency(run) -> int | None:
    if run.started_at and run.completed_at:
        delta = run.completed_at - run.started_at
        return int(delta.total_seconds() * 1000)
    return None


async def run_intake(
    *,
    db: Session,
    project_run_id: str,
    goal: str,
    budget: BudgetTracker,
    model_id: str,
) -> tuple[AgentRun, dict]:
    return await _run_agent(
        db=db,
        project_run_id=project_run_id,
        task=None,
        role="intake",
        system_prompt=PROMPT_BY_ROLE["intake"],
        user_prompt=goal,
        budget=budget,
        model_id=model_id,
    )


async def run_planner(
    *,
    db: Session,
    project_run_id: str,
    intake_output: dict,
    budget: BudgetTracker,
    model_id: str,
) -> tuple[AgentRun, dict]:
    return await _run_agent(
        db=db,
        project_run_id=project_run_id,
        task=None,
        role="planner",
        system_prompt=PROMPT_BY_ROLE["planner"],
        user_prompt=_planner_user_prompt(intake_output),
        budget=budget,
        model_id=model_id,
    )


def _planner_user_prompt(intake_output: dict) -> str:
    return (
        f"Break the following goal into tasks:\n\n"
        f"Summary: {intake_output.get('summary', '')}\n"
        f"Goal: {intake_output.get('goal', '')}\n"
        f"Project areas: {', '.join(intake_output.get('project_area', []))}\n"
        f"Risk level: {intake_output.get('risk_level', 'medium')}\n"
        f"Expected outputs: {', '.join(intake_output.get('expected_outputs', []))}\n"
    )


async def run_worker(
    *,
    db: Session,
    project_run_id: str,
    task: ProjectTask,
    planner_output: dict,
    budget: BudgetTracker,
    model_id: str,
) -> tuple[AgentRun, dict]:
    role = task.role if task.role in _ALLOWED_WORKER_ROLES else "backend"
    prompt = _worker_user_prompt(task, planner_output)
    return await _run_agent(
        db=db,
        project_run_id=project_run_id,
        task=task,
        role=role,
        system_prompt=worker_prompt(role),
        user_prompt=prompt,
        budget=budget,
        model_id=model_id,
        schema_role="worker",
    )


def _worker_user_prompt(task: ProjectTask, planner_output: dict) -> str:
    allowed = ", ".join(task.allowed_files or [])
    deps = ", ".join(task.depends_on or [])
    criteria = "\n".join(f"  - {c}" for c in task.acceptance_criteria or [])
    return (
        f"Task: {task.title}\n"
        f"Description: {task.description or ''}\n"
        f"Allowed files: {allowed or '(none specified)'}\n"
        f"Depends on: {deps or '(none)'}\n"
        f"Acceptance criteria:\n{criteria or '  (none specified)'}\n"
        f"Project title: {planner_output.get('project_title', '')}\n"
    )


async def run_supervisor(
    *,
    db: Session,
    project_run_id: str,
    worker_outputs: list[tuple[ProjectTask, dict]],
    budget: BudgetTracker,
    model_id: str,
) -> tuple[AgentRun, dict]:
    prompt = _supervisor_user_prompt(worker_outputs)
    return await _run_agent(
        db=db,
        project_run_id=project_run_id,
        task=None,
        role="supervisor",
        system_prompt=PROMPT_BY_ROLE["supervisor"],
        user_prompt=prompt,
        budget=budget,
        model_id=model_id,
    )


def _supervisor_user_prompt(worker_outputs: list[tuple[ProjectTask, dict]]) -> str:
    lines = ["Review these worker outputs:", ""]
    for task, output in worker_outputs:
        lines.append(f"--- Task: {task.title} (role={task.role}) ---")
        lines.append(f"Summary: {output.get('summary', '(none)')}")
        lines.append(f"Files: {', '.join(output.get('files_to_change', []))}")
        changes = output.get("proposed_changes", [])
        for c in changes:
            lines.append(f"  {c['change_kind']} {c['file']}: {c.get('description', '')}")
        lines.append(f"Tests: {', '.join(output.get('tests', []))}")
        lines.append(f"Risks: {', '.join(output.get('risks', []))}")
        lines.append("")
    return "\n".join(lines)


async def run_integrator(
    *,
    db: Session,
    project_run_id: str,
    planner_output: dict,
    worker_outputs: list[tuple[ProjectTask, dict]],
    supervisor_output: dict,
    budget: BudgetTracker,
    model_id: str,
) -> tuple[AgentRun, dict]:
    prompt = _integrator_user_prompt(planner_output, worker_outputs, supervisor_output)
    return await _run_agent(
        db=db,
        project_run_id=project_run_id,
        task=None,
        role="integrator",
        system_prompt=PROMPT_BY_ROLE["integrator"],
        user_prompt=prompt,
        budget=budget,
        model_id=model_id,
    )


def _integrator_user_prompt(
    planner_output: dict,
    worker_outputs: list[tuple[ProjectTask, dict]],
    supervisor_output: dict,
) -> str:
    lines = [
        "Combine the following into one final implementation plan.",
        "",
        f"Project: {planner_output.get('project_title', '')}",
        f"Plan summary: {planner_output.get('summary', '')}",
        "",
        "Supervisor review:",
        f"  Pass: {supervisor_output.get('pass', False)}",
        f"  Blocking: {'; '.join(supervisor_output.get('blocking_issues', []))}",
        f"  Non-blocking: {'; '.join(supervisor_output.get('non_blocking_issues', []))}",
    ]
    if supervisor_output.get("missing_tests"):
        lines.append(f"  Missing tests: {'; '.join(supervisor_output['missing_tests'])}")
    lines.append("")
    for task, worker_out in worker_outputs:
        lines.append(f"--- {task.title} (role={task.role}) ---")
        lines.append(worker_out.get("summary", ""))
        lines.append("")
    return "\n".join(lines)


def write_memory(
    *,
    db: Session,
    project_run_id: str,
    memory_type: str,
    content: str,
    source: str | None = None,
) -> ProjectMemory:
    mem = ProjectMemory(
        id=f"mem_{uuid4().hex}",
        project_run_id=project_run_id,
        type=memory_type,
        content=content,
        source=source,
    )
    db.add(mem)
    db.commit()
    db.refresh(mem)
    return mem