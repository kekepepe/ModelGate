"""Agent classes — each wraps a single ChatRuntime.run_chat call.

Every agent returns validated structured output matching the schema in
``schemas.py``. Token consumption is reported back to the BudgetTracker
via the ``Run`` UsageLog records.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.models import AgentRun, ProjectMemory, ProjectTask
from app.services.chat_runtime import chat_runtime
from app.services.project_runtime.budget import BudgetExceeded, BudgetTracker
from app.services.project_runtime.prompts import PROMPT_BY_ROLE, worker_prompt
from app.services.project_runtime.schemas import validate_agent_output

_ALLOWED_WORKER_ROLES = {"backend", "frontend", "database", "test", "docs", "refactor", "security"}

_MAX_FILE_BYTES = 50 * 1024  # 50 KB per file
_MAX_TOTAL_BYTES = 200 * 1024  # 200 KB total context
_MAX_GLOB_RESULTS = 50


def _read_task_file_contents(task: ProjectTask, project_root: Path) -> dict[str, str]:
    """Read file contents for task.allowed_files from disk.

    Returns {relative_path: contents}.  Files that don't exist are marked
    as ``(new file)``.  Binary files are skipped.
    """
    allowed = task.allowed_files or []
    result: dict[str, str] = {}
    total = 0

    for pattern in allowed:
        matches = list(project_root.glob(pattern))
        if not matches:
            # Pattern matches nothing — might be a new file the worker will create
            result[pattern] = "(new file)"
            continue

        for path in matches[:_MAX_GLOB_RESULTS]:
            if not path.is_file():
                continue
            try:
                rel = str(path.relative_to(project_root))
            except ValueError:
                rel = str(path)

            size = path.stat().st_size
            if size > _MAX_FILE_BYTES:
                continue

            if total + size > _MAX_TOTAL_BYTES:
                result[rel] = "(skipped — total context limit reached)"
                continue

            try:
                content = path.read_text(encoding="utf-8", errors="strict")
            except (UnicodeDecodeError, OSError):
                # Binary file or read error — skip
                continue

            result[rel] = content
            total += size

    return result


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
            params={},
            system_prompt=system_prompt,
        )

        raw_output = (run.output_json or {}).get("text", "")

        # Retry once if the LLM returned empty output
        if not raw_output or not raw_output.strip():
            run = await chat_runtime.run_chat(
                db=db,
                task_type="chat",
                model_id=model_id,
                prompt=user_prompt,
                file_ids=[],
                params={},
                system_prompt=system_prompt,
            )
            raw_output = (run.output_json or {}).get("text", "")
        try:
            parsed = _try_parse_json(raw_output)
        except ValueError as parse_exc:
            agent_run.status = "failed"
            agent_run.error_type = "JSON_PARSE_ERROR"
            agent_run.error_message = str(parse_exc)[:500]
            agent_run.run_id = run.id
            agent_run.output_json = {
                "raw": (raw_output or "")[:5000],
                "parse_error": str(parse_exc),
            }
            agent_run.input_tokens = _get_run_tokens(db, run.id, "input_tokens")
            agent_run.output_tokens = _get_run_tokens(db, run.id, "output_tokens")
            agent_run.total_tokens = _get_run_tokens(db, run.id, "total_tokens")
            agent_run.latency_ms = _compute_latency(run)
            agent_run.completed_at = _now_iso()
            budget.add_tokens(agent_run.total_tokens or 0)
            db.commit()
            db.refresh(agent_run)
            return agent_run, (agent_run.output_json or {})

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
    """Best-effort JSON extraction.

    1. Strip surrounding whitespace.
    2. If the text starts with a ``` fence, strip all fence lines.
    3. Try ``json.loads`` directly.
    4. On failure, scan for the first top-level balanced ``{...}`` block and
       try loading that. Handles prose-prefixed / prose-suffixed outputs from
       weaker models that ignore "JSON-only" instructions.
    5. If both attempts fail, raise ``ValueError`` with a truncated preview of
       the raw text for debugging.
    """
    import json

    original = text or ""
    text = original.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        cleaned = []
        for line in lines:
            if line.strip().startswith("```"):
                continue
            cleaned.append(line)
        text = "\n".join(cleaned).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    block = _extract_first_json_object(text) if text else None
    if block is None:
        # Try the original (with fences still in place) as a last resort
        block = _extract_first_json_object(original)

    if block is not None:
        try:
            return json.loads(block)
        except json.JSONDecodeError:
            pass

    preview = original.strip()[:500]
    raise ValueError(f"Agent output is not valid JSON. Raw preview (first 500 chars): {preview!r}")


def _extract_first_json_object(text: str) -> str | None:
    """Scan for the first top-level balanced ``{...}`` block.

    Handles string-state (so braces inside strings don't break balance) and
    escape sequences. Returns None if no balanced block is found.
    """
    depth = 0
    start = -1
    in_string = False
    escape = False
    for i, ch in enumerate(text):
        if escape:
            escape = False
            continue
        if in_string:
            if ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start >= 0:
                    return text[start : i + 1]
    return None


