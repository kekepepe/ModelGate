"""JSON schemas + Pydantic models for Project Mode agent outputs.

Every agent (Intake / Planner / Worker / Supervisor / Integrator) must
emit a JSON object matching its schema. Validation failures are caught
by the orchestrator which retries once before marking the agent run as
``schema_invalid``.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

AgentRole = Literal["intake", "planner", "worker", "supervisor", "integrator"]


class AgentOutput(BaseModel):
    """Common base — every agent output carries at least a ``summary``."""

    summary: str = Field(..., min_length=1)


class IntakeOutput(AgentOutput):
    goal: str = Field(..., min_length=1)
    project_area: list[str] = Field(default_factory=list)
    risk_level: Literal["low", "medium", "high"] = "medium"
    requires_repo_access: bool = False
    expected_outputs: list[str] = Field(default_factory=list)


class PlannerTask(BaseModel):
    id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    description: str = Field(default="")
    role: str = Field(..., min_length=1)
    allowed_files: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    depends_on: list[str] = Field(default_factory=list)


class PlannerOutput(AgentOutput):
    project_title: str = Field(..., min_length=1)
    tasks: list[PlannerTask] = Field(..., min_length=1)
    parallel_groups: list[list[str]] = Field(default_factory=list)


class WorkerProposedChange(BaseModel):
    file: str
    change_kind: Literal["create", "modify", "delete", "review"] = "modify"
    description: str = ""
    patch: str = ""  # unified diff for this file (V2.6 Patch Mode)


class WorkerOutput(AgentOutput):
    files_to_change: list[str] = Field(default_factory=list)
    proposed_changes: list[WorkerProposedChange] = Field(default_factory=list)
    tests: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    patch_combined: str = ""  # all unified diffs merged (V2.6 Patch Mode)


class PatchValidationResult(BaseModel):
    """Result of validating a unified diff against allowed_files."""

    valid: bool = True
    violations: list[str] = Field(default_factory=list)
    high_risk_files: list[dict[str, str]] = Field(default_factory=list)


class SupervisorOutput(AgentOutput):
    model_config = ConfigDict(populate_by_name=True)

    pass_check: bool = Field(..., alias="pass")
    blocking_issues: list[str] = Field(default_factory=list)
    non_blocking_issues: list[str] = Field(default_factory=list)
    missing_tests: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)


class IntegratorOutput(AgentOutput):
    final_plan: str = Field(..., min_length=1)
    ordered_changes: list[dict] = Field(default_factory=list)
    test_commands: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    rollback: str = ""
    progress_update: str = ""
    decisions_update: str = ""


_SCHEMA_BY_ROLE: dict[str, type[AgentOutput]] = {
    "intake": IntakeOutput,
    "planner": PlannerOutput,
    "worker": WorkerOutput,
    "supervisor": SupervisorOutput,
    "integrator": IntegratorOutput,
}


def validate_agent_output(role: str, payload: dict[str, Any]) -> AgentOutput:
    schema_cls = _SCHEMA_BY_ROLE.get(role)
    if schema_cls is None:
        raise ValueError(f"Unknown agent role: {role}")
    try:
        return schema_cls.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(f"Agent output failed schema for role '{role}': {exc}") from exc
