"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ApiError, deleteData, getData, postData } from "@/lib/api";
import type { Provider, RequestLog, RunRecord } from "@/types/model";

export function HistoryClient() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selected, setSelected] = useState<RunRecord | RequestLog | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>("");
  const [recordTypeFilter, setRecordTypeFilter] = useState<string>("");
  const [recordIdFilter, setRecordIdFilter] = useState<string>("");

  const runsQuery = useQuery({ queryKey: ["history-runs"], queryFn: () => getData<RunRecord[]>("/history/runs") });
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: () => getData<Provider[]>("/providers") });
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
    <main className="min-h-screen bg-slate-100 p-6">
      <section className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <h1 className="text-2xl font-semibold">历史记录</h1>
          <p className="mt-1 text-sm text-slate-500">点击任意条目查看详情、重跑或删除。</p>
          <div className="mt-5 space-y-2">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelected(run)}
                className="block w-full rounded-md border border-slate-200 bg-white p-4 text-left transition hover:border-blue-400"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800">{run.id}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {run.taskType} / {run.modelId}
                    </div>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{run.status}</span>
                </div>
                {run.output?.text ? (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{run.output.text}</p>
                ) : null}
              </button>
            ))}
            {runs.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">暂无运行记录。</div>
            ) : null}
          </div>
        </div>

        <aside>
          <h2 className="text-sm font-semibold">请求日志</h2>
          <div className="mt-3 space-y-2">
            <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 text-xs">
              <label className="grid gap-1">
                <span className="text-slate-500">Provider</span>
                <select
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value)}
                  className="rounded border border-slate-200 bg-white px-2 py-1"
                >
                  <option value="">全部</option>
                  {providerOptions.map((id) => (
                    <option key={id} value={id}>
                      {providerNameById.get(id) ?? id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-slate-500">记录类型</span>
                <select
                  value={recordTypeFilter}
                  onChange={(e) => setRecordTypeFilter(e.target.value)}
                  className="rounded border border-slate-200 bg-white px-2 py-1"
                >
                  <option value="">全部</option>
                  <option value="run">run</option>
                  <option value="generation_task">generation_task</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-slate-500">记录 ID</span>
                <input
                  value={recordIdFilter}
                  onChange={(e) => setRecordIdFilter(e.target.value)}
                  placeholder="run_xxx 或 task_xxx"
                  className="rounded border border-slate-200 bg-white px-2 py-1"
                />
              </label>
            </div>
            <div className="space-y-2">
              {logs.map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelected(log)}
                  className="block w-full rounded-md border border-slate-200 bg-white p-3 text-left text-xs transition hover:border-blue-400"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-700">{log.providerId}</div>
                    <span className="text-slate-500">{log.statusCode ?? "-"}</span>
                  </div>
                  <div className="mt-1 text-slate-500">
                    {log.recordType} / {log.recordId}
                  </div>
                  {log.errorType ? <div className="mt-1 text-rose-600">{log.errorType}</div> : null}
                </button>
              ))}
              {logs.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-500">暂无匹配的请求日志。</div>
              ) : null}
            </div>
          </div>
        </aside>
      </section>

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
    </main>
  );
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
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">详情</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500"
          >
            关闭
          </button>
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
            <button
              type="button"
              onClick={() => onRerun(record as RunRecord)}
              disabled={rerunPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {rerunPending ? "提交中..." : "重跑"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDelete(record.id)}
            disabled={deletePending}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {deletePending ? "删除中..." : "删除"}
          </button>
        </div>
        {deleteError ? (
          <div className="mt-3 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
            {deleteError instanceof ApiError ? deleteError.message : String(deleteError.message ?? deleteError)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RunRecordDetail({ run }: { run: RunRecord }) {
  return (
    <>
      <DetailRow label="记录 ID" value={run.id} />
      <DetailRow label="任务类型" value={run.taskType} />
      <DetailRow label="模型" value={run.modelId} />
      <DetailRow label="状态" value={run.status} />
      {run.errorType ? <DetailRow label="错误类型" value={run.errorType} /> : null}
      {run.errorMessage ? <DetailRow label="错误信息" value={run.errorMessage} /> : null}
      {run.createdAt ? <DetailRow label="创建时间" value={run.createdAt} /> : null}
      <DetailBlock label="输入" value={run.input} />
      <DetailBlock label="参数" value={run.params} />
      <DetailBlock label="输出" value={run.output} />
    </>
  );
}

function RequestLogDetail({ log }: { log: RequestLog }) {
  return (
    <>
      <DetailRow label="日志 ID" value={log.id} />
      <DetailRow label="Provider" value={log.providerId} />
      {log.modelId ? <DetailRow label="模型" value={log.modelId} /> : null}
      <DetailRow label="记录类型" value={log.recordType} />
      <DetailRow label="记录 ID" value={log.recordId} />
      <DetailRow label="状态码" value={log.statusCode === null || log.statusCode === undefined ? "-" : String(log.statusCode)} />
      <DetailRow label="耗时" value={log.latencyMs === null || log.latencyMs === undefined ? "-" : `${log.latencyMs}ms`} />
      {log.errorType ? <DetailRow label="错误类型" value={log.errorType} /> : null}
      {log.errorMessage ? <DetailRow label="错误信息" value={log.errorMessage} /> : null}
      {log.createdAt ? <DetailRow label="时间" value={log.createdAt} /> : null}
      <DetailBlock label="请求" value={log.request} />
      <DetailBlock label="响应" value={log.response} />
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-b border-slate-100 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all text-slate-800">{value}</dd>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: unknown }) {
  const text = useMemo(() => {
    if (value === null || value === undefined) return "(空)";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <pre className="mt-1 max-h-60 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{text}</pre>
    </div>
  );
}
