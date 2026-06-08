"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X, Play, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import type { ModelInfo, Provider, RunRecord } from "@/types/model";
import { streamChatRun } from "@/components/workspace/use-workspace-queries";
import { ErrorBanner } from "@/components/workspace/error-banner";

const MAX_SLOTS = 3;
const MIN_RUN_SLOTS = 2;

export type CompareSlot = {
  slotId: string;
  modelId: string;
  status: "idle" | "running" | "ok" | "failed" | "cancelled";
  run: RunRecord | null;
  errorMessage: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Per-model params override. When empty, uses shared params. */
  paramsOverride: Record<string, string | number | boolean> | null;
};

type SortKey = "latency" | "tokens" | null;
type SortDir = "asc" | "desc";

type Props = {
  open: boolean;
  onClose: () => void;
  taskType: string;
  prompt: string;
  fileIds: string[];
  params: Record<string, string | number | boolean>;
  availableModels: ModelInfo[];
  providers: Provider[];
  initialModelIds: string[];
};

function makeSlot(modelId: string): CompareSlot {
  return {
    slotId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random()}`,
    modelId,
    status: "idle",
    run: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    paramsOverride: null,
  };
}

export function CompareDrawer({
  open,
  onClose,
  taskType,
  prompt,
  fileIds,
  params,
  availableModels,
  providers,
  initialModelIds,
}: Props) {
  const [slots, setSlots] = useState<CompareSlot[]>(() => initialModelIds.slice(0, MAX_SLOTS).map(makeSlot));
  const [running, setRunning] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const compareGroupId = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `cg-${Date.now()}`,
    // Regenerate group id every time drawer opens, regardless of model changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  useEffect(() => {
    if (open) {
      setSlots(initialModelIds.slice(0, MAX_SLOTS).map(makeSlot));
    }
    // Only re-seed slots on drawer-open, not when initialModelIds changes mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Sort slots by the chosen metric. Slots without results sink to the end. */
  const sortedSlots = useMemo(() => {
    if (!sortKey) return slots;
    const getVal = (s: CompareSlot): number | null => {
      if (sortKey === "latency" && s.startedAt && s.finishedAt) return s.finishedAt - s.startedAt;
      if (sortKey === "tokens" && s.run?.output && typeof s.run.output === "object") {
        return 0;
      }
      return null;
    };
    return [...slots].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [slots, sortKey, sortDir]);

  if (!open) return null;

  const updateSlot = (slotId: string, patch: Partial<CompareSlot>) => {
    setSlots((prev) => prev.map((s) => (s.slotId === slotId ? { ...s, ...patch } : s)));
  };

  const setSlotModel = (slotId: string, modelId: string) => {
    setSlots((prev) => prev.map((s) => (s.slotId === slotId ? { ...s, modelId, run: null, status: "idle", errorMessage: null, paramsOverride: null } : s)));
  };

  const setSlotParams = (slotId: string, overrides: Record<string, string | number | boolean> | null) => {
    setSlots((prev) => prev.map((s) => (s.slotId === slotId ? { ...s, paramsOverride: overrides } : s)));
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const removeSlot = (slotId: string) => {
    setSlots((prev) => prev.filter((s) => s.slotId !== slotId));
  };

  const addSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    const used = new Set(slots.map((s) => s.modelId));
    const candidate = availableModels.find((m) => !used.has(m.id))?.id ?? availableModels[0]?.id ?? "";
    setSlots((prev) => [...prev, makeSlot(candidate)]);
  };

  const runAll = async () => {
    if (running) return;
    const valid = slots.filter((s) => s.modelId);
    if (valid.length < MIN_RUN_SLOTS) return;
    setRunning(true);

    const initial: Record<string, Partial<CompareSlot>> = {};
    for (const s of valid) {
      initial[s.slotId] = { status: "running", run: null, errorMessage: null, startedAt: Date.now(), finishedAt: null };
    }
    setSlots((prev) => prev.map((s) => (initial[s.slotId] ? { ...s, ...initial[s.slotId] } : s)));

    await Promise.all(
      valid.map(async (slot) => {
        const slotParams = slot.paramsOverride ? { ...params, ...slot.paramsOverride } : params;
        try {
          const run = await streamChatRun(
            {
              taskType,
              modelId: slot.modelId,
              prompt,
              fileIds,
              params: slotParams,
              compareGroupId,
            },
            (partial) => updateSlot(slot.slotId, { run: partial, status: "running" }),
          );
          updateSlot(slot.slotId, {
            run,
            status: run.status === "failed" ? "failed" : "ok",
            errorMessage: run.errorMessage ?? null,
            finishedAt: Date.now(),
          });
        } catch (err) {
          updateSlot(slot.slotId, {
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "Unknown error",
            finishedAt: Date.now(),
          });
        }
      }),
    );
    setRunning(false);
  };

  const canRun = slots.filter((s) => s.modelId).length >= MIN_RUN_SLOTS && prompt.trim().length > 0 && !running;

  return (
    <div className="fixed inset-0 z-50 flex bg-background/70 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="ml-auto flex h-full w-full max-w-5xl flex-col border-l bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">Compare run</h2>
            <p className="text-[10px] text-muted-foreground">
              Up to {MAX_SLOTS} models · parallel · shared prompt &amp; params · group {compareGroupId.slice(0, 8)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Prompt preview */}
          <div className="mb-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Prompt (shared, read-only here)
            </div>
            <div className="max-h-32 overflow-y-auto rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
              {prompt.length > 0 ? prompt : <em>No prompt set. Close drawer and add a prompt in Playground.</em>}
            </div>
          </div>

          {/* Slots */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Models ({slots.length}/{MAX_SLOTS})
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={addSlot}
                disabled={slots.length >= MAX_SLOTS}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add model
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {slots.map((slot) => (
                <SlotCard
                  key={slot.slotId}
                  slot={slot}
                  availableModels={availableModels}
                  providers={providers}
                  onModelChange={(id) => setSlotModel(slot.slotId, id)}
                  onRemove={() => removeSlot(slot.slotId)}
                  onParamsToggle={() => setSlotParams(slot.slotId, slot.paramsOverride ? null : { ...params })}
                  disableEdit={running}
                />
              ))}
              {Array.from({ length: MAX_SLOTS - slots.length }).map((_, i) => (
                <EmptySlot key={`empty-${i}`} />
              ))}
            </div>
          </div>

          {/* Metrics + Results */}
          {slots.some((s) => s.run || s.status === "failed") ? (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Results
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleSort("latency")}
                    className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${sortKey === "latency" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    Latency {sortKey === "latency" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSort("tokens")}
                    className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${sortKey === "tokens" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    Tokens {sortKey === "tokens" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {sortedSlots.map((slot) => (
                  <ResultCard
                    key={`result-${slot.slotId}`}
                    slot={slot}
                    providers={providers}
                    availableModels={availableModels}
                  />
                ))}
                {Array.from({ length: MAX_SLOTS - slots.length }).map((_, i) => (
                  <div key={`r-empty-${i}`} />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={running}>
            Close
          </Button>
          <Button size="sm" disabled={!canRun} onClick={runAll}>
            {running ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Running {slots.length} models
              </>
            ) : (
              <>
                <Play className="mr-1 h-3 w-3" /> Run all
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Subcomponents ──────────────────────────────────────── */

function SlotCard({
  slot,
  availableModels,
  providers,
  onModelChange,
  onRemove,
  onParamsToggle,
  disableEdit,
}: {
  slot: CompareSlot;
  availableModels: ModelInfo[];
  providers: Provider[];
  onModelChange: (id: string) => void;
  onRemove: () => void;
  onParamsToggle: () => void;
  disableEdit: boolean;
}) {
  const model = availableModels.find((m) => m.id === slot.modelId);
  const provider = providers.find((p) => p.id === model?.provider);
  const hasOverride = slot.paramsOverride !== null;
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <select
          className="w-full rounded border bg-background px-2 py-1 text-xs"
          value={slot.modelId}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={disableEdit}
        >
          <option value="">Select model…</option>
          {availableModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName ?? m.officialModelName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground hover:text-destructive"
          aria-label="Remove slot"
          disabled={disableEdit}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{provider?.name ?? "—"}</span>
        <SlotStatusPill status={slot.status} />
      </div>
      <button
        type="button"
        onClick={onParamsToggle}
        disabled={disableEdit}
        className={`mt-1.5 w-full rounded border px-2 py-1 text-[10px] transition-colors ${
          hasOverride
            ? "border-primary/30 bg-primary/5 text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted"
        }`}
      >
        {hasOverride ? "Custom params · click to reset" : "Use per-model params"}
      </button>
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="flex h-[72px] items-center justify-center rounded-lg border border-dashed text-[10px] text-muted-foreground">
      Empty slot
    </div>
  );
}

function SlotStatusPill({ status }: { status: CompareSlot["status"] }) {
  const map: Record<CompareSlot["status"], { tone: StatusTone; label: string }> = {
    idle: { tone: "muted", label: "Idle" },
    running: { tone: "running", label: "Running" },
    ok: { tone: "ready", label: "OK" },
    failed: { tone: "failed", label: "Failed" },
    cancelled: { tone: "warn", label: "Cancelled" },
  };
  const { tone, label } = map[status];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}

function ResultCard({
  slot,
  providers,
  availableModels,
}: {
  slot: CompareSlot;
  providers: Provider[];
  availableModels: ModelInfo[];
}) {
  const model = availableModels.find((m) => m.id === slot.modelId);
  const provider = providers.find((p) => p.id === model?.provider);
  const output = slot.run?.output;
  const text = typeof output?.text === "string" ? output.text : "";
  const latency = slot.finishedAt && slot.startedAt ? `${((slot.finishedAt - slot.startedAt) / 1000).toFixed(1)}s` : "—";
  const tokens = "—"; // Backend usage log fetch could fill this in later
  return (
    <div className="rounded-lg border bg-background p-3 text-xs">
      <div className="flex items-center justify-between border-b pb-2">
        <div>
          <div className="font-medium">{model?.displayName ?? slot.modelId}</div>
          <div className="text-[10px] text-muted-foreground">{provider?.name ?? "—"}</div>
        </div>
        <SlotStatusPill status={slot.status} />
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>Latency: {latency}</span>
        <span>Tokens: {tokens}</span>
      </div>
      <div className="mt-2 max-h-48 overflow-y-auto rounded border bg-muted/30 px-2 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap">
        {slot.status === "failed" ? (
          slot.run?.errorType ? (
            <ErrorBanner
              errorType={slot.run.errorType}
              providerId={provider?.id}
              runId={slot.run?.id}
              rawMessage={slot.errorMessage ?? undefined}
              className="border-0 bg-transparent p-0 text-[11px]"
            />
          ) : (
            <span className="text-destructive">{slot.errorMessage ?? "Run failed."}</span>
          )
        ) : text.length > 0 ? (
          text
        ) : slot.status === "running" ? (
          <span className="text-muted-foreground">Receiving output…</span>
        ) : (
          <span className="text-muted-foreground">No output yet.</span>
        )}
      </div>
      {slot.run?.id ? (
        <div className="mt-2 flex items-center justify-between text-[10px]">
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(text)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            disabled={text.length === 0}
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
          <Link
            href={`/activity?runId=${slot.run.id}`}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" /> Open log
          </Link>
        </div>
      ) : null}
    </div>
  );
}
