"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, WandSparkles, X, XCircle, Play, UploadCloud, AlertCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getTemplatesForTask, type PromptTemplate } from "@/lib/prompt-templates";
import { API_BASE_URL, ApiError } from "@/lib/api";
import type { FileRecord } from "@/types/model";

import { useWorkspaceQueries, tasks } from "./use-workspace-queries";
import { ModeTabs } from "./mode-tabs";
import { ModelSelectorRow } from "./model-selector-row";
import { ParamsPopover } from "./params-popover";
import { OutputSection } from "./output-section";

export function WorkspaceShell() {
  const q = useWorkspaceQueries();

  return (
    <div className="relative flex min-h-full items-center justify-center px-4 py-10">
      {/* Subtle dot grid background */}
      <div className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />

      <div className="relative w-full max-w-5xl">
        {/* Mode tabs */}
        <ModeTabs
          tasks={tasks}
          selectedTaskType={q.selectedTaskType}
          onSelect={q.handleSelectTask}
        />

        {/* Playground dialog card */}
        <div className="rounded-2xl border bg-card shadow-[0_12px_36px_rgba(72,60,45,0.06)]">
          {/* Model selector row */}
          <ModelSelectorRow
            availableModels={q.availableModels}
            selectedModelId={q.selectedModelId}
            selectedModel={q.selectedModel}
            selectedProvider={q.selectedProvider}
            onSelectModel={q.setSelectedModelId}
          />

          {/* Prompt input area */}
          <div className="p-6">
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="playground-prompt" className="text-sm font-medium">
                Prompt
              </label>
              <PromptTemplatePopover
                taskId={q.selectedTask.id}
                onSelect={(template) => q.setPrompt(template.prompt)}
              />
            </div>
            <Textarea
              id="playground-prompt"
              value={q.prompt}
              onChange={(e) => q.setPrompt(e.target.value)}
              className="min-h-[200px] resize-y text-sm leading-relaxed"
              placeholder="Describe what you want to run..."
              maxLength={4000}
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {q.prompt.length} / 4000
            </div>

            {/* File chips */}
            {q.files.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {q.files.map((file) => (
                  <div key={file.id} className="flex items-center gap-1.5 rounded-md border bg-muted/50 py-1 pl-2 pr-1 text-xs">
                    <FileIcon file={file} />
                    <span className="max-w-[180px] truncate">{file.originalName}</span>
                    <span className="text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
                    <button
                      type="button"
                      onClick={() => q.deleteFileMutation.mutate(file.id)}
                      className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Upload error */}
            {q.uploadMutation.error ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {q.uploadMutation.error.message}
              </div>
            ) : null}
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between border-t px-6 py-3.5">
            <TooltipProvider delayDuration={300}>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => q.fileInputRef.current?.click()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Upload file</TooltipContent>
                </Tooltip>

                <ParamsPopover
                  schema={q.paramSchema}
                  params={q.params}
                  provider={q.selectedProvider}
                  model={q.selectedModel}
                  onChange={q.setParam}
                  onReset={() => {
                    const schema = q.paramSchema;
                    if (!schema) return;
                    const defaults = Object.fromEntries(
                      schema.fields.map((f) => [f.key, f.default ?? (f.type === "boolean" ? false : "")]),
                    );
                    q.setParams(defaults);
                  }}
                />
              </div>
            </TooltipProvider>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => q.resetWorkspace()}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                New Task
              </Button>
              {q.runMutation.isPending ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => q.cancelMutation.mutate()}
                >
                  <XCircle className="mr-1 h-3.5 w-3.5" />
                  Cancel
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={!q.canRun}
                  onClick={() => q.runMutation.mutate(undefined)}
                >
                  <Play className="mr-1 h-3.5 w-3.5" />
                  Run
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Run error banner */}
        {q.runMutation.error ? (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <div>{q.runMutation.error.message}</div>
            {q.runMutation.error instanceof ApiError && q.runMutation.error.requestId ? (
              <div className="mt-1 text-xs text-destructive/70">requestId: {q.runMutation.error.requestId}</div>
            ) : null}
          </div>
        ) : null}

        {/* Output section */}
        <OutputSection
          latestRun={q.latestRun}
          runError={q.runMutation.error}
          selectedModel={q.selectedModel}
          history={q.history}
          providers={q.providers}
          onRerun={(run) => {
            const runPrompt = typeof run.input?.prompt === "string" ? run.input.prompt : "";
            const runFileIds = Array.isArray(run.input?.fileIds) ? run.input.fileIds.map(String) : [];
            q.runMutation.mutate({
              taskType: run.taskType,
              modelId: run.modelId,
              prompt: runPrompt,
              fileIds: runFileIds,
              params: run.params as Record<string, string | number | boolean>,
            });
          }}
        />

        {/* Hidden file input */}
        <input
          ref={q.fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) q.uploadMutation.mutate(file);
            e.currentTarget.value = "";
          }}
        />
      </div>
    </div>
  );
}

/* ── Inline helpers ────────────────────────────────────── */

function PromptTemplatePopover({
  taskId,
  onSelect,
}: {
  taskId: string;
  onSelect: (template: PromptTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const templates = useMemo(() => getTemplatesForTask(taskId), [taskId]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setOpen((value) => !value)}
        title="Select prompt template"
      >
        <WandSparkles className="mr-1 h-3.5 w-3.5" />
        Template
      </Button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-md border bg-popover p-1 shadow-lg">
          {templates.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No templates for this task.</div>
          ) : (
            templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  onSelect(template);
                  setOpen(false);
                }}
                className="w-full rounded px-3 py-2 text-left text-xs hover:bg-accent"
                title={template.prompt}
              >
                <div className="font-medium">{template.title}</div>
                <div className="mt-0.5 line-clamp-2 text-muted-foreground">{template.prompt}</div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function FileIcon({ file }: { file: FileRecord }) {
  const type = file.detectedType;
  if (type === "image") return <span className="text-xs">🖼</span>;
  if (type === "video") return <span className="text-xs">🎬</span>;
  if (type === "audio") return <span className="text-xs">🎵</span>;
  if (type === "code") return <span className="text-xs">📄</span>;
  return <span className="text-xs">📎</span>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
