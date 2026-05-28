"use client";

import { useQuery } from "@tanstack/react-query";

import { getData } from "@/lib/api";
import type { Provider } from "@/types/model";

export function SettingsClient() {
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: () => getData<Provider[]>("/providers") });
  const providers = providersQuery.data ?? [];

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <section className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold">设置</h1>
        <div className="mt-5 rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Provider Key</h2>
          <div className="mt-3 space-y-2">
            {providers.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between rounded-md bg-slate-50 p-3 text-sm">
                <div>
                  <div className="font-medium">{provider.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{provider.envKey}</div>
                </div>
                <span className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-600">
                  {provider.enabled ? "启用" : "禁用"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
