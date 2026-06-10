"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentRunView, ArtifactView, ProjectTaskView } from "@/lib/api";

interface Props {
  agentRun: AgentRunView | null;
  task: ProjectTaskView | null;
  artifacts: ArtifactView[];
  onOpenChange: (open: boolean) => void;
}

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

const ROLE_DESCRIPTIONS: Record<string, string> = {
  intake:
    "Parses the user goal and produces a structured intake summary, including risk and required outputs.",
  planner:
    "Breaks the goal into a tree of typed tasks (backend / frontend / …), each with allowed files and acceptance criteria.",
  worker:
    "Implements a single task. Output is a `proposed_changes` list scoped to the task's `allowed_files`.",
  supervisor:
    "Reviews all worker outputs, surfaces conflicts, missing tests, and over-broad scope.",
  integrator:
    "Combines planner + workers + supervisor into a final implementation plan and progress / decision notes.",
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatRoleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function AgentRunDrawer({ agentRun, task, artifacts, onOpenChange }: Props) {
  const open = agentRun !== null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-3 sm:max-w-[720px]"
        data-testid="agent-run-drawer"
      >
        {agentRun && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <StatusPill tone={statusTone(agentRun.status)}>{agentRun.status}</StatusPill>
                <SheetTitle className="text-sm">
                  {formatRoleLabel(agentRun.role)}
                  {task ? ` · ${task.title}` : ""}
                </SheetTitle>
              </div>
              <SheetDescription>
                {ROLE_DESCRIPTIONS[agentRun.role] ?? "Agent run details."}
              </SheetDescription>
            </SheetHeader>

            <div
              className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"
              data-testid="agent-run-stats"
            >
              <Stat label="Model" value={agentRun.modelId ?? "—"} />
              <Stat label="Provider" value={agentRun.providerId ?? "—"} />
              <Stat label="Input tokens" value={String(agentRun.inputTokens ?? "—")} />
              <Stat label="Output tokens" value={String(agentRun.outputTokens ?? "—")} />
              <Stat label="Total tokens" value={String(agentRun.totalTokens ?? "—")} />
              <Stat label="Latency" value={formatDuration(agentRun.latencyMs)} />
              <Stat label="Started" value={formatDateTime(agentRun.startedAt)} />
              <Stat label="Completed" value={formatDateTime(agentRun.completedAt)} />
            </div>

            {agentRun.errorType || agentRun.errorMessage ? (
              <div
                className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                data-testid="agent-run-error"
              >
                <p className="font-semibold">{agentRun.errorType ?? "Error"}</p>
                {agentRun.errorMessage && (
                  <p className="mt-1 whitespace-pre-wrap break-words">{agentRun.errorMessage}</p>
                )}
              </div>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Prompt
              </h3>
              <ScrollArea className="max-h-[240px] rounded-md border bg-muted/30 p-3">
                <pre
                  className="whitespace-pre-wrap break-words text-xs leading-relaxed"
                  data-testid="agent-run-prompt"
                >
                  {agentRun.prompt || "(no prompt captured)"}
                </pre>
              </ScrollArea>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Output
              </h3>
              <ScrollArea className="max-h-[300px] rounded-md border bg-muted/30 p-3">
                <pre
                  className="whitespace-pre-wrap break-words text-xs leading-relaxed"
                  data-testid="agent-run-output"
                >
                  {agentRun.output == null
                    ? "(no output yet)"
                    : typeof agentRun.output === "string"
                      ? agentRun.output
                      : JSON.stringify(agentRun.output, null, 2)}
                </pre>
              </ScrollArea>
            </section>

            {artifacts.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Linked artifacts
                </h3>
                <ul className="space-y-1 text-xs">
                  {artifacts.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 rounded-md border bg-background p-2"
                      data-testid={`agent-run-artifact-${a.type}`}
                    >
                      <span className="flex-1 truncate">{a.name}</span>
                      <StatusPill tone="muted">{a.type}</StatusPill>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono text-xs">{value}</p>
    </div>
  );
}
