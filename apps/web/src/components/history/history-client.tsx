"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ApiError, deleteData, getData, postData } from "@/lib/api";
import type { Provider, RequestLog, RunRecord } from "@/types/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";

export function HistoryClient() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selected, setSelected] = useState<RunRecord | RequestLog | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>("");
  const [recordTypeFilter, setRecordTypeFilter] = useState<string>("");
  const [recordIdFilter, setRecordIdFilter] = useState<string>("");

  const runsQuery = useQuery({
    queryKey: ["history-runs"],
    queryFn: () => getData<RunRecord[]>("/history/runs"),
  });
  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => getData<Provider[]>("/providers"),
  });
  const logsQuery = useQuery({
    queryKey: ["request-logs", providerFilter, recordTypeFilter, recordIdFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (providerFilter) params.set("providerId", providerFilter);
      if (recordTypeFilter) params.set("recordType", recordTypeFilter);
      if (recordIdFilter) params.set("recordId", recordIdFilter);
      const queryString = params.toString();
      return getData<RequestLog[]>(`/logs/requests${queryString ? `?${queryString}` : ""}`);
    },
  });

  const runs = runsQuery.data ?? [];
  const providers = useMemo(() => providersQuery.data ?? [], [providersQuery.data]);
  const logs = logsQuery.data ?? [];

  const rerunMutation = useMutation({
    mutationFn: (run: RunRecord) =>
      postData<{ data: RunRecord }>("/chat/runs", {
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

  const providerOptions = useMemo(() => {
    const ids = new Set<string>();
    providers.forEach((p) => ids.add(p.id));
    return Array.from(ids).sort();
  }, [providers]);
  const providerNameById = useMemo(() => {
    const map = new Map<string, string>();
    providers.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [providers]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="History"
        description="Click any entry to view details, rerun, or delete."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Run records */}
        <div className="space-y-2">
          {runs.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => setSelected(run)}
              className="block w-full rounded-lg border bg-card p-4 text-left transition hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium font-mono">{run.id}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {run.taskType} / {run.modelId}
                  </div>
                </div>
                <StatusBadge status={run.status} />
              </div>
              {run.output?.text ? (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{run.output.text}</p>
              ) : null}
            </button>
          ))}
          {runs.length === 0 ? (
            <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              No run records yet.
            </div>
          ) : null}
        </div>

        {/* Request logs sidebar */}
        <aside className="space-y-3">
          <h2 className="text-sm font-semibold">Request Logs</h2>
          <div className="grid gap-2 rounded-lg border bg-card p-3 text-xs">
            <label className="grid gap-1">
              <span className="text-muted-foreground">Provider</span>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">All</option>
                {providerOptions.map((id) => (
                  <option key={id} value={id}>
                    {providerNameById.get(id) ?? id}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-muted-foreground">Record Type</span>
              <select
                value={recordTypeFilter}
                onChange={(e) => setRecordTypeFilter(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">All</option>
                <option value="run">run</option>
                <option value="generation_task">generation_task</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-muted-foreground">Record ID</span>
              <Input
                value={recordIdFilter}
                onChange={(e) => setRecordIdFilter(e.target.value)}
                placeholder="run_xxx or task_xxx"
                className="h-8 text-xs"
              />
            </label>
          </div>
          <div className="space-y-2">
            {logs.map((log) => (
              <button
                key={log.id}
                type="button"
                onClick={() => setSelected(log)}
                className="block w-full rounded-lg border bg-card p-3 text-left text-xs transition hover:border-primary/40"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{log.providerId}</div>
                  <span className="text-muted-foreground">{log.statusCode ?? "-"}</span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {log.recordType} / {log.recordId}
                </div>
                {log.errorType ? (
                  <div className="mt-1 text-destructive">{log.errorType}</div>
                ) : null}
              </button>
            ))}
            {logs.length === 0 ? (
              <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
                No matching request logs.
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {selected ? (
        <DetailDrawer
          record={selected}
          onClose={() => setSelected(null)}
          onRerun={(run) => rerunMutation.mutate(run)}
          onDelete={(recordId) => deleteMutation.mutate(recordId)}
          rerunPending={rerunMutation.isPending}
          deletePending={deleteMutation.isPending}
          deleteError={deleteMutation.error}
        />
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "success" | "info" | "warning" | "destructive" | "secondary"> = {
    completed: "success",
    success: "success",
    running: "info",
    queued: "warning",
    failed: "destructive",
    cancelled: "secondary",
  };
  return <Badge variant={variantMap[status] ?? "secondary"}>{status}</Badge>;
}

function DetailDrawer({
  record,
  onClose,
  onRerun,
  onDelete,
  rerunPending,
  deletePending,
  deleteError,
}: {
  record: RunRecord | RequestLog;
  onClose: () => void;
  onRerun: (run: RunRecord) => void;
  onDelete: (recordId: string) => void;
  rerunPending: boolean;
  deletePending: boolean;
  deleteError: Error | null;
}) {
  const isRunRecord = !("providerId" in record) || (record as RunRecord).taskType !== undefined;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Details</h2>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="mt-4 space-y-4 text-sm">
          {"providerId" in record ? (
            <RequestLogDetail log={record as RequestLog} />
          ) : (
            <RunRecordDetail run={record as RunRecord} />
          )}
        </div>
        <div className="mt-6 flex gap-2">
          {isRunRecord ? (
            <Button onClick={() => onRerun(record as RunRecord)} disabled={rerunPending}>
              {rerunPending ? "Submitting..." : "Rerun"}
            </Button>
          ) : null}
          <Button
            variant="destructive"
            onClick={() => onDelete(record.id)}
            disabled={deletePending}
          >
            {deletePending ? "Deleting..." : "Delete"}
          </Button>
        </div>
        {deleteError ? (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {deleteError instanceof ApiError
              ? deleteError.message
              : String(deleteError.message ?? deleteError)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RunRecordDetail({ run }: { run: RunRecord }) {
  return (
    <>
      <DetailRow label="Record ID" value={run.id} />
      <DetailRow label="Task Type" value={run.taskType} />
      <DetailRow label="Model" value={run.modelId} />
      <DetailRow label="Status" value={run.status} />
      {run.errorType ? <DetailRow label="Error Type" value={run.errorType} /> : null}
      {run.errorMessage ? <DetailRow label="Error Message" value={run.errorMessage} /> : null}
      {run.createdAt ? <DetailRow label="Created" value={run.createdAt} /> : null}
      <DetailBlock label="Input" value={run.input} />
      <DetailBlock label="Params" value={run.params} />
      <DetailBlock label="Output" value={run.output} />
    </>
  );
}

function RequestLogDetail({ log }: { log: RequestLog }) {
  return (
    <>
      <DetailRow label="Log ID" value={log.id} />
      <DetailRow label="Provider" value={log.providerId} />
      {log.modelId ? <DetailRow label="Model" value={log.modelId} /> : null}
      <DetailRow label="Record Type" value={log.recordType} />
      <DetailRow label="Record ID" value={log.recordId} />
      <DetailRow
        label="Status Code"
        value={
          log.statusCode === null || log.statusCode === undefined ? "-" : String(log.statusCode)
        }
      />
      <DetailRow
        label="Latency"
        value={log.latencyMs === null || log.latencyMs === undefined ? "-" : `${log.latencyMs}ms`}
      />
      {log.errorType ? <DetailRow label="Error Type" value={log.errorType} /> : null}
      {log.errorMessage ? <DetailRow label="Error Message" value={log.errorMessage} /> : null}
      {log.createdAt ? <DetailRow label="Time" value={log.createdAt} /> : null}
      <DetailBlock label="Request" value={log.request} />
      <DetailBlock label="Response" value={log.response} />
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-b py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: unknown }) {
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
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <pre className="mt-1 max-h-60 overflow-auto rounded-md bg-muted/50 p-3 text-xs">{text}</pre>
    </div>
  );
}
