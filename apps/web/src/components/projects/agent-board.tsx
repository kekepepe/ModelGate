"use client";

import { useMemo } from "react";
import { FileText, Loader2, Eye } from "lucide-react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import { RoundCounter } from "./round-counter";
import { StopReasonBanner } from "./stop-reason-banner";
import type { AgentRunView, ArtifactView, ProjectTaskView } from "@/lib/api";

interface Props {
  agentRuns: AgentRunView[];
  tasks: ProjectTaskView[];
  artifacts: ArtifactView[];
  onArtifactClick: (artifact: ArtifactView) => void;
  onAgentClick?: (agentRun: AgentRunView, task: ProjectTaskView | null) => void;
  mode?: string | null;
  round?: number | null;
  stopReason?: string | null;
  stopRound?: number | null;
  maxRounds?: number;
}

type AgentNodeData = {
  testId: string;
  title: string;
  subtitle?: string;
  status: string | undefined;
  artifacts: ArtifactView[];
  onArtifactClick: (artifact: ArtifactView) => void;
  onCardClick?: () => void;
  emptyHint?: string;
  showSourceHandle: boolean;
  showTargetHandle: boolean;
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

function artifactTone(type: string): StatusTone {
  if (type === "final_plan") return "ready";
  if (type === "review") return "warn";
  if (type === "worker") return "running";
  if (type === "patch") return "warn";
  return "muted";
}

function statusBorderClass(status: string | undefined): string {
  switch (status) {
    case "completed":
      return "border-emerald-400";
    case "running":
      return "border-amber-400";
    case "failed":
      return "border-rose-400";
    default:
      return "border-muted";
  }
}

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const clickable = !!data.onCardClick;
  return (
    <div
      className={cn(
        "flex w-[240px] flex-col gap-2 rounded-lg border-2 bg-card p-3 shadow-sm",
        statusBorderClass(data.status),
      )}
      data-testid={data.testId}
    >
      {data.showTargetHandle ? (
        <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      ) : null}

      <button
        type="button"
        onClick={data.onCardClick}
        disabled={!clickable}
        className={cn(
          "flex items-center justify-between gap-2 rounded text-left",
          clickable && "cursor-pointer hover:bg-muted/20 -mx-1 px-1 py-0.5",
        )}
        data-testid={`${data.testId}-header`}
        aria-label={clickable ? `View ${data.title} details` : data.title}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{data.title}</p>
          {data.subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{data.subtitle}</p>
          ) : null}
        </div>
        <StatusPill tone={statusTone(data.status)}>
          {data.status === "running" ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> running
            </span>
          ) : (
            data.status ?? "queued"
          )}
        </StatusPill>
      </button>

      {clickable ? (
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Eye className="h-3 w-3" /> click for prompt / output
        </div>
      ) : null}

      {data.artifacts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center text-xs text-muted-foreground">
          {data.emptyHint ?? "No artifact yet"}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {data.artifacts.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => data.onArtifactClick(a)}
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

      {data.showSourceHandle ? (
        <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
      ) : null}
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

const ROW_HEIGHT = 240;
const NODE_WIDTH = 240;
const NODE_GAP = 40;

export function AgentBoard({
  agentRuns,
  tasks,
  artifacts,
  onArtifactClick,
  onAgentClick,
  mode,
  round,
  stopReason,
  stopRound,
  maxRounds = 3,
}: Props) {
  const isControlledAuto = mode === "controlled_auto";
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

  const { nodes, edges } = useMemo(() => {
    const ns: Node<AgentNodeData>[] = [];
    const es: Edge[] = [];

    // Layout: workers row width determines overall canvas width; single nodes are centered.
    const workerCount = Math.max(tasks.length, 1);
    const workersRowWidth = workerCount * NODE_WIDTH + (workerCount - 1) * NODE_GAP;
    const centerX = workersRowWidth / 2 - NODE_WIDTH / 2;

    // Row 0: Intake
    const intakeRun = grouped["intake"]?.[0];
    ns.push({
      id: "intake",
      type: "agent",
      position: { x: centerX, y: 0 },
      data: {
        testId: "agent-card-intake",
        title: "Intake",
        subtitle: intakeRun?.modelId ?? "—",
        status: intakeRun?.status,
        artifacts: artifactsByType["intake"] ?? [],
        onArtifactClick,
        onCardClick: intakeRun && onAgentClick ? () => onAgentClick(intakeRun, null) : undefined,
        emptyHint: "Awaiting intake",
        showSourceHandle: true,
        showTargetHandle: false,
      },
      draggable: false,
      selectable: false,
    });

    // Row 1: Planner
    const plannerRun = grouped["planner"]?.[0];
    ns.push({
      id: "planner",
      type: "agent",
      position: { x: centerX, y: ROW_HEIGHT },
      data: {
        testId: "agent-card-planner",
        title: "Planner",
        subtitle: plannerRun?.modelId ?? "—",
        status: plannerRun?.status,
        artifacts: artifactsByType["plan"] ?? [],
        onArtifactClick,
        onCardClick: plannerRun && onAgentClick ? () => onAgentClick(plannerRun, null) : undefined,
        emptyHint: "Awaiting planner",
        showSourceHandle: true,
        showTargetHandle: true,
      },
      draggable: false,
      selectable: false,
    });
    es.push({ id: "e-intake-planner", source: "intake", target: "planner", animated: false });

    // Row 2: Workers (one per task)
    if (tasks.length === 0) {
      // Placeholder so the layout doesn't collapse before planner finishes
      ns.push({
        id: "workers-placeholder",
        type: "agent",
        position: { x: centerX, y: ROW_HEIGHT * 2 },
        data: {
          testId: "agent-card-workers-placeholder",
          title: "Workers",
          subtitle: "—",
          status: undefined,
          artifacts: [],
          onArtifactClick,
          emptyHint: "Awaiting plan",
          showSourceHandle: true,
          showTargetHandle: true,
        },
        draggable: false,
        selectable: false,
      });
      es.push({ id: "e-planner-wph", source: "planner", target: "workers-placeholder" });
      es.push({ id: "e-wph-supervisor", source: "workers-placeholder", target: "supervisor" });
    } else {
      tasks.forEach((task, idx) => {
        const workerRun = agentRuns.find((a) => a.role === task.role && a.taskId === task.id);
        const id = `worker-${task.id}`;
        const x = idx * (NODE_WIDTH + NODE_GAP);
        ns.push({
          id,
          type: "agent",
          position: { x, y: ROW_HEIGHT * 2 },
          data: {
            testId: `agent-card-worker-${task.id}`,
            title: `Worker · ${task.role}`,
            subtitle: task.title,
            status: workerRun?.status ?? "queued",
            artifacts: [
              ...(artifactsByType["worker"]?.filter((a) => a.taskId === task.id) ?? []),
              ...(artifactsByType["patch"]?.filter((a) => a.taskId === task.id) ?? []),
            ],
            onArtifactClick,
            onCardClick:
              workerRun && onAgentClick ? () => onAgentClick(workerRun, task) : undefined,
            emptyHint: "Pending",
            showSourceHandle: true,
            showTargetHandle: true,
          },
          draggable: false,
          selectable: false,
        });
        es.push({ id: `e-planner-${id}`, source: "planner", target: id });
        es.push({ id: `e-${id}-supervisor`, source: id, target: "supervisor" });
      });
    }

    // Row 3: Supervisor
    const supervisorRun = grouped["supervisor"]?.[0];
    ns.push({
      id: "supervisor",
      type: "agent",
      position: { x: centerX, y: ROW_HEIGHT * 3 },
      data: {
        testId: "agent-card-supervisor",
        title: "Supervisor",
        subtitle: supervisorRun?.modelId ?? "—",
        status: supervisorRun?.status,
        artifacts: artifactsByType["review"] ?? [],
        onArtifactClick,
        onCardClick:
          supervisorRun && onAgentClick ? () => onAgentClick(supervisorRun, null) : undefined,
        emptyHint: "Awaiting workers",
        showSourceHandle: true,
        showTargetHandle: true,
      },
      draggable: false,
      selectable: false,
    });

    // Row 4: Integrator
    const integratorRun = grouped["integrator"]?.[0];
    ns.push({
      id: "integrator",
      type: "agent",
      position: { x: centerX, y: ROW_HEIGHT * 4 },
      data: {
        testId: "agent-card-integrator",
        title: "Integrator",
        subtitle: integratorRun?.modelId ?? "—",
        status: integratorRun?.status,
        artifacts: artifactsByType["final_plan"] ?? [],
        onArtifactClick,
        onCardClick:
          integratorRun && onAgentClick ? () => onAgentClick(integratorRun, null) : undefined,
        emptyHint: "Awaiting supervisor",
        showSourceHandle: false,
        showTargetHandle: true,
      },
      draggable: false,
      selectable: false,
    });
    es.push({ id: "e-supervisor-integrator", source: "supervisor", target: "integrator" });

    // Row 5: Verifier (only in controlled_auto mode or when verifier agents present)
    const verifierRun = grouped["verifier"]?.[0];
    const showVerifier = isControlledAuto || verifierRun;
    if (showVerifier) {
      ns.push({
        id: "verifier",
        type: "agent",
        position: { x: centerX, y: ROW_HEIGHT * 5 },
        data: {
          testId: "agent-card-verifier",
          title: "Verifier",
          subtitle: verifierRun?.modelId ?? "—",
          status: verifierRun?.status,
          artifacts: artifactsByType["verifier_report"] ?? [],
          onArtifactClick,
          onCardClick:
            verifierRun && onAgentClick ? () => onAgentClick(verifierRun, null) : undefined,
          emptyHint: "Awaiting verifier",
          showSourceHandle: false,
          showTargetHandle: true,
        },
        draggable: false,
        selectable: false,
      });
      es.push({ id: "e-integrator-verifier", source: "integrator", target: "verifier" });
    }

    return { nodes: ns, edges: es };
  }, [agentRuns, tasks, artifactsByType, grouped, onAgentClick, onArtifactClick, isControlledAuto]);

  // Side artifacts (progress / decisions) — rendered below the flow as a flat list
  const sideArtifacts = [
    ...(artifactsByType["progress"] ?? []),
    ...(artifactsByType["decisions"] ?? []),
  ];

  const verifierRow = isControlledAuto || grouped["verifier"]?.[0];
  const flowHeight = verifierRow ? 1440 : 1200;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold">Agent Board</h2>
        {isControlledAuto && round != null ? (
          <RoundCounter round={round} maxRounds={maxRounds} />
        ) : null}
      </div>

      {stopReason ? (
        <StopReasonBanner stopReason={stopReason} stopRound={stopRound ?? null} />
      ) : null}

      <div
        className="w-full rounded-lg border bg-muted/10"
        style={{ height: flowHeight }}
        data-testid="agent-board"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {sideArtifacts.length > 0 ? (
        <div
          className="rounded-lg border bg-card p-3"
          data-testid="agent-board-side-artifacts"
        >
          <p className="mb-2 text-sm font-semibold">Side artifacts</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sideArtifacts.map((a) => (
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
        </div>
      ) : null}
    </div>
  );
}
