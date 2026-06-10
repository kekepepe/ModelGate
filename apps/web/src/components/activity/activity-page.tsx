"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, GitCompare, RotateCcw, Trash2, X } from "lucide-react";

import { ApiError, deleteData, getData, postData } from "@/lib/api";
import { lookupError } from "@/lib/errors/dictionary";
import type { Provider, RequestLog, RunRecord } from "@/types/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { PageHeader } from "@/components/layout/page-header";

type ActivityEntry = {
  id: string;
  type: "run" | "request";
  time: string;
  task: string;
  providerId: string;
  modelId: string;
  status: string;
  latencyMs: number | null;
  requestId: string;
  compareGroupId?: string;
  raw: RunRecord | RequestLog;
};

export function ActivityPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const compareGroupId = searchParams.get("compareGroupId");

  // Open detail when ?runId=... is in URL (deep-link from Output ErrorBanner)
  useEffect(() => {
    const runId = searchParams.get("runId");
    if (runId && !selected) {
      setSearch(runId);
    }
  }, [searchParams, selected]);

  const runsQuery = useQuery({
    queryKey: ["history-runs"],
    queryFn: () => getData<RunRecord[]>("/history/runs"),
  });
  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => getData<Provider[]>("/providers"),
  });
  const logsQuery = useQuery({
    queryKey: ["request-logs", providerFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (providerFilter) params.set("providerId", providerFilter);
      const qs = params.toString();
      return getData<RequestLog[]>(`/logs/requests${qs ? `?${qs}` : ""}`);
    },
  });

  const providers = useMemo(() => providersQuery.data ?? [], [providersQuery.data]);
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const logs = useMemo(() => logsQuery.data ?? [], [logsQuery.data]);
  const providerNameById = useMemo(() => {
    const map = new Map<string, string>();
    providers.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [providers]);

  const entries: ActivityEntry[] = useMemo(() => {
    const runEntries: ActivityEntry[] = runs.map((run) => ({
      id: run.id,
      type: "run",
      time: run.createdAt ?? "",
      task: run.taskType,
      providerId: run.providerId,
      modelId: run.modelId,
      status: run.status,
      latencyMs: null,
      requestId: "",
      compareGroupId:
        typeof run.metadata?.compare_group_id === "string"
          ? run.metadata.compare_group_id
          : undefined,
      raw: run,
    }));
    const logEntries: ActivityEntry[] = logs.map((log) => ({
      id: log.id,
      type: "request",
      time: log.createdAt ?? "",
      task: log.recordType,
      providerId: log.providerId,
      modelId: log.modelId ?? "",
      status: log.errorType
        ? "failed"
        : log.statusCode && log.statusCode >= 400
          ? "failed"
          : "completed",
      latencyMs: log.latencyMs ?? null,
      requestId: log.id,
      raw: log,
    }));
    const seen = new Set<string>();
    const combined: ActivityEntry[] = [];
    for (const entry of [...runEntries, ...logEntries]) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        combined.push(entry);
      }
    }
    return combined.sort((a, b) => b.time.localeCompare(a.time));
  }, [runs, logs]);

  const filtered = useMemo(() => {
    let r = entries;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (e) =>
          e.id.toLowerCase().includes(q) ||
          e.providerId.toLowerCase().includes(q) ||
          e.modelId.toLowerCase().includes(q) ||
          e.task.toLowerCase().includes(q),
      );
    }
    if (statusFilter) r = r.filter((e) => e.status === statusFilter);
    if (typeFilter) r = r.filter((e) => e.type === typeFilter);
    if (providerFilter) r = r.filter((e) => e.providerId === providerFilter);
    if (compareGroupId) r = r.filter((e) => e.compareGroupId === compareGroupId);
    return r;
  }, [entries, search, statusFilter, typeFilter, providerFilter, compareGroupId]);

  const rerunMutation = useMutation({
    mutationFn: (run: RunRecord) =>
      postData<RunRecord>("/chat/runs", {
        taskType: run.taskType,
        modelId: run.modelId,
        prompt: typeof run.input?.prompt === "string" ? run.input.prompt : "",
        fileIds: Array.isArray(run.input?.fileIds) ? run.input.fileIds.map(String) : [],
        params: (run.params ?? {}) as Record<string, string | number | boolean>,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["history-runs"] });
      router.push("/workspace");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) => deleteData<{ deleted: boolean }>(`/history/${recordId}`),
    onSuccess: () => {
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["history-runs"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Unified view of runs, generation tasks, and request logs."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search id / provider / model / requestId..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Type filter"
        >
          <option value="">All Types</option>
          <option value="run">Run</option>
          <option value="request">Request</option>
        </select>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Provider filter"
        >
          <option value="">All Providers</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Status filter"
        >
          <option value="">All Status</option>
          <option value="completed">Completed</option>
          <option value="running">Running</option>
          <option value="queued">Queued</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {compareGroupId ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs">
            Group: {compareGroupId.slice(0, 8)}…
            <button
              type="button"
              className="ml-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams.toString());
                nextParams.delete("compareGroupId");
                router.replace(`${pathname}${nextParams.toString() ? `?${nextParams}` : ""}`, {
                  scroll: false,
                });
              }}
              aria-label="Clear compare group filter"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : null}
        {search || typeFilter || providerFilter || statusFilter ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              setSearch("");
              setTypeFilter("");
              setProviderFilter("");
              setStatusFilter("");
            }}
          >
            <X className="mr-1 h-3 w-3" /> Clear
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <Th>Time</Th>
                <Th>Type</Th>
                <Th>Task</Th>
                <Th>Provider</Th>
                <Th>Model</Th>
                <Th>Status</Th>
                <Th>Latency</Th>
                <Th>Record ID</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 100).map((entry) => (
                <tr key={entry.id} className="h-11 hover:bg-muted/30">
                  <Td className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatTime(entry.time)}
                  </Td>
                  <Td className="text-[11px] uppercase text-muted-foreground">{entry.type}</Td>
                  <Td className="text-xs">{entry.task}</Td>
                  <Td className="text-xs">
                    {providerNameById.get(entry.providerId) ?? entry.providerId ?? "—"}
                  </Td>
                  <Td className="font-mono text-[11px]">{entry.modelId || "—"}</Td>
                  <Td>
                    <StatusPill tone={statusTone(entry.status)} className="text-[10px]">
                      {titleCase(entry.status)}
                    </StatusPill>
                  </Td>
                  <Td className="text-xs text-muted-foreground">
                    {entry.latencyMs != null ? `${entry.latencyMs}ms` : "—"}
                  </Td>
                  <Td className="font-mono text-[11px] text-muted-foreground">
                    {entry.id.length > 18 ? `${entry.id.slice(0, 18)}…` : entry.id}
                  </Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSelected(entry)}
                    >
                      View
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No activity entries match your filters.
          </div>
        ) : null}
      </div>

      <DetailDrawer
        entry={selected}
        providerNameById={providerNameById}
        onClose={() => setSelected(null)}
        onRerun={(run) => rerunMutation.mutate(run)}
        onDelete={(id) => deleteMutation.mutate(id)}
        rerunPending={rerunMutation.isPending}
        deletePending={deleteMutation.isPending}
        deleteError={deleteMutation.error}
      />
    </div>
  );
}

