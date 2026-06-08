"use client";

import { useMemo } from "react";
import { FileText, Loader2, Eye } from "lucide-react";

import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type { AgentRunView, ArtifactView, ProjectTaskView } from "@/lib/api";

interface Props {
  agentRuns: AgentRunView[];
  tasks: ProjectTaskView[];
  artifacts: ArtifactView[];
  onArtifactClick: (artifact: ArtifactView) => void;
  onAgentClick?: (agentRun: AgentRunView, task: ProjectTaskView | null) => void;
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

function artifactTone(type: string): StatusTone {
  if (type === "final_plan") return "ready";
  if (type === "review") return "warn";
  if (type === "worker") return "running";
  return "muted";
}

interface CardProps {
  testId: string;
  title: string;
  subtitle?: string;
  status: string | undefined;
  artifacts: ArtifactView[];
  onArtifactClick: (artifact: ArtifactView) => void;
  onCardClick?: () => void;
  emptyHint?: string;
}

function AgentCard({
  testId,
  title,
  subtitle,
  status,
  artifacts,
  onArtifactClick,
  onCardClick,
  emptyHint,
}: CardProps) {
  const clickable = !!onCardClick;
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-lg border bg-card p-3",
        status === "running" && "border-sky-300",
        status === "failed" && "border-rose-300",
      )}
      data-testid={testId}
    >
      <button
        type="button"
        onClick={onCardClick}
        disabled={!clickable}
        className={cn(
          "flex items-center justify-between gap-2 rounded text-left",
          clickable && "cursor-pointer hover:bg-muted/20 -mx-1 px-1 py-0.5",
        )}
        data-testid={`${testId}-header`}
        aria-label={clickable ? `View ${title} details` : title}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <StatusPill tone={statusTone(status)}>
          {status === "running" ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> running
            </span>
          ) : (
            status ?? "queued"
          )}
        </StatusPill>
      </button>

      {clickable ? (
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Eye className="h-3 w-3" /> click for prompt / output
        </div>
      ) : null}

      {artifacts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center text-xs text-muted-foreground">
          {emptyHint ?? "No artifact yet"}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {artifacts.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => onArtifactClick(a)}
                className="flex w-full items-center gap-2 rounded-md border bg-background p-2 text-left text-xs hover:bg-muted/30"
                data-testid={`artifact-${a.type}`}
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{a.name}</span>
                <StatusPill tone={artifactTone(a.type)}>{a.type}</StatusPill>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AgentBoard({
  agentRuns,
  tasks,
  artifacts,
  onArtifactClick,
  onAgentClick,
}: Props) {
  const grouped = useMemo(() => {
    const byRole: Record<string, AgentRunView[]> = {};
    for (const a of agentRuns) {
      (byRole[a.role] ??= []).push(a);
    }
    return byRole;
  }, [agentRuns]);

  const artifactsByType = useMemo(() => {
    const by: Record<string, ArtifactView[]> = {};
    for (const a of artifacts) (by[a.type] ??= []).push(a);
    return by;
  }, [artifacts]);

  // Build ordered cards: intake → planner → workers → supervisor → integrator
  const cards: Array<{ key: string; el: React.ReactNode }> = [];

  // Phase 1: Intake
  const intakeRun = grouped["intake"]?.[0];
  cards.push({
    key: "intake",
    el: (
      <AgentCard
        testId="agent-card-intake"
        title="Intake"
        subtitle={intakeRun?.modelId ?? "—"}
        status={intakeRun?.status}
        artifacts={artifactsByType["intake"] ?? []}
        onArtifactClick={onArtifactClick}
        onCardClick={
          intakeRun && onAgentClick ? () => onAgentClick(intakeRun, null) : undefined
        }
        emptyHint="Awaiting intake"
      />
    ),
  });

  // Phase 2: Planner
  const plannerRun = grouped["planner"]?.[0];
  cards.push({
    key: "planner",
    el: (
      <AgentCard
        testId="agent-card-planner"
        title="Planner"
        subtitle={plannerRun?.modelId ?? "—"}
        status={plannerRun?.status}
        artifacts={artifactsByType["plan"] ?? []}
        onArtifactClick={onArtifactClick}
        onCardClick={
          plannerRun && onAgentClick ? () => onAgentClick(plannerRun, null) : undefined
        }
        emptyHint="Awaiting planner"
      />
    ),
  });

  // Phase 3: Workers (one card per task; only show worker runs that exist)
  for (const task of tasks) {
    const workerRun = agentRuns.find(
      (a) => a.role === task.role && a.taskId === task.id,
    );
    cards.push({
      key: `worker-${task.id}`,
      el: (
        <AgentCard
          testId={`agent-card-worker-${task.id}`}
          title={`Worker · ${task.role}`}
          subtitle={task.title}
          status={workerRun?.status ?? "queued"}
          artifacts={artifactsByType["worker"]?.filter((a) => a.taskId === task.id) ?? []}
          onArtifactClick={onArtifactClick}
          onCardClick={
            workerRun && onAgentClick
              ? () => onAgentClick(workerRun, task)
              : undefined
          }
          emptyHint="Pending"
        />
      ),
    });
  }

  // Phase 4: Supervisor
  const supervisorRun = grouped["supervisor"]?.[0];
  cards.push({
    key: "supervisor",
    el: (
      <AgentCard
        testId="agent-card-supervisor"
        title="Supervisor"
        subtitle={supervisorRun?.modelId ?? "—"}
        status={supervisorRun?.status}
        artifacts={artifactsByType["review"] ?? []}
        onArtifactClick={onArtifactClick}
        onCardClick={
          supervisorRun && onAgentClick
            ? () => onAgentClick(supervisorRun, null)
            : undefined
        }
        emptyHint="Awaiting workers"
      />
    ),
  });

  // Phase 5: Integrator
  const integratorRun = grouped["integrator"]?.[0];
  cards.push({
    key: "integrator",
    el: (
      <AgentCard
        testId="agent-card-integrator"
        title="Integrator"
        subtitle={integratorRun?.modelId ?? "—"}
        status={integratorRun?.status}
        artifacts={artifactsByType["final_plan"] ?? []}
        onArtifactClick={onArtifactClick}
        onCardClick={
          integratorRun && onAgentClick
            ? () => onAgentClick(integratorRun, null)
            : undefined
        }
        emptyHint="Awaiting supervisor"
      />
    ),
  });

  // Side artifacts: progress, decisions
  const sideArtifacts = [
    ...(artifactsByType["progress"] ?? []),
    ...(artifactsByType["decisions"] ?? []),
  ];
  if (sideArtifacts.length > 0) {
    cards.push({
      key: "side",
      el: (
        <AgentCard
          testId="agent-card-side"
          title="Side artifacts"
          subtitle="Progress + decisions"
          status="completed"
          artifacts={sideArtifacts}
          onArtifactClick={onArtifactClick}
          emptyHint=""
        />
      ),
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Agent Board</h2>
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        data-testid="agent-board"
      >
        {cards.map(({ key, el }) => (
          <div key={key} className="min-h-[160px]">{el}</div>
        ))}
      </div>
    </div>
  );
}
