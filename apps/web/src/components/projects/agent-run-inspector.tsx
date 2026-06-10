"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Loader2, RotateCcw } from "lucide-react";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AgentRunView, ArtifactView, ProjectTaskView } from "@/lib/api";

interface Props {
  agentRun: AgentRunView | null;
  task: ProjectTaskView | null;
  artifacts: ArtifactView[];
  onRetry?: () => void;
  isRetrying?: boolean;
  projectStatus?: string;
  mode?: string;
}

const WORKER_ROLES = new Set([
  "backend",
  "frontend",
  "database",
  "test",
  "docs",
  "refactor",
  "security",
  "worker",
]);

const ROLE_DESCRIPTIONS: Record<string, string> = {
  intake: "Parses the user goal and produces a structured intake summary.",
  planner: "Breaks the goal into typed tasks with allowed files and acceptance criteria.",
  worker: "Implements a single task with proposed code changes.",
  supervisor: "Reviews all worker outputs for conflicts and missing tests.",
  integrator: "Combines everything into a final implementation plan.",
  verifier: "Runs tests and judges whether the changes pass.",
};

function statusTone(status: string | undefined): StatusTone {
  switch (status) {
    case "completed":
      return "ready";
    case "running":
      return "running";
    case "failed":
      return "failed";
    default:
      return "muted";
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRoleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono text-xs">{value}</p>
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-1">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open ? children : null}
    </section>
  );
}

export function AgentRunInspector({
  agentRun,
  task,
  artifacts,
  onRetry,
  isRetrying,
  projectStatus,
  mode,
}: Props) {
  if (!agentRun) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
        data-testid="agent-run-inspector-empty"
      >
        Click a node to inspect
      </div>
    );
  }

  const isWorker = WORKER_ROLES.has(agentRun.role);
  const isPlannerOrIntake = agentRun.role === "planner" || agentRun.role === "intake";
  const isTerminal =
    projectStatus === "completed" ||
    projectStatus === "failed" ||
    projectStatus === "validation_failed";
  const canRetry = (isWorker || isPlannerOrIntake) && isTerminal && mode !== "advisory";
  const retryDisabledReason = !(isWorker || isPlannerOrIntake)
    ? "Cannot retry this agent type"
    : mode === "advisory"
      ? "Advisory mode does not support retry"
      : !isTerminal
        ? "Project must be in a terminal state"
        : null;

  const retryLabel = isPlannerOrIntake ? `Re-run ${agentRun.role}` : "Re-run this worker";

  return (
    <div
      className="flex h-full flex-col gap-2 rounded-lg border bg-card"
      data-testid="agent-run-inspector"
    >
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {/* Header */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StatusPill tone={statusTone(agentRun.status)}>
                {agentRun.status === "running" ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> running
                  </span>
                ) : (
                  (agentRun.status ?? "queued")
                )}
              </StatusPill>
              <span className="text-sm font-semibold">{formatRoleLabel(agentRun.role)}</span>
            </div>
            {task ? <p className="truncate text-xs text-muted-foreground">{task.title}</p> : null}
            <p className="text-[10px] text-muted-foreground">
              {ROLE_DESCRIPTIONS[agentRun.role] ?? "Agent run details."}
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-1.5" data-testid="agent-run-inspector-stats">
            <Stat label="Model" value={agentRun.modelId ?? "—"} />
            <Stat label="Latency" value={formatDuration(agentRun.latencyMs)} />
            <Stat
              label="Input tokens"
              value={agentRun.inputTokens != null ? String(agentRun.inputTokens) : "—"}
            />
            <Stat
              label="Output tokens"
              value={agentRun.outputTokens != null ? String(agentRun.outputTokens) : "—"}
            />
          </div>

          {/* Error banner */}
          {agentRun.errorType || agentRun.errorMessage ? (
            <div
              className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
              data-testid="agent-run-inspector-error"
            >
              <p className="font-semibold">{agentRun.errorType ?? "Error"}</p>
              {agentRun.errorMessage && (
                <p className="mt-0.5 whitespace-pre-wrap break-words">{agentRun.errorMessage}</p>
              )}
            </div>
          ) : null}

          {/* Prompt */}
          <CollapsibleSection title="Prompt">
            <div className="max-h-[200px] overflow-y-auto rounded-md border bg-muted/30 p-2">
              <pre
                className="whitespace-pre-wrap break-words text-[11px] leading-relaxed"
                data-testid="agent-run-inspector-prompt"
              >
                {agentRun.prompt || "(no prompt captured)"}
              </pre>
            </div>
          </CollapsibleSection>

          {/* Output */}
          <CollapsibleSection title="Output">
            <div className="max-h-[240px] overflow-y-auto rounded-md border bg-muted/30 p-2">
              <pre
                className="whitespace-pre-wrap break-words text-[11px] leading-relaxed"
                data-testid="agent-run-inspector-output"
              >
                {agentRun.output == null
                  ? "(no output yet)"
                  : typeof agentRun.output === "string"
                    ? agentRun.output
                    : JSON.stringify(agentRun.output, null, 2)}
              </pre>
            </div>
          </CollapsibleSection>

          {/* Linked artifacts */}
          {artifacts.length > 0 ? (
            <section className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Files
              </p>
              <ul className="space-y-1">
                {artifacts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-1.5 rounded-md border bg-background p-1.5 text-[11px]"
                  >
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{a.name}</span>
                    <StatusPill tone="muted" withDot={false} className="text-[10px]">
                      {a.type}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </ScrollArea>

      {/* Retry button */}
      <div className="border-t p-2">
        {canRetry ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onRetry}
            disabled={isRetrying}
            data-testid="agent-run-inspector-retry"
          >
            {isRetrying ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="mr-1 h-3 w-3" />
            )}
            {retryLabel}
          </Button>
        ) : retryDisabledReason ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled
                    data-testid="agent-run-inspector-retry-disabled"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Re-run
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{retryDisabledReason}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </div>
  );
}
