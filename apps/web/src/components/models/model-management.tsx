"use client";

import { useQuery } from "@tanstack/react-query";

import { getData } from "@/lib/api";
import type { ModelInfo, Provider } from "@/types/model";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";

export function ModelManagement() {
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: () => getData<Provider[]>("/providers") });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: () => getData<ModelInfo[]>("/models") });
  const providers = providersQuery.data ?? [];
  const models = modelsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Models"
        description={`${models.length} models / ${providers.length} providers`}
      />

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Model</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Provider</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Runtime</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Capabilities</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {models.map((model) => (
              <tr key={model.id} className="hover:bg-muted/30">
                <td className="px-3 py-3">
                  <div className="font-medium">{model.displayName}</div>
                  <div className="text-xs text-muted-foreground font-mono">{model.officialModelName}</div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {providers.find((provider) => provider.id === model.provider)?.name ?? model.provider}
                </td>
                <td className="px-3 py-3 text-muted-foreground">{model.runtime}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {model.capabilities.slice(0, 4).map((cap) => (
                      <Badge key={cap} variant="secondary" className="text-[10px]">{cap}</Badge>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Badge variant={model.enabled ? "success" : "secondary"}>
                    {model.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
