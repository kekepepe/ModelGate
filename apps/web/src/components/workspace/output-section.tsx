"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Sparkles,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API_BASE_URL, ApiError } from "@/lib/api";
import type { ModelInfo, Provider, RunRecord } from "@/types/model";
import { ErrorBanner } from "@/components/workspace/error-banner";

const TIMELINE_STEPS = [
  "Queued",
  "Validating input",
  "Calling provider",
  "Receiving output",
  "Saving result",
] as const;

export function OutputSection({
  latestRun,
  runError,
  selectedModel,
  history,
  providers,
  onRerun,
}: {
  latestRun: RunRecord | null;
  runError: Error | null;
  selectedModel?: ModelInfo;
  history: RunRecord[];
  providers: Provider[];
  onRerun: (run: RunRecord) => void;
}) {
  const [activeTab, setActiveTab] = useState("output");

  return (
    <div className="mt-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="request">Request</TabsTrigger>
          <TabsTrigger value="archive">Archive</TabsTrigger>
        </TabsList>

        <div className="mt-3 rounded-lg border bg-card">
          <TabsContent value="output" className="m-0 p-5">
            <OutputPreview run={latestRun} error={runError} selectedModel={selectedModel} />
          </TabsContent>

          <TabsContent value="timeline" className="m-0 p-5">
            <RunTimeline run={latestRun} error={runError} />
          </TabsContent>

          <TabsContent value="request" className="m-0 p-5">
            <RequestSummary run={latestRun} error={runError} selectedModel={selectedModel} providers={providers} />
          </TabsContent>

          <TabsContent value="archive" className="m-0 p-5">
            <ArchiveList history={history} onRerun={onRerun} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/* ── Output preview (text / image / video) ───────────────── */

function OutputPreview({
  run,
  error,
  selectedModel,
}: {
  run: RunRecord | null;
  error: Error | null;
  selectedModel?: ModelInfo;
}) {
  if (error) {
    const apiErr = error instanceof ApiError ? error : undefined;
    return (
      <ErrorBanner
        errorType={apiErr?.type ?? "INTERNAL_ERROR"}
        providerId={run?.providerId}
        runId={run?.id}
        requestId={apiErr?.requestId}
        rawMessage={error.message}
      />
    );
  }

  const toAbsolute = (url: string) =>
    url.startsWith("http://") || url.startsWith("https://") ? url : `${API_BASE_URL.replace(/\/api$/, "")}${url}`;

  const videoStorageUrl = (run?.output as { videoStorageUrl?: string } | null)?.videoStorageUrl;
  const imageStorageUrl = (run?.output as { imageStorageUrl?: string } | null)?.imageStorageUrl;
  const videoUrl = run?.output?.videoUrl ?? (videoStorageUrl ? toAbsolute(videoStorageUrl) : undefined);
  const imageUrl = run?.output?.imageUrl ?? (imageStorageUrl ? toAbsolute(imageStorageUrl) : undefined);

  if (videoUrl) {
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Video className="h-4 w-4" />
          <span>{selectedModel?.displayName ?? run?.modelId} Video Output</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => window.open(videoUrl, "_blank", "noopener,noreferrer")}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Download
          </Button>
        </div>
        <video controls src={videoUrl} className="max-h-72 w-full rounded-md border bg-muted" />
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <ImageIcon className="h-4 w-4" />
          <span>{selectedModel?.displayName ?? run?.modelId} Image Output</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => window.open(imageUrl, "_blank", "noopener,noreferrer")}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Download
          </Button>
        </div>
        <img
          src={imageUrl}
          alt={selectedModel?.displayName ?? "image output"}
          className="max-h-72 max-w-full rounded-md border bg-muted object-contain"
        />
      </div>
    );
  }

  if (run?.output?.text) {
    const downloadText = () => {
      const blob = new Blob([run.output?.text ?? ""], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${run.id}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
    };
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Sparkles className="h-4 w-4" />
          <span>{selectedModel?.displayName ?? run.modelId} Output</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(run.output?.text ?? "")}>
            <Copy className="mr-1 h-3.5 w-3.5" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={downloadText}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Download
          </Button>
        </div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm leading-relaxed">{run.output.text}</pre>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        <span>Output Preview</span>
      </div>
      <p>Run a task to see output.</p>
    </div>
  );
}

/* ── Timeline ─────────────────────────────────────────── */

