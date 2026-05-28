"use client";

import { useQuery } from "@tanstack/react-query";

import { getData } from "@/lib/api";
import type { RequestLog, RunRecord } from "@/types/model";

export function HistoryClient() {
  const runsQuery = useQuery({ queryKey: ["history-runs"], queryFn: () => getData<RunRecord[]>("/history/runs") });
  const logsQuery = useQuery({ queryKey: ["request-logs"], queryFn: () => getData<RequestLog[]>("/logs/requests") });
  const runs = runsQuery.data ?? [];
  const logs = logsQuery.data ?? [];

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <section className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <h1 className="text-2xl font-semibold">历史记录</h1>
          <div className="mt-5 space-y-3">
            {runs.map((run) => (
              <div key={run.id} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{run.id}</div>
                    <div className="mt-1 text-xs text-slate-500">{run.taskType} / {run.modelId}</div>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{run.status}</span>
                </div>
                {run.output?.text ? <p className="mt-3 line-clamp-2 text-sm text-slate-600">{run.output.text}</p> : null}
              </div>
            ))}
            {runs.length === 0 ? <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">暂无运行记录。</div> : null}
          </div>
        </div>

        <aside>
          <h2 className="text-sm font-semibold">请求日志</h2>
          <div className="mt-3 space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-md border border-slate-200 bg-white p-3 text-xs">
                <div className="font-medium">{log.providerId}</div>
                <div className="mt-1 text-slate-500">{log.recordType} / {log.statusCode ?? "-"}</div>
              </div>
            ))}
            {logs.length === 0 ? <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-500">暂无请求日志。</div> : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
