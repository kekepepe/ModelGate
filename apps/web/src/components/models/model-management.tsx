"use client";

import { useQuery } from "@tanstack/react-query";

import { getData } from "@/lib/api";
import type { ModelInfo, Provider } from "@/types/model";

export function ModelManagement() {
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: () => getData<Provider[]>("/providers") });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: () => getData<ModelInfo[]>("/models") });
  const providers = providersQuery.data ?? [];
  const models = modelsQuery.data ?? [];

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <section className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">模型管理</h1>
            <p className="mt-1 text-sm text-slate-500">{models.length} 个模型 / {providers.length} 个 Provider</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">模型</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Runtime</th>
                <th className="px-3 py-2">能力</th>
                <th className="px-3 py-2">状态</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-medium">{model.displayName}</td>
                  <td className="px-3 py-3">{providers.find((provider) => provider.id === model.provider)?.name ?? model.provider}</td>
                  <td className="px-3 py-3 text-slate-600">{model.runtime}</td>
                  <td className="px-3 py-3 text-slate-600">{model.capabilities.slice(0, 4).join(", ")}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded px-2 py-1 text-xs ${model.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {model.enabled ? "启用" : "禁用"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
