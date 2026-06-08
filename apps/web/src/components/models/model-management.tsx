"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { GitCompare, X } from "lucide-react";

import { getData } from "@/lib/api";
import type { ModelInfo, Provider } from "@/types/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/page-header";

export function ModelManagement() {
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: () => getData<Provider[]>("/providers") });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: () => getData<ModelInfo[]>("/models") });
  const providers = providersQuery.data ?? [];
  const models = modelsQuery.data ?? [];

  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 3) {
        next.add(id);
      }
      return next;
    });
  };

  const selectedModels = models.filter((m) => selectedIds.has(m.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Models"
        description={`${models.length} models / ${providers.length} providers`}
        action={
          compareMode ? (
            <Button variant="outline" size="sm" onClick={() => { setCompareMode(false); setSelectedIds(new Set()); }}>
              <X className="mr-1 h-3.5 w-3.5" /> Exit compare
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setCompareMode(true)}>
              <GitCompare className="mr-1 h-3.5 w-3.5" /> Compare
            </Button>
          )
        }
      />

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              {compareMode ? (
                <th className="w-10 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span className="sr-only">Select</span>
                </th>
              ) : null}
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Model</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Provider</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Runtime</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Capabilities</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {models.map((model) => (
              <tr
                key={model.id}
                className={`hover:bg-muted/30 ${selectedIds.has(model.id) ? "bg-primary/5" : ""}`}
              >
                {compareMode ? (
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(model.id)}
                      onChange={() => toggleSelect(model.id)}
                      disabled={!selectedIds.has(model.id) && selectedIds.size >= 3}
                      className="h-4 w-4 rounded border-input"
                      aria-label={`Select ${model.displayName}`}
                    />
                  </td>
                ) : null}
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

      {/* Sticky compare bar */}
      {compareMode && selectedIds.size >= 2 ? (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border bg-card px-4 py-2.5 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{selectedIds.size} models selected</span>
            <Button size="sm" onClick={() => setCompareOpen(true)}>
              <GitCompare className="mr-1 h-3.5 w-3.5" /> Compare
            </Button>
          </div>
        </div>
      ) : null}

      {/* Compare dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Model Comparison</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Field</th>
                  {selectedModels.map((m) => (
                    <th key={m.id} className="px-3 py-2 text-left text-xs font-medium">
                      {m.displayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <CompareRow label="Provider" values={selectedModels.map((m) => providers.find((p) => p.id === m.provider)?.name ?? m.provider)} />
                <CompareRow label="Runtime" values={selectedModels.map((m) => m.runtime)} />
                <CompareRow label="Category" values={selectedModels.map((m) => m.category)} />
                <CompareRow label="Input types" values={selectedModels.map((m) => m.inputTypes.join(", ") || "—")} />
                <CompareRow label="Output types" values={selectedModels.map((m) => m.outputTypes.join(", ") || "—")} />
                <CompareRow label="Context window" values={selectedModels.map((m) => m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}K` : "—")} />
                <CompareRow label="Async" values={selectedModels.map((m) => m.async ? "Yes" : "No")} />
                <CompareRow
                  label="Capabilities"
                  values={selectedModels.map((m) => m.capabilities.length > 0 ? m.capabilities.join(", ") : "—")}
                />
                <CompareRow
                  label="Status"
                  values={selectedModels.map((m) => m.enabled ? "Enabled" : "Disabled")}
                />
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompareRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <td className="px-3 py-2 text-xs text-muted-foreground">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-3 py-2 text-xs">{v}</td>
      ))}
    </tr>
  );
}