def _get_run_tokens(db: Session, run_id: str, field: str) -> int | None:
    from app.db.models import UsageLog

    usage = (
        db.query(UsageLog)
        .filter(UsageLog.record_type == "run", UsageLog.record_id == run_id)
        .first()
    )
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
    project_root: Path | None = None,
    feedback_prefix: str | None = None,
) -> tuple[AgentRun, dict]:
    role = task.role if task.role in _ALLOWED_WORKER_ROLES else "backend"
    file_contents = None
    if project_root is not None:
        file_contents = _read_task_file_contents(task, project_root)
    prompt = _worker_user_prompt(task, planner_output, file_contents=file_contents)
    if feedback_prefix:
        prompt = f"{feedback_prefix}\n\n---\n\n{prompt}"
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


def _worker_user_prompt(
    task: ProjectTask,
    planner_output: dict,
    file_contents: dict[str, str] | None = None,
) -> str:
    allowed = ", ".join(task.allowed_files or [])
    deps = ", ".join(task.depends_on or [])
    criteria = "\n".join(f"  - {c}" for c in task.acceptance_criteria or [])
    parts = [
        f"Task: {task.title}\n",
        f"Description: {task.description or ''}\n",
        f"Allowed files: {allowed or '(none specified)'}\n",
        f"Depends on: {deps or '(none)'}\n",
        f"Acceptance criteria:\n{criteria or '  (none specified)'}\n",
        f"Project title: {planner_output.get('project_title', '')}\n",
    ]

    if file_contents:
        parts.append("\n=== Current file contents ===\n")
        for path, content in file_contents.items():
            parts.append(f"--- File: {path} ---\n{content}\n")

    return "".join(parts)


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


def _verifier_user_prompt(
    *,
    applied_files: list[str],
    pytest_summary: dict,
    failed_tests: list[dict],
    round_index: int,
    previous_verdicts: list[dict],
    original_tasks: list[dict],
) -> str:
    """Build the user prompt for the V2.7 Verifier agent."""
    lines: list[str] = [
        "Review the patch that was just applied to the project and the pytest results.",
        "",
        f"Round: {round_index + 1}",
        f"Files changed: {', '.join(applied_files) or '(none)'}",
        "",
        f"Pytest summary: passed={pytest_summary.get('passed', 0)}, "
        f"failed={pytest_summary.get('failed', 0)}, errors={pytest_summary.get('errors', 0)}, "
        f"timed_out={pytest_summary.get('timed_out', False)}",
        "",
    ]
    if failed_tests:
        lines.append("Failed tests:")
        for ft in failed_tests[:20]:
            lines.append(f"- {ft.get('nodeid', '?')}: {ft.get('message', '')[:300]}")
        lines.append("")
    if previous_verdicts:
        lines.append("Previous verdicts (for context on repeats):")
        for prev in previous_verdicts[-3:]:
            lines.append(
                f"- Round {prev.get('round', '?')}: verdict={prev.get('verdict', '?')}, "
                f"failed={len(prev.get('failed_tests', []))}"
            )
        lines.append("")
    if original_tasks:
        lines.append("Original tasks the workers were asked to complete:")
        for t in original_tasks[:20]:
            lines.append(
                f"- [{t.get('role', '?')}] {t.get('title', t.get('id', '?'))}: "
                f"{(t.get('description') or '')[:200]}"
            )
        lines.append("")
    lines.append("Output the required JSON verdict now.")
    return "\n".join(lines)


async def run_verifier(
    *,
    db: Session,
    project_run_id: str,
    budget: BudgetTracker,
    model_id: str,
    applied_files: list[str],
    pytest_summary: dict,
    failed_tests: list[dict],
    round_index: int,
    previous_verdicts: list[dict] | None = None,
    original_tasks: list[dict] | None = None,
) -> tuple[AgentRun, dict]:
    """V2.7 Controlled Auto Verifier agent.

    Decides whether the applied patch passes pytest + original acceptance
    criteria. When it fails, returns ``next_actions`` that the orchestrator
    re-dispatches to the relevant Worker for the next round.
    """
    prompt = _verifier_user_prompt(
        applied_files=applied_files,
        pytest_summary=pytest_summary,
        failed_tests=failed_tests,
        round_index=round_index,
        previous_verdicts=previous_verdicts or [],
        original_tasks=original_tasks or [],
    )
    return await _run_agent(
        db=db,
        project_run_id=project_run_id,
        task=None,
        role="verifier",
        system_prompt=PROMPT_BY_ROLE["verifier"],
        user_prompt=prompt,
        budget=budget,
        model_id=model_id,
        schema_role="verifier",
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
