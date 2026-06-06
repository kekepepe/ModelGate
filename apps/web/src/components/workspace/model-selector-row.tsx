"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Gauge, Info, Sparkles, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { getData } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ModelInfo, Provider, RecommendResult } from "@/types/model";

type ModelUsageRow = {
  modelId: string;
  providerId: string;
  requests: number;
  tokens: number;
  cost: number;
  successRate: number;
  avgLatencyMs: number | null;
};

export function ModelSelectorRow({
  availableModels,
  hiddenModels,
  selectedModelId,
  selectedModel,
  selectedProvider,
  providers,
  taskInputTypes,
  onSelectModel,
}: {
  availableModels: ModelInfo[];
  hiddenModels: RecommendResult["hiddenModels"];
  selectedModelId: string | null;
  selectedModel?: ModelInfo;
  selectedProvider?: Provider;
  providers: Provider[];
  taskInputTypes: string[];
  onSelectModel: (modelId: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Recent usage (latency, success rate) per model — see /api/usage/models
  const usageQuery = useQuery({
    queryKey: ["usage-models-summary"],
    queryFn: () => getData<ModelUsageRow[]>("/usage/models"),
    staleTime: 60_000,
  });

  const usageByModel = useMemo(() => {
    const map = new Map<string, ModelUsageRow>();
    (usageQuery.data ?? []).forEach((row) => map.set(row.modelId, row));
    return map;
  }, [usageQuery.data]);

  // Provider key status for selected provider
  const providerStatus = providerKeyStatus(selectedProvider);
  const matchInfo = getMatchInfo(selectedModel, availableModels, taskInputTypes);
  const usage = selectedModel ? usageByModel.get(selectedModel.id) : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
      <span className="text-xs text-muted-foreground">Model:</span>

      <Select value={selectedModelId ?? undefined} onValueChange={onSelectModel}>
        <SelectTrigger
          className="h-8 w-auto min-w-[220px] border-0 bg-transparent px-2 text-sm font-medium shadow-none focus:ring-0"
          aria-label="Select model"
        >
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent className="max-h-[420px] w-[420px]">
          {availableModels.length > 0 ? (
            <SelectGroup>
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Available ({availableModels.length})
              </div>
              {availableModels.map((model) => {
                const provider = providers.find((p) => p.id === model.provider);
                const u = usageByModel.get(model.id);
                return (
                  <SelectItem key={model.id} value={model.id} className="py-2">
                    <ModelOptionRow model={model} provider={provider} usage={u} />
                  </SelectItem>
                );
              })}
            </SelectGroup>
          ) : null}
          {hiddenModels.length > 0 ? (
            <SelectGroup>
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Unavailable ({hiddenModels.length})
              </div>
              {hiddenModels.map((hidden) => (
                <div
                  key={hidden.id}
                  className="cursor-not-allowed px-2 py-1.5 opacity-60"
                  title={hidden.reasons.join(" · ")}
                >
                  <div className="text-xs font-medium">{hidden.displayName}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1">
                    {hidden.reasons.join(" · ")}
                  </div>
                </div>
              ))}
            </SelectGroup>
          ) : null}
        </SelectContent>
      </Select>

      {selectedProvider ? (
        <Badge variant="secondary" className="text-[11px]">
          {selectedProvider.name}
        </Badge>
      ) : null}

      <StatusPill tone={providerStatus.tone} className="text-[11px]">
        {providerStatus.label}
      </StatusPill>

      {matchInfo ? (
        <Badge variant="outline" className="gap-1 text-[11px] font-normal">
          <Sparkles className="h-3 w-3" /> {matchInfo}
        </Badge>
      ) : null}

      {usage?.avgLatencyMs ? (
        <Badge variant="outline" className="gap-1 text-[11px] font-normal">
          <Zap className="h-3 w-3" /> {formatLatency(usage.avgLatencyMs)}
        </Badge>
      ) : null}

      {usage && usage.requests > 0 && usage.successRate < 0.9 ? (
        <Badge variant="outline" className="gap-1 border-amber-400/40 bg-amber-50 text-[11px] font-normal text-amber-700">
          <Gauge className="h-3 w-3" /> {Math.round(usage.successRate * 100)}% recent success
        </Badge>
      ) : null}

      <div className="ml-auto">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-muted-foreground"
          onClick={() => setDetailsOpen(true)}
          disabled={!selectedModel}
        >
          <Info className="h-3.5 w-3.5" /> Details
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>

      <ModelDetailsSheet
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        model={selectedModel}
        provider={selectedProvider}
        usage={usage}
        providerStatus={providerStatus}
      />
    </div>
  );
}

/* ── Inner components ─────────────────────────────────── */

function ModelOptionRow({
  model,
  provider,
  usage,
}: {
  model: ModelInfo;
  provider?: Provider;
  usage?: ModelUsageRow;
}) {
  const inputs = model.inputTypes.join(", ") || "text";
  return (
    <div className="flex w-full flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{model.displayName}</span>
        {provider ? (
          <span className="text-[11px] text-muted-foreground">· {provider.name}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{model.runtime}</span>
        <span>·</span>
        <span>inputs: {inputs}</span>
        {usage?.avgLatencyMs ? (
          <>
            <span>·</span>
            <span>~{formatLatency(usage.avgLatencyMs)}</span>
          </>
        ) : null}
        {usage && usage.requests > 0 ? (
          <>
            <span>·</span>
            <span>{Math.round(usage.successRate * 100)}% ok</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ModelDetailsSheet({
  open,
  onOpenChange,
  model,
  provider,
  usage,
  providerStatus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model?: ModelInfo;
  provider?: Provider;
  usage?: ModelUsageRow;
  providerStatus: { tone: "ready" | "warn" | "muted"; label: string };
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[460px]">
        <SheetHeader>
          <SheetTitle>{model?.displayName ?? "No model selected"}</SheetTitle>
          <SheetDescription className="text-xs">
            {model?.officialModelName ?? ""}
          </SheetDescription>
        </SheetHeader>

        {model ? (
          <div className="mt-6 space-y-5 text-sm">
            <DetailField label="Provider" value={provider?.name ?? model.provider} />
            <DetailField label="Key status">
              <StatusPill tone={providerStatus.tone} className="text-[11px]">
                {providerStatus.label}
              </StatusPill>
            </DetailField>
            <DetailField label="Runtime" value={model.runtime} />
            <DetailField label="Inputs" value={model.inputTypes.join(", ") || "—"} />
            <DetailField label="Outputs" value={model.outputTypes.join(", ") || "—"} />
            <DetailField label="Capabilities" value={model.capabilities.join(", ") || "—"} />
            <DetailField label="Task types" value={model.taskTypes.join(", ") || "—"} />
            <DetailField
              label="Context window"
              value={model.contextWindow ? `${model.contextWindow.toLocaleString()} tokens` : "—"}
            />
            <DetailField label="Params schema" value={model.paramsSchema} />

            <div className="rounded-md border bg-muted/40 p-3">
              <div className="text-[11px] font-medium uppercase text-muted-foreground">
                Recent usage
              </div>
              {usage && usage.requests > 0 ? (
                <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                  <Stat label="Requests" value={usage.requests.toString()} />
                  <Stat
                    label="Success rate"
                    value={`${Math.round(usage.successRate * 100)}%`}
                  />
                  <Stat
                    label="Avg latency"
                    value={usage.avgLatencyMs ? formatLatency(usage.avgLatencyMs) : "—"}
                  />
                  <Stat label="Tokens" value={usage.tokens.toLocaleString()} />
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">
                  No recent runs for this model.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-6 text-sm text-muted-foreground">
            Select a model first to see its capabilities.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className={cn("text-right text-xs", value ? "font-medium" : "")}>
        {children ?? value ?? "—"}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────── */

function providerKeyStatus(provider?: Provider): {
  tone: "ready" | "warn" | "muted";
  label: string;
} {
  if (!provider) return { tone: "muted", label: "No provider" };
  if (!provider.enabled) return { tone: "muted", label: "Disabled" };
  if (!provider.configured) return { tone: "warn", label: "No Key" };
  return { tone: "ready", label: provider.keySource === "env" ? "Ready · Env" : "Ready" };
}

function getMatchInfo(
  model: ModelInfo | undefined,
  availableModels: ModelInfo[],
  taskInputTypes: string[],
): string | null {
  if (!model || availableModels.length === 0) return null;
  const isBest = availableModels[0]?.id === model.id;
  const supportsFile = taskInputTypes.includes("file") && model.inputTypes.includes("file");
  const supportsImage = taskInputTypes.includes("image") && model.inputTypes.includes("image");
  if (isBest) return "Best match";
  if (supportsFile) return "Supports files";
  if (supportsImage) return "Supports images";
  return null;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
