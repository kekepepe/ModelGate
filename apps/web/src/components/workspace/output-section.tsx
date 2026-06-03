"use client";

import { useState } from "react";
import { Copy, Download, Image as ImageIcon, RotateCcw, Sparkles, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API_BASE_URL } from "@/lib/api";
import type { ModelInfo, Provider, RunRecord } from "@/types/model";

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
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="archive">Archive</TabsTrigger>
        </TabsList>

        <div className="mt-3 rounded-lg border bg-card">
          <TabsContent value="output" className="m-0 p-5">
            <OutputPreview run={latestRun} error={runError} selectedModel={selectedModel} />
          </TabsContent>

          <TabsContent value="status" className="m-0 p-5">
            <RuntimeStatus run={latestRun} selectedModel={selectedModel} providers={providers} />
          </TabsContent>

          <TabsContent value="archive" className="m-0 p-5">
            <ArchiveList history={history} onRerun={onRerun} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function OutputPreview({ run, error, selectedModel }: { run: RunRecord | null; error: Error | null; selectedModel?: ModelInfo }) {
  if (error) return <ErrorBanner error={error} />;

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
      <p>Run a task to see results here.</p>
    </div>
  );
}

function RuntimeStatus({ run, selectedModel, providers }: { run: RunRecord | null; selectedModel?: ModelInfo; providers: Provider[] }) {
  const status = run?.status ?? "idle";
  const providerName = run?.providerId ? providers.find((p) => p.id === run.providerId)?.name ?? run.providerId : "-";

  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2">
      <SourceBox label="Status" value={status} />
      <SourceBox label="Model" value={selectedModel?.displayName ?? run?.modelId ?? "-"} />
      <SourceBox label="Provider" value={providerName} />
      <SourceBox label="Record ID" value={run?.id ?? "-"} />
      <SourceBox label="Output Type" value={run?.output?.type ?? "text"} />
    </div>
  );
}

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
            <StatusBadge status={item.status} />
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

/* ── Shared primitives ──────────────────────────────────── */

function SourceBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "completed" ? "success" : status === "failed" ? "destructive" : status === "cancelled" ? "warning" : "info";
  return (
    <Badge variant={variant as "success" | "destructive" | "warning" | "info"} className="text-[10px]">
      {status}
    </Badge>
  );
}

function ErrorBanner({ error }: { error: Error }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      {error.message}
    </div>
  );
}