/* ── Table primitives ─────────────────────────────────── */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>;
}

/* ── Detail drawer ────────────────────────────────────── */

function DetailDrawer({
  entry,
  providerNameById,
  onClose,
  onRerun,
  onDelete,
  rerunPending,
  deletePending,
  deleteError,
}: {
  entry: ActivityEntry | null;
  providerNameById: Map<string, string>;
  onClose: () => void;
  onRerun: (run: RunRecord) => void;
  onDelete: (id: string) => void;
  rerunPending: boolean;
  deletePending: boolean;
  deleteError: Error | null;
}) {
  const open = entry !== null;
  const run = entry?.type === "run" ? (entry.raw as RunRecord) : null;
  const log = entry?.type === "request" ? (entry.raw as RequestLog) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="w-[480px] overflow-y-auto sm:w-[520px]">
        <SheetHeader>
          <SheetTitle>{entry?.type === "run" ? "Run details" : "Request log"}</SheetTitle>
          <SheetDescription className="font-mono text-xs">{entry?.id}</SheetDescription>
        </SheetHeader>

        {entry ? (
          <div className="mt-6 space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusPill tone={statusTone(entry.status)} className="text-[11px]">
                {titleCase(entry.status)}
              </StatusPill>
              <span className="text-xs text-muted-foreground">{entry.task}</span>
              <span className="text-xs text-muted-foreground">
                · {providerNameById.get(entry.providerId) ?? entry.providerId ?? "—"}
              </span>
              {entry.modelId ? (
                <span className="font-mono text-xs text-muted-foreground">· {entry.modelId}</span>
              ) : null}
            </div>

            {run ? <RunDetail run={run} /> : null}
            {log ? <LogDetail log={log} /> : null}

            <div className="flex flex-wrap gap-2 pt-2">
              {run ? (
                <Button size="sm" onClick={() => onRerun(run)} disabled={rerunPending}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  {rerunPending ? "Submitting..." : "Rerun"}
                </Button>
              ) : null}
              {run ? (
                <Button asChild variant="outline" size="sm">
                  <a href={`/workspace?fromRun=${run.id}`}>
                    <GitCompare className="mr-1 h-3.5 w-3.5" /> Rerun with another model
                  </a>
                </Button>
              ) : null}
              {run?.providerId ? (
                <Button asChild variant="outline" size="sm">
                  <a href={`/api-keys?provider=${run.providerId}`}>
                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open API key
                  </a>
                </Button>
              ) : null}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(entry.id)}
                disabled={deletePending}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {deletePending ? "Deleting..." : "Delete"}
              </Button>
            </div>

            {deleteError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {deleteError instanceof ApiError
                  ? deleteError.message
                  : String(deleteError.message ?? deleteError)}
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function RunDetail({ run }: { run: RunRecord }) {
  return (
    <div className="space-y-3">
      <Section title="Summary">
        <DetailRow label="Run ID" value={run.id} copyable />
        <DetailRow label="Task type" value={run.taskType} />
        <DetailRow label="Model" value={run.modelId} />
        {run.createdAt ? <DetailRow label="Created" value={run.createdAt} /> : null}
        {run.errorType ? <DetailRow label="Error type" value={run.errorType} /> : null}
        {run.errorType ? (
          <DetailRow label="Error" value={lookupError(run.errorType).message} />
        ) : null}
        {run.errorMessage && run.errorMessage !== lookupError(run.errorType).message ? (
          <DetailRow label="Details" value={run.errorMessage} />
        ) : null}
      </Section>
      <Block label="Input" value={run.input} />
      <Block label="Params" value={run.params} />
      <Block label="Output" value={run.output} />
    </div>
  );
}

function LogDetail({ log }: { log: RequestLog }) {
  return (
    <div className="space-y-3">
      <Section title="Summary">
        <DetailRow label="Log ID" value={log.id} copyable />
        <DetailRow label="Provider" value={log.providerId} />
        {log.modelId ? <DetailRow label="Model" value={log.modelId} /> : null}
        <DetailRow label="Record type" value={log.recordType} />
        <DetailRow label="Record ID" value={log.recordId} copyable />
        <DetailRow
          label="Status code"
          value={log.statusCode != null ? String(log.statusCode) : "—"}
        />
        <DetailRow label="Latency" value={log.latencyMs != null ? `${log.latencyMs}ms` : "—"} />
        {log.errorType ? <DetailRow label="Error type" value={log.errorType} /> : null}
        {log.errorType ? (
          <DetailRow label="Error" value={lookupError(log.errorType).message} />
        ) : null}
        {log.errorMessage && log.errorMessage !== lookupError(log.errorType).message ? (
          <DetailRow label="Details" value={log.errorMessage} />
        ) : null}
        {log.createdAt ? <DetailRow label="Time" value={log.createdAt} /> : null}
      </Section>
      <Block label="Request" value={log.request} />
      <Block label="Response" value={log.response} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <dl className="space-y-1.5 text-xs">{children}</dl>
    </div>
  );
}

function DetailRow({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-start gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-[11px]">{value}</dd>
      {copyable ? (
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(value)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Copy ${label}`}
        >
          <Copy className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

function Block({ label, value }: { label: string; value: unknown }) {
  const text = useMemo(() => {
    if (value === null || value === undefined) return "(empty)";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-[11px] leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────── */

function statusTone(status: string): StatusTone {
  switch (status) {
    case "completed":
    case "success":
      return "ready";
    case "running":
      return "running";
    case "queued":
      return "queued";
    case "failed":
      return "failed";
    case "cancelled":
      return "warn";
    default:
      return "muted";
  }
}

function titleCase(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatTime(value: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