function RunTimeline({ run, error }: { run: RunRecord | null; error: Error | null }) {
  const status = error ? "failed" : (run?.status ?? "idle");
  const currentStep = useMemo(() => computeCurrentStep(status), [status]);

  if (!run && !error) {
    return (
      <div className="text-sm text-muted-foreground">
        Run a task to see the execution timeline.
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {TIMELINE_STEPS.map((step, idx) => {
        const state = stepState(idx, currentStep, status);
        return (
          <li key={step} className="flex items-center gap-3 text-sm">
            <span
              className={
                state === "done"
                  ? "flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"
                  : state === "active"
                    ? "flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white"
                    : state === "failed"
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white"
                      : "flex h-5 w-5 items-center justify-center rounded-full border bg-muted text-muted-foreground"
              }
            >
              {state === "done" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : state === "active" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : state === "failed" ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <span className="text-[10px]">{idx + 1}</span>
              )}
            </span>
            <span className={state === "pending" ? "text-muted-foreground" : "text-foreground"}>
              {idx === TIMELINE_STEPS.length - 1 && status === "completed" ? "Completed" : step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function computeCurrentStep(status: string): number {
  switch (status) {
    case "idle":
      return -1;
    case "queued":
      return 0;
    case "running":
      return 2; // calling/receiving
    case "completed":
      return TIMELINE_STEPS.length;
    case "failed":
    case "cancelled":
      return 2;
    default:
      return 1;
  }
}

function stepState(
  idx: number,
  current: number,
  status: string,
): "done" | "active" | "pending" | "failed" {
  if (status === "failed" && idx === current) return "failed";
  if (idx < current) return "done";
  if (idx === current) return status === "completed" ? "done" : "active";
  return "pending";
}

/* ── Request Summary ──────────────────────────────────── */

function RequestSummary({
  run,
  error,
  selectedModel,
  providers,
}: {
  run: RunRecord | null;
  error: Error | null;
  selectedModel?: ModelInfo;
  providers: Provider[];
}) {
  if (!run && !error) {
    return (
      <div className="text-sm text-muted-foreground">
        Run a task to see provider, model, params, and request id.
      </div>
    );
  }

  const providerName = run?.providerId
    ? providers.find((p) => p.id === run.providerId)?.name ?? run.providerId
    : "—";
  const statusTone = statusToTone(error ? "failed" : run?.status ?? "idle");
  const statusLabel = error ? "Failed" : titleCase(run?.status ?? "idle");
  const requestId = error instanceof ApiError ? error.requestId : undefined;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status">
          <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
        </Field>
        <Field label="Provider" value={providerName} />
        <Field label="Model" value={selectedModel?.displayName ?? run?.modelId ?? "—"} />
        <Field label="Task type" value={run?.taskType ?? "—"} />
        <Field label="Output type" value={run?.output?.type ?? "—"} />
        <Field label="Run ID" value={run?.id ?? "—"} mono copyable />
        {requestId ? <Field label="Request ID" value={requestId} mono copyable /> : null}
        {error?.message ? <Field label="Error" value={error.message} /> : null}
      </div>

      {run?.params && Object.keys(run.params).length > 0 ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Params</div>
          <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
            {JSON.stringify(run.params, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  children,
  mono = false,
  copyable = false,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-2.5">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        {copyable && value && value !== "—" ? (
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(value)}
            className="text-muted-foreground hover:text-foreground"
            title="Copy"
          >
            <Copy className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <div className={mono ? "mt-0.5 truncate font-mono text-xs" : "mt-0.5 truncate text-sm font-medium"}>
        {children ?? value ?? "—"}
      </div>
    </div>
  );
}

/* ── Archive ──────────────────────────────────────────── */

function ArchiveList({ history, onRerun }: { history: RunRecord[]; onRerun: (run: RunRecord) => void }) {
  if (history.length === 0) return <div className="text-sm text-muted-foreground">No archived results yet.</div>;
  return (
    <div className="space-y-2">
      {history.slice(0, 8).map((item) => (
        <div key={item.id} className="flex items-center justify-between rounded-md border bg-muted/30 p-2.5 text-sm">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate font-mono text-xs text-muted-foreground">{item.id}</span>
            <span className="text-xs text-muted-foreground">{item.taskType}</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={statusToTone(item.status)} className="text-[10px]">
              {titleCase(item.status)}
            </StatusPill>
            <button
              type="button"
              onClick={() => onRerun(item)}
              className="rounded p-1 text-muted-foreground hover:text-primary"
              title="Rerun"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────── */

function statusToTone(status: string): StatusTone {
  switch (status) {
    case "completed":
      return "ready";
    case "failed":
      return "failed";
    case "running":
      return "running";
    case "queued":
      return "queued";
    case "cancelled":
      return "warn";
    default:
      return "muted";
  }
}

function titleCase(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
