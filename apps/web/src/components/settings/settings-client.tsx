"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";

import { ApiError, deleteData, getData, putData } from "@/lib/api";
import type { Provider } from "@/types/model";

export function SettingsClient() {
  const queryClient = useQueryClient();
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: () => getData<Provider[]>("/providers") });
  const providers = providersQuery.data ?? [];
  const saveKeyMutation = useMutation({
    mutationFn: ({ providerId, apiKey }: { providerId: string; apiKey: string }) =>
      putData<Provider>(`/providers/${providerId}/key`, { apiKey }),
    onSuccess: (provider) => {
      setDraftKeys((current) => ({ ...current, [provider.id]: "" }));
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });
  const clearKeyMutation = useMutation({
    mutationFn: (providerId: string) => deleteData<Provider>(`/providers/${providerId}/key`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }),
  });

  return (
    <main className="min-h-screen bg-[#07111f] p-6 text-slate-100">
      <section className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">设置</h1>
            <p className="mt-1 text-sm text-slate-400">API Key 只写入后端本地数据库，不会回显明文。</p>
          </div>
          <a href="/workspace?taskType=chat" className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-blue-500">
            返回工作台
          </a>
        </div>
        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-amber-300" aria-hidden="true" />
            Provider Key
          </h2>
          <div className="mt-3 space-y-3">
            {providers.map((provider) => (
              <form
                key={provider.id}
                className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  const apiKey = (draftKeys[provider.id] ?? "").trim();
                  if (apiKey) saveKeyMutation.mutate({ providerId: provider.id, apiKey });
                }}
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-100">{provider.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{provider.envKey ?? "无 envKey"}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${provider.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-400"}`}>
                      {provider.enabled ? "启用" : "禁用"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 ${provider.configured ? "bg-blue-500/15 text-blue-300" : "bg-amber-500/15 text-amber-300"}`}>
                      {provider.configured ? `已配置：${provider.keySource === "local" ? "本地 UI" : "环境变量"}` : "未配置"}
                    </span>
                  </div>
                </div>
                <input
                  type="password"
                  value={draftKeys[provider.id] ?? ""}
                  onChange={(event) => setDraftKeys((current) => ({ ...current, [provider.id]: event.target.value }))}
                  placeholder="输入新的 API Key"
                  className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
                  autoComplete="off"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={!draftKeys[provider.id]?.trim() || saveKeyMutation.isPending}
                    className="h-10 rounded-md bg-blue-600 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    disabled={clearKeyMutation.isPending || provider.keySource !== "local"}
                    onClick={() => clearKeyMutation.mutate(provider.id)}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-slate-700 px-3 text-slate-300 disabled:cursor-not-allowed disabled:text-slate-600"
                    title="清除本地 UI Key"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </form>
            ))}
            {providers.length === 0 ? <div className="rounded-md border border-slate-800 p-4 text-sm text-slate-500">暂无 Provider。</div> : null}
          </div>
          {saveKeyMutation.error ? <ErrorText error={saveKeyMutation.error} /> : null}
          {clearKeyMutation.error ? <ErrorText error={clearKeyMutation.error} /> : null}
        </div>
      </section>
    </main>
  );
}

function ErrorText({ error }: { error: Error }) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
      {error.message}
      {requestId ? <span className="ml-2 text-xs text-rose-300">requestId: {requestId}</span> : null}
    </div>
  );
}
