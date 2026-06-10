"""Budget tracking for Project Mode runs.

Hard limits: max_agents, max_rounds, max_tokens, max_runtime_seconds,
max_context_files. Crossing any limit raises BudgetExceeded which the
orchestrator catches and marks the run as ``budget_exceeded``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from time import monotonic


class BudgetExceeded(Exception):
    """Raised when the orchestrator exceeds a Project Run budget limit."""

    def __init__(self, reason: str, limit_kind: str, limit_value: int, current_value: int) -> None:
        super().__init__(reason)
        self.reason = reason
        self.limit_kind = limit_kind
        self.limit_value = limit_value
        self.current_value = current_value


@dataclass
class Budget:
    max_agents: int = 6
    max_rounds: int = 1
    max_tokens: int = 200_000
    max_runtime_seconds: int = 600
    max_context_files: int = 8
    max_schema_failures: int = 2
    max_same_test_failures: int = 2

    @classmethod
    def from_dict(cls, data: dict | None) -> Budget:
        if not data:
            return cls()
        return cls(
            max_agents=int(data.get("maxAgents", data.get("max_agents", 6))),
            max_rounds=int(data.get("maxRounds", data.get("max_rounds", 1))),
            max_tokens=int(data.get("maxTokens", data.get("max_tokens", 200_000))),
            max_runtime_seconds=int(
                data.get("maxRuntimeSeconds", data.get("max_runtime_seconds", 600))
            ),
            max_context_files=int(data.get("maxContextFiles", data.get("max_context_files", 8))),
            max_schema_failures=int(
                data.get("maxSchemaFailures", data.get("max_schema_failures", 2))
            ),
            max_same_test_failures=int(
                data.get("maxSameTestFailures", data.get("max_same_test_failures", 2))
            ),
        )

    def to_dict(self) -> dict:
        return {
            "maxAgents": self.max_agents,
            "maxRounds": self.max_rounds,
            "maxTokens": self.max_tokens,
            "maxRuntimeSeconds": self.max_runtime_seconds,
            "maxContextFiles": self.max_context_files,
            "maxSchemaFailures": self.max_schema_failures,
            "maxSameTestFailures": self.max_same_test_failures,
        }


@dataclass
class BudgetTracker:
    budget: Budget
    started_at: float = field(default_factory=monotonic)
    agents_used: int = 0
    rounds_used: int = 0
    tokens_used: int = 0
    context_files_used: int = 0
    schema_failures_per_task: dict[str, int] = field(default_factory=dict)
    failed_test_nodeids: list[set[str]] = field(default_factory=list)

    def usage_snapshot(self) -> dict:
        return {
            "agentsUsed": self.agents_used,
            "roundsUsed": self.rounds_used,
            "tokensUsed": self.tokens_used,
            "runtimeSeconds": int(monotonic() - self.started_at),
            "contextFilesUsed": self.context_files_used,
        }

    def check_runtime(self) -> None:
        elapsed = int(monotonic() - self.started_at)
        if elapsed >= self.budget.max_runtime_seconds:
            raise BudgetExceeded(
                "Runtime budget exceeded",
                "max_runtime_seconds",
                self.budget.max_runtime_seconds,
                elapsed,
            )

    def reserve_agent(self) -> None:
        self.check_runtime()
        if self.agents_used + 1 > self.budget.max_agents:
            raise BudgetExceeded(
                "Agent budget exceeded",
                "max_agents",
                self.budget.max_agents,
                self.agents_used + 1,
            )
        self.agents_used += 1

    def reserve_round(self) -> None:
        if self.rounds_used + 1 > self.budget.max_rounds:
            raise BudgetExceeded(
                "Round budget exceeded",
                "max_rounds",
                self.budget.max_rounds,
                self.rounds_used + 1,
            )
        self.rounds_used += 1

    def add_tokens(self, tokens: int) -> None:
        self.tokens_used += max(0, tokens)
        if self.tokens_used > self.budget.max_tokens:
            raise BudgetExceeded(
                "Token budget exceeded",
                "max_tokens",
                self.budget.max_tokens,
                self.tokens_used,
            )

    def reserve_context_files(self, count: int) -> None:
        if count > self.budget.max_context_files:
            raise BudgetExceeded(
                "Context file budget exceeded",
                "max_context_files",
                self.budget.max_context_files,
                count,
            )
        self.context_files_used = max(self.context_files_used, count)

    def record_schema_failure(self, task_id: str) -> bool:
        """Record a schema failure for *task_id*.

        Returns True if the task has exceeded ``max_schema_failures``.
        """
        self.schema_failures_per_task[task_id] = self.schema_failures_per_task.get(task_id, 0) + 1
        return self.schema_failures_per_task[task_id] >= self.budget.max_schema_failures

    def record_failed_tests(self, nodeids: set[str]) -> bool:
        """Record the set of failed test nodeids for this round.

        Returns True if the same non-empty set of nodeids appears
        ``max_same_test_failures`` times consecutively.
        """
        self.failed_test_nodeids.append(nodeids)
        if len(self.failed_test_nodeids) < self.budget.max_same_test_failures:
            return False
        threshold = self.budget.max_same_test_failures
        recent = self.failed_test_nodeids[-threshold:]
        if not recent[0]:
            return False
        return all(s == recent[0] for s in recent)
