"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { estimateCost, formatCost } from "@/lib/cost";
import type { AgentRunView, ProjectTaskView } from "@/lib/api";

interface Props {
  agentRuns: AgentRunView[];
  tasks: ProjectTaskView[];
  onRowClick?: (agentRun: AgentRunView) => void;
  selectedAgentId?: string | null;
}

type SortKey = "role" | "model" | "status" | "time" | "tokens" | "cost";

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

function formatRoleLabel(role: string, taskTitle?: string): string {
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return taskTitle ? `${label} · ${taskTitle}` : label;
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface RowData {
  agentRun: AgentRunView;
  taskTitle: string;
  cost: number | null;
}

export function AgentRunTable({ agentRuns, tasks, onRowClick, selectedAgentId }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("role");
  const [sortAsc, setSortAsc] = useState(true);

  const taskMap = useMemo(() => {
    const m = new Map<string, ProjectTaskView>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const rows = useMemo<RowData[]>(() => {
    return agentRuns.map((ar) => ({
      agentRun: ar,
      taskTitle: ar.taskId ? (taskMap.get(ar.taskId)?.title ?? "") : "",
      cost: estimateCost(ar.modelId, ar.inputTokens, ar.outputTokens),
    }));
  }, [agentRuns, taskMap]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "role":
          cmp = formatRoleLabel(a.agentRun.role, a.taskTitle).localeCompare(
            formatRoleLabel(b.agentRun.role, b.taskTitle),
          );
          break;
        case "model":
          cmp = (a.agentRun.modelId ?? "").localeCompare(b.agentRun.modelId ?? "");
          break;
        case "status":
          cmp = (a.agentRun.status ?? "").localeCompare(b.agentRun.status ?? "");
          break;
        case "time":
          cmp = (a.agentRun.latencyMs ?? 0) - (b.agentRun.latencyMs ?? 0);
          break;
        case "tokens":
          cmp = (a.agentRun.totalTokens ?? 0) - (b.agentRun.totalTokens ?? 0);
          break;
        case "cost":
          cmp = (a.cost ?? 0) - (b.cost ?? 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortAsc]);

  const totals = useMemo(() => {
    let tokens = 0;
    let cost = 0;
    let hasCost = false;
    for (const r of rows) {
      tokens += r.agentRun.totalTokens ?? 0;
      if (r.cost != null) {
        cost += r.cost;
        hasCost = true;
      }
    }
    return { tokens, cost: hasCost ? cost : null };
  }, [rows]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return null;
    return sortAsc ? (
      <ChevronUp className="inline h-3 w-3" />
    ) : (
      <ChevronDown className="inline h-3 w-3" />
    );
  }

  if (agentRuns.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card" data-testid="agent-run-table">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-muted-foreground">
              <th
                className="cursor-pointer px-3 py-2 font-medium hover:text-foreground"
                onClick={() => handleSort("role")}
              >
                Agent <SortIcon column="role" />
              </th>
              <th
                className="cursor-pointer px-3 py-2 font-medium hover:text-foreground"
                onClick={() => handleSort("model")}
              >
                Model <SortIcon column="model" />
              </th>
              <th
                className="cursor-pointer px-3 py-2 font-medium hover:text-foreground"
                onClick={() => handleSort("status")}
              >
                Status <SortIcon column="status" />
              </th>
              <th
                className="cursor-pointer px-3 py-2 font-medium hover:text-foreground"
                onClick={() => handleSort("time")}
              >
                Time <SortIcon column="time" />
              </th>
              <th
                className="cursor-pointer px-3 py-2 font-medium hover:text-foreground"
                onClick={() => handleSort("tokens")}
              >
                Tokens <SortIcon column="tokens" />
              </th>
              <th
                className="cursor-pointer px-3 py-2 font-medium hover:text-foreground"
                onClick={() => handleSort("cost")}
              >
                Cost <SortIcon column="cost" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ agentRun: ar, taskTitle, cost }) => (
              <tr
                key={ar.id}
                className={`cursor-pointer border-b last:border-0 hover:bg-muted/20 ${
                  ar.id === selectedAgentId ? "bg-primary/5" : ""
                }`}
                onClick={() => onRowClick?.(ar)}
                data-testid={`agent-run-table-row-${ar.role}`}
              >
                <td className="px-3 py-1.5 font-medium">{formatRoleLabel(ar.role, taskTitle)}</td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{ar.modelId ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <StatusPill tone={statusTone(ar.status)} withDot={false}>
                    {ar.status ?? "—"}
                  </StatusPill>
                </td>
                <td className="px-3 py-1.5 font-mono">{formatDuration(ar.latencyMs)}</td>
                <td className="px-3 py-1.5 font-mono">
                  {formatTokens(ar.inputTokens)} / {formatTokens(ar.outputTokens)} /{" "}
                  {formatTokens(ar.totalTokens)}
                </td>
                <td className="px-3 py-1.5 font-mono">{formatCost(cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/20 font-medium">
              <td className="px-3 py-1.5" colSpan={3}>
                Total
              </td>
              <td className="px-3 py-1.5" />
              <td className="px-3 py-1.5 font-mono">{formatTokens(totals.tokens)}</td>
              <td className="px-3 py-1.5 font-mono">{formatCost(totals.cost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
