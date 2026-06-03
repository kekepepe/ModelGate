"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronsRight,
  CircleDot,
  Code2,
  Copy,
  Download,
  FileArchive,
  FileCode2,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Network,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  UploadCloud,
  Video,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_BASE_URL, ApiError, deleteData, getData, postData, uploadData } from "@/lib/api";
import { getTemplatesForTask, type PromptTemplate } from "@/lib/prompt-templates";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { FileRecord, ModelInfo, ParamField, ParamSchema, Provider, RecommendResult, RunRecord } from "@/types/model";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TaskOption = {
  id: string;
  name: string;
  runtime: "chat" | "generation" | "workflow";
  input: string;
  output: string;
  requiredInputTypes: string[];
  icon: typeof MessageSquare;
  disabled?: boolean;
};

type ChatRunPayload = {
  taskType: string;
  modelId: string | null;
  prompt: string;
  fileIds: string[];
  params: Record<string, string | number | boolean>;
};

const tasks: TaskOption[] = [
  { id: "chat", name: "Chat", runtime: "chat", input: "text", output: "text", requiredInputTypes: ["text"], icon: MessageSquare },
  { id: "coding", name: "Coding", runtime: "chat", input: "text/code", output: "text", requiredInputTypes: ["text"], icon: Code2 },
  { id: "code_review", name: "Code Review", runtime: "chat", input: "code", output: "text", requiredInputTypes: ["code"], icon: FileCode2 },
  { id: "image_understanding", name: "Image Understanding", runtime: "chat", input: "image", output: "text", requiredInputTypes: ["image"], icon: ImageIcon, disabled: true },
  { id: "document_analysis", name: "Document Analysis", runtime: "chat", input: "file", output: "text", requiredInputTypes: ["file"], icon: FileText },
  { id: "video_understanding", name: "Video Understanding", runtime: "chat", input: "video", output: "text", requiredInputTypes: ["video"], icon: Video, disabled: true },
  { id: "text_to_image", name: "Text to Image", runtime: "generation", input: "text", output: "image", requiredInputTypes: ["text"], icon: WandSparkles, disabled: true },
  { id: "image_to_image", name: "Image to Image", runtime: "generation", input: "image", output: "image", requiredInputTypes: ["image"], icon: ImageIcon, disabled: true },
  { id: "text_to_video", name: "Text to Video", runtime: "generation", input: "text", output: "video", requiredInputTypes: ["text"], icon: Video, disabled: true },
  { id: "image_to_video", name: "Image to Video", runtime: "generation", input: "image", output: "video", requiredInputTypes: ["image"], icon: Video, disabled: true },
  { id: "first_last_frame_video", name: "Frame to Video", runtime: "generation", input: "image", output: "video", requiredInputTypes: ["image"], icon: FileArchive, disabled: true },
  { id: "prompt_optimize", name: "Prompt Optimize", runtime: "chat", input: "text", output: "text", requiredInputTypes: ["text"], icon: Sparkles },
  { id: "multi_agent_workflow", name: "Multi-Agent Workflow", runtime: "workflow", input: "mixed", output: "flow", requiredInputTypes: ["text"], icon: Network, disabled: true },
];

const workflowSteps = [
  "Select Task",
  "Identify Input",
  "Filter Models",
  "Choose Model",
  "Generate Params",
  "Call Provider API",
  "Return Result",
  "Save History & Logs",
];

export function WorkspaceShell() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentRunIdRef = useRef<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<"preview" | "status" | "archive">("preview");

  const selectedTaskType = useWorkspaceStore((state) => state.selectedTaskType);
  const selectedModelId = useWorkspaceStore((state) => state.selectedModelId);
  const providerFilter = useWorkspaceStore((state) => state.providerFilter);
  const prompt = useWorkspaceStore((state) => state.prompt);
  const params = useWorkspaceStore((state) => state.params);
  const files = useWorkspaceStore((state) => state.files);
  const latestRun = useWorkspaceStore((state) => state.latestRun);
  const setSelectedTaskType = useWorkspaceStore((state) => state.setSelectedTaskType);
  const setSelectedModelId = useWorkspaceStore((state) => state.setSelectedModelId);
  const setProviderFilter = useWorkspaceStore((state) => state.setProviderFilter);
  const setPrompt = useWorkspaceStore((state) => state.setPrompt);
  const setParam = useWorkspaceStore((state) => state.setParam);
  const setParams = useWorkspaceStore((state) => state.setParams);
  const addFile = useWorkspaceStore((state) => state.addFile);
  const removeFile = useWorkspaceStore((state) => state.removeFile);
  const setLatestRun = useWorkspaceStore((state) => state.setLatestRun);
  const resetWorkspace = useWorkspaceStore((state) => state.resetWorkspace);

  useEffect(() => {
    const taskType = searchParams.get("taskType");
    if (taskType && tasks.some((task) => task.id === taskType && !task.disabled)) {
      setSelectedTaskType(taskType);
    }
  }, [searchParams, setSelectedTaskType]);

  const handleSelectTask = useCallback(
    (taskType: string) => {
      setSelectedTaskType(taskType);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("taskType", taskType);
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, setSelectedTaskType],
  );

  const selectedTask = tasks.find((task) => task.id === selectedTaskType) ?? tasks[0];
  const fileIds = useMemo(() => files.map((file) => file.id), [files]);
  const inputTypes = useMemo(() => {
    const inputSet = new Set(selectedTask.requiredInputTypes);
    if (prompt.trim()) inputSet.add("text");
    if (files.length > 0) inputSet.add("file");
    return Array.from(inputSet);
  }, [files.length, prompt, selectedTask.requiredInputTypes]);

  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: () => getData<Provider[]>("/providers") });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: () => getData<ModelInfo[]>("/models") });
  const recommendationQuery = useQuery({
    queryKey: ["recommendation", selectedTaskType, inputTypes, providerFilter, params, fileIds],
    queryFn: () =>
      postData<RecommendResult>("/models/recommend", {
        taskType: selectedTaskType,
        inputTypes,
        fileIds,
        requiredOutput: selectedTask.output === "code" ? "code" : "text",
        preferredProviders: providerFilter ? [providerFilter] : [],
        params,
      }),
  });

  const selectedModel = modelsQuery.data?.find((model) => model.id === selectedModelId);
  const paramSchemaQuery = useQuery({
    queryKey: ["param-schema", selectedModel?.paramsSchema],
    queryFn: () => getData<ParamSchema>(`/param-schemas/${selectedModel?.paramsSchema}`),
    enabled: Boolean(selectedModel?.paramsSchema),
  });
  const historyQuery = useQuery({ queryKey: ["history-runs"], queryFn: () => getData<RunRecord[]>("/history/runs") });

  useEffect(() => {
    if (!selectedModelId && recommendationQuery.data?.availableModels[0]) {
      setSelectedModelId(recommendationQuery.data.availableModels[0].id);
    }
  }, [recommendationQuery.data, selectedModelId, setSelectedModelId]);

  useEffect(() => {
    const schema = paramSchemaQuery.data;
    if (!schema) return;
    const defaults = Object.fromEntries(
      schema.fields.map((field) => [field.key, field.default ?? (field.type === "boolean" ? false : "")]),
    );
    setParams(defaults);
  }, [paramSchemaQuery.data, setParams]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadData<FileRecord>("/files/upload", formData);
    },
    onSuccess: (file) => addFile(file),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => deleteData<FileRecord>(`/files/${fileId}`),
    onSuccess: (file) => removeFile(file.id),
  });

  const runMutation = useMutation({
    mutationFn: (payload?: ChatRunPayload) => {
      const runPayload = payload ?? {
        taskType: selectedTaskType,
        modelId: selectedModelId,
        prompt,
        fileIds,
        params,
      };
      if (!runPayload.modelId) {
        throw new Error("Please select a model before running.");
      }
      currentRunIdRef.current = null;
      return streamChatRun(
        {
          taskType: runPayload.taskType,
          modelId: runPayload.modelId,
          prompt: runPayload.prompt,
          fileIds: runPayload.fileIds,
          params: runPayload.params,
        },
        (run) => {
          if (run.id) currentRunIdRef.current = run.id;
          setLatestRun(run);
          setActiveResultTab("preview");
        },
      );
    },
    onSuccess: (run) => {
      setLatestRun(run);
      setActiveResultTab("preview");
      queryClient.invalidateQueries({ queryKey: ["history-runs"] });
      currentRunIdRef.current = null;
    },
    onError: () => {
      currentRunIdRef.current = null;
    },
    onSettled: () => {
      currentRunIdRef.current = null;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => {
      const runId = currentRunIdRef.current;
      if (!runId) {
        return Promise.resolve(null);
      }
      return postData<{ data: RunRecord }>(`/chat/runs/${runId}/cancel`, {});
    },
    onSuccess: (response) => {
      if (response?.data) {
        setLatestRun({ ...response.data, status: "cancelled" });
      }
      queryClient.invalidateQueries({ queryKey: ["history-runs"] });
    },
  });

  const providers = providersQuery.data ?? [];
  const history = historyQuery.data ?? [];
  const availableModels = recommendationQuery.data?.availableModels ?? [];
  const hiddenModels = recommendationQuery.data?.hiddenModels ?? [];
  const selectedProvider = providers.find((provider) => provider.id === selectedModel?.provider);
  const canRun = Boolean(selectedModelId) && (prompt.trim().length > 0 || files.length > 0);

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => resetWorkspace()}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Task
        </Button>
        {runMutation.isPending ? (
          <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate()}>
            <XCircle className="mr-1.5 h-4 w-4" />
            Cancel
          </Button>
        ) : (
          <Button size="sm" disabled={!canRun} onClick={() => runMutation.mutate(undefined)}>
            <Play className="mr-1.5 h-4 w-4" />
            Run
          </Button>
        )}
      </div>

      {/* Workflow steps */}
      <div className="hidden items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-xs text-muted-foreground lg:flex">
        {workflowSteps.map((step, index) => (
          <div key={step} className="flex min-w-0 items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] font-medium">
              {index + 1}
            </span>
            <span className="truncate">{step}</span>
            {index < workflowSteps.length - 1 ? <ChevronsRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" /> : null}
          </div>
        ))}
      </div>

      {/* Main 3-column grid */}
      <div className="grid gap-4 2xl:grid-cols-[380px_minmax(0,1fr)_360px]">
        <TaskInputPanel
          selectedTask={selectedTask}
          selectedTaskType={selectedTaskType}
          prompt={prompt}
          files={files}
          uploading={uploadMutation.isPending}
          uploadError={uploadMutation.error}
          fileInputRef={fileInputRef}
          onSelectTask={handleSelectTask}
          onPromptChange={setPrompt}
          onUpload={(file) => uploadMutation.mutate(file)}
          onDeleteFile={(fileId) => deleteFileMutation.mutate(fileId)}
        />
        <ModelRuntimePanel
          selectedTask={selectedTask}
          providers={providers}
          providerFilter={providerFilter}
          selectedModelId={selectedModelId}
          selectedModel={selectedModel}
          availableModels={availableModels}
          hiddenModels={hiddenModels}
          latestRun={latestRun}
          history={history}
          runError={runMutation.error}
          activeTab={activeResultTab}
          onProviderFilter={setProviderFilter}
          onSelectModel={setSelectedModelId}
          onTabChange={setActiveResultTab}
          onRerun={(run) => {
            const runPrompt = typeof run.input?.prompt === "string" ? run.input.prompt : "";
            const runFileIds = Array.isArray(run.input?.fileIds) ? run.input.fileIds.map(String) : [];
            runMutation.mutate({
              taskType: run.taskType,
              modelId: run.modelId,
              prompt: runPrompt,
              fileIds: runFileIds,
              params: run.params as Record<string, string | number | boolean>,
            });
          }}
        />
        <ParameterPanel
          schema={paramSchemaQuery.data}
          params={params}
          provider={selectedProvider}
          model={selectedModel}
          onChange={setParam}
          onReset={() => {
            const schema = paramSchemaQuery.data;
            if (!schema) return;
            setParams(Object.fromEntries(schema.fields.map((field) => [field.key, field.default ?? (field.type === "boolean" ? false : "")])));
          }}
        />
      </div>

      {/* Bottom: History + Request Logs */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <HistoryTable
          history={history}
          onRerun={(run) => {
            const runPrompt = typeof run.input?.prompt === "string" ? run.input.prompt : "";
            const runFileIds = Array.isArray(run.input?.fileIds) ? run.input.fileIds.map(String) : [];
            runMutation.mutate({
              taskType: run.taskType,
              modelId: run.modelId,
              prompt: runPrompt,
              fileIds: runFileIds,
              params: run.params as Record<string, string | number | boolean>,
            });
          }}
        />
        <RequestLogTable history={history} providers={providers} />
      </div>
    </div>
  );
}

async function streamChatRun(
  payload: {
    taskType: string;
    modelId: string;
    prompt: string;
    fileIds: string[];
    params: Record<string, string | number | boolean>;
  },
  onPartialRun: (run: RunRecord) => void,
): Promise<RunRecord> {
  const response = await fetch(`${API_BASE_URL}/chat/runs/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await buildStreamingError(response);
  if (!response.body) throw new Error("Streaming response is empty.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let runId = "";
  let outputText = "";
  let doneRun: RunRecord | null = null;

  const applyEvent = (event: Record<string, unknown>) => {
    if (event.type === "run") {
      runId = String(event.runId ?? "");
      onPartialRun({
        id: runId,
        taskType: payload.taskType,
        providerId: "",
        modelId: payload.modelId,
        input: { prompt: payload.prompt, fileIds: payload.fileIds },
        params: payload.params,
        output: { type: "text", text: "" },
        status: String(event.status ?? "running"),
      });
    }
    if (event.type === "delta") {
      outputText += String(event.delta ?? "");
      if (runId) {
        onPartialRun({
          id: runId,
          taskType: payload.taskType,
          providerId: "",
          modelId: payload.modelId,
          input: { prompt: payload.prompt, fileIds: payload.fileIds },
          params: payload.params,
          output: { type: "text", text: outputText },
          status: "running",
        });
      }
    }
    if (event.type === "cancelled") {
      onPartialRun({
        id: runId || String(event.runId ?? ""),
        taskType: payload.taskType,
        providerId: "",
        modelId: payload.modelId,
        input: { prompt: payload.prompt, fileIds: payload.fileIds },
        params: payload.params,
        output: { type: "text", text: outputText },
        status: "cancelled",
      });
      throw new CancelledRunError(runId || String(event.runId ?? ""));
    }
    if (event.type === "error") {
      throw buildStreamingEventError(event);
    }
    if (event.type === "done" && event.run && typeof event.run === "object") {
      doneRun = event.run as RunRecord;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      try {
        applyEvent(JSON.parse(line.slice(5).trim()));
      } catch (eventError) {
        if (eventError instanceof CancelledRunError) {
          try { await reader.cancel(); } catch { /* best-effort */ }
          return {
            id: eventError.runId,
            taskType: payload.taskType,
            providerId: "",
            modelId: payload.modelId,
            input: { prompt: payload.prompt, fileIds: payload.fileIds },
            params: payload.params,
            output: { type: "text", text: outputText },
            status: "cancelled",
          };
        }
        throw eventError;
      }
    }
  }

  if (doneRun) return doneRun;
  return {
    id: runId || "streaming-run",
    taskType: payload.taskType,
    providerId: "",
    modelId: payload.modelId,
    input: { prompt: payload.prompt, fileIds: payload.fileIds },
    params: payload.params,
    output: { type: "text", text: outputText },
    status: "completed",
  };
}

class CancelledRunError extends Error {
  constructor(public runId: string) {
    super(`Run ${runId} cancelled.`);
    this.name = "CancelledRunError";
  }
}

function buildStreamingEventError(event: Record<string, unknown>): Error {
  const error = event.error && typeof event.error === "object" ? (event.error as Record<string, unknown>) : event;
  return new ApiError(
    String(error.message ?? "Streaming chat failed."),
    200,
    String(error.type ?? error.errorType ?? "STREAM_ERROR"),
    typeof error.requestId === "string" ? error.requestId : undefined,
  );
}

async function buildStreamingError(response: Response): Promise<Error> {
  try {
    const payload = await response.json();
    return new ApiError(
      String(payload?.error?.message ?? `API request failed: ${response.status}`),
      response.status,
      payload?.error?.type,
      payload?.error?.requestId,
    );
  } catch {
    return new ApiError(`API request failed: ${response.status}`, response.status);
  }
}

/* ── Panels ─────────────────────────────────────────────── */

function TaskInputPanel({
  selectedTask,
  selectedTaskType,
  prompt,
  files,
  uploading,
  uploadError,
  fileInputRef,
  onSelectTask,
  onPromptChange,
  onUpload,
  onDeleteFile,
}: {
  selectedTask: TaskOption;
  selectedTaskType: string;
  prompt: string;
  files: FileRecord[];
  uploading: boolean;
  uploadError: Error | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSelectTask: (taskType: string) => void;
  onPromptChange: (prompt: string) => void;
  onUpload: (file: File) => void;
  onDeleteFile: (fileId: string) => void;
}) {
  const activeFile = files[0];
  return (
    <Panel title="Task & Input" action={<CircleDot className="h-4 w-4 text-primary" />}>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Select Task</div>
          <div className="grid grid-cols-2 gap-1.5">
            {tasks.filter((task) => !task.disabled).map((task) => {
              const Icon = task.icon;
              const selected = task.id === selectedTaskType;
              return (
                <button
                  key={task.id}
                  type="button"
                  disabled={task.disabled}
                  onClick={() => onSelectTask(task.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition",
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : task.disabled
                        ? "cursor-not-allowed border-border bg-muted/40 text-muted-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{task.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Upload File</div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 py-4 text-center text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5"
          >
            <UploadCloud className="mb-1.5 h-5 w-5 text-muted-foreground" />
            <span>{uploading ? "Uploading..." : "Drop files here or click to upload"}</span>
            <span className="mt-0.5 text-xs text-muted-foreground/70">Image / Video / Audio / Document / Code</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.currentTarget.value = "";
            }}
          />
          {uploadError ? <ErrorBanner error={uploadError} compact /> : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Detected Input</span>
            {activeFile ? (
              <button type="button" onClick={() => onDeleteFile(activeFile.id)} className="inline-flex items-center gap-1 text-primary">
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            ) : null}
          </div>
          <div className="rounded-md border bg-muted/30">
            {activeFile ? (
              <div>
                <dl className="divide-y divide-border text-xs">
                  <InfoRow label="Filename" value={activeFile.originalName} />
                  <InfoRow label="MIME" value={activeFile.mimeType} />
                  <InfoRow label="Ext" value={extensionOf(activeFile.originalName)} />
                  <InfoRow label="Input Type" value={activeFile.detectedType} />
                  <InfoRow label="Size" value={formatBytes(activeFile.sizeBytes)} />
                  <InfoRow label="Status" value={activeFile.status} />
                </dl>
                {activeFile.detectedType === "image" && activeFile.previewUrl ? (
                  <img
                    src={`${API_BASE_URL.replace(/\/api$/, "")}${activeFile.previewUrl}`}
                    alt={activeFile.originalName}
                    className="m-2 h-20 w-32 rounded border object-cover"
                  />
                ) : null}
                {activeFile.errorMessage ? <div className="px-3 pb-2 text-xs text-destructive">{activeFile.errorMessage}</div> : null}
              </div>
            ) : (
              <div className="p-3 text-xs text-muted-foreground">Upload a file to see type, size, and parse status.</div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="workspace-prompt" className="text-sm font-medium">
              Prompt
            </label>
            <PromptTemplatePopover taskId={selectedTask.id} onSelect={(template) => onPromptChange(template.prompt)} />
          </div>
          <textarea
            id="workspace-prompt"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            className="min-h-36 w-full resize-y rounded-md border border-input bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            placeholder="Enter your prompt..."
            maxLength={4000}
          />
          <div className="mt-1 text-right text-xs text-muted-foreground">{prompt.length} / 4000</div>
        </div>
      </div>
    </Panel>
  );
}

function ModelRuntimePanel({
  selectedTask,
  providers,
  providerFilter,
  selectedModelId,
  selectedModel,
  availableModels,
  hiddenModels,
  latestRun,
  history,
  runError,
  activeTab,
  onProviderFilter,
  onSelectModel,
  onTabChange,
  onRerun,
}: {
  selectedTask: TaskOption;
  providers: Provider[];
  providerFilter: string | null;
  selectedModelId: string | null;
  selectedModel?: ModelInfo;
  availableModels: ModelInfo[];
  hiddenModels: RecommendResult["hiddenModels"];
  latestRun: RunRecord | null;
  history: RunRecord[];
  runError: Error | null;
  activeTab: "preview" | "status" | "archive";
  onProviderFilter: (providerId: string | null) => void;
  onSelectModel: (modelId: string) => void;
  onTabChange: (tab: "preview" | "status" | "archive") => void;
  onRerun: (run: RunRecord) => void;
}) {
  const providerName = (providerId: string) => providers.find((provider) => provider.id === providerId)?.name ?? providerId;
  return (
    <Panel title="Model & Runtime" subtitle="Filtered and ranked models based on your task and input.">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 border-b pb-3 text-xs">
          <FilterPill label="Task" value={selectedTask.name} />
          <FilterPill label="Input" value={selectedTask.input} />
          <FilterPill label="Output" value={selectedTask.output} />
          <div className="h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => onProviderFilter(null)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs",
              providerFilter === null ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            All Providers
          </button>
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => onProviderFilter(provider.id)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs",
                providerFilter === provider.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              {provider.name}
            </button>
          ))}
        </div>

        <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
          {availableModels.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => onSelectModel(model.id)}
              className={cn(
                "relative rounded-md border p-3 text-left transition",
                model.id === selectedModelId
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-background hover:border-primary/30"
              )}
            >
              {model.id === selectedModelId ? (
                <span className="absolute right-0 top-0 rounded-bl-md rounded-tr-md bg-primary px-1.5 py-0.5">
                  <Check className="h-3.5 w-3.5 text-primary-foreground" />
                </span>
              ) : null}
              <div className="pr-6 text-sm font-medium">{model.displayName}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{providerName(model.provider)}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {model.capabilities.slice(0, 5).map((capability) => (
                  <span key={capability} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {capabilityLabel(capability)}
                  </span>
                ))}
              </div>
            </button>
          ))}
          {hiddenModels.slice(0, 3).map((model) => (
            <div key={model.id} className="rounded-md border border-border bg-muted/20 p-3 opacity-50">
              <div className="text-sm font-medium text-muted-foreground">{model.displayName}</div>
              <div className="mt-1 text-xs text-muted-foreground/70">{model.reasons.join(", ")}</div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-md border">
          <div className="flex items-center justify-between border-b">
            <div className="flex text-sm">
              {[
                ["preview", "Output"],
                ["status", "Status"],
                ["archive", "Archive"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTabChange(id as "preview" | "status" | "archive")}
                  className={cn(
                    "border-b-2 px-4 py-2 text-sm",
                    activeTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-56 p-4">
            {activeTab === "preview" ? <OutputPreview run={latestRun} error={runError} selectedModel={selectedModel} /> : null}
            {activeTab === "status" ? <RuntimeStatus run={latestRun} selectedModel={selectedModel} /> : null}
            {activeTab === "archive" ? <ArchiveList history={history} onRerun={onRerun} /> : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ParameterPanel({
  schema,
  params,
  provider,
  model,
  onChange,
  onReset,
}: {
  schema?: ParamSchema;
  params: Record<string, string | number | boolean>;
  provider?: Provider;
  model?: ModelInfo;
  onChange: (key: string, value: string | number | boolean) => void;
  onReset: () => void;
}) {
  const fields = schema?.fields ?? [];
  return (
    <Panel
      title="Parameters"
      action={
        <Button variant="ghost" size="sm" onClick={onReset} disabled={!schema} className="h-7 text-xs">
          <RefreshCw className="mr-1 h-3 w-3" />
          Reset
        </Button>
      }
    >
      <div className="space-y-4">
        {fields.length > 0 ? (
          fields.map((field) => <ParameterField key={field.key} field={field} value={params[field.key] ?? field.default ?? ""} onChange={onChange} />)
        ) : (
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Select a model to see parameters.</div>
        )}
        <div className="border-t pt-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Schema Source</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <SourceBox label="Provider" value={provider?.name ?? "-"} />
            <SourceBox label="Model" value={model?.displayName ?? "-"} />
            <SourceBox label="Version" value={schema ? `v${schema.version}` : "-"} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ParameterField({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: string | number | boolean;
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-center justify-between text-sm">
        <span className="text-foreground">{field.key}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(field.key, event.target.checked)}
          className="h-4 w-4 accent-primary"
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="grid gap-1.5 text-sm">
        <span className="text-foreground">{field.key}</span>
        <select
          value={String(value)}
          onChange={(event) => onChange(field.key, event.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          {(field.options ?? []).map((option) => {
            const optionValue = typeof option === "string" ? option : option.value;
            const label = typeof option === "string" ? option : option.label;
            return (
              <option key={String(optionValue)} value={String(optionValue)}>
                {label}
              </option>
            );
          })}
        </select>
      </label>
    );
  }

  const numericValue = Number(value);
  const isNumber = field.type === "number";
  return (
    <label className="grid gap-1.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-foreground">{field.key}</span>
        <input
          type={isNumber ? "number" : "text"}
          value={String(value)}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => onChange(field.key, isNumber ? Number(event.target.value) : event.target.value)}
          className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right text-sm"
        />
      </div>
      {isNumber && typeof field.min === "number" && typeof field.max === "number" ? (
        <input
          type="range"
          value={Number.isFinite(numericValue) ? numericValue : Number(field.default ?? field.min)}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(event) => onChange(field.key, Number(event.target.value))}
          className="accent-primary"
        />
      ) : null}
    </label>
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

function RuntimeStatus({ run, selectedModel }: { run: RunRecord | null; selectedModel?: ModelInfo }) {
  const status = run?.status ?? "idle";
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2">
      <SourceBox label="Status" value={status} />
      <SourceBox label="Model" value={selectedModel?.displayName ?? "-"} />
      <SourceBox label="Record ID" value={run?.id ?? "-"} />
      <SourceBox label="Output Type" value={run?.output?.type ?? "text"} />
    </div>
  );
}

function ArchiveList({ history, onRerun }: { history: RunRecord[]; onRerun: (run: RunRecord) => void }) {
  if (history.length === 0) return <div className="text-sm text-muted-foreground">No archived results yet.</div>;
  return (
    <div className="space-y-2">
      {history.slice(0, 5).map((item) => (
        <div key={item.id} className="flex items-center justify-between rounded-md border bg-muted/30 p-2.5 text-sm">
          <span className="truncate font-mono text-xs text-muted-foreground">{item.id}</span>
          <div className="flex items-center gap-2">
            <StatusBadge status={item.status} />
            <button type="button" onClick={() => onRerun(item)} className="rounded p-1 text-muted-foreground hover:text-primary" title="Rerun">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryTable({ history, onRerun }: { history: RunRecord[]; onRerun: (run: RunRecord) => void }) {
  const rows = history.length > 0 ? history.slice(0, 5) : sampleHistory;
  return (
    <Panel title="History" compact>
      <Table
        headers={["Time", "Task", "Model", "Status", "Output", "Action"]}
        rows={rows.map((item) => [
          formatTime(item.createdAt),
          taskName(item.taskType),
          <span key="model" className="font-mono text-xs">{item.modelId}</span>,
          <StatusBadge key="status" status={item.status} />,
          item.output?.type ?? "text",
          item.id.startsWith("sample-") ? (
            <span key="action" className="text-muted-foreground">-</span>
          ) : (
            <button key="action" type="button" onClick={() => onRerun(item)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary" title="Rerun">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ),
        ])}
      />
    </Panel>
  );
}

function RequestLogTable({ history, providers }: { history: RunRecord[]; providers: Provider[] }) {
  const rows = history.length > 0 ? history.slice(0, 5) : sampleHistory;
  return (
    <Panel title="Request Logs" compact>
      <Table
        headers={["Time", "Provider", "Status", "Latency", "Tokens", "Error"]}
        rows={rows.map((item, index) => [
          formatTime(item.createdAt),
          providers.find((provider) => provider.id === item.providerId)?.name ?? item.providerId,
          <StatusBadge key="status" status={item.status} />,
          `${9 + index * 3}.1s`,
          `${(0.9 + index * 0.2).toFixed(1)}k / ${(0.3 + index * 0.5).toFixed(1)}k`,
          item.errorMessage ?? "-",
        ])}
      />
    </Panel>
  );
}

/* ── Shared primitives ──────────────────────────────────── */

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50">
          <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="whitespace-nowrap px-3 py-2">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  compact,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className={compact ? "p-0" : "p-4"}>{children}</div>
    </section>
  );
}

function ErrorBanner({ error, compact }: { error: Error; compact?: boolean }) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div className={cn("rounded-md border border-destructive/30 bg-destructive/10 text-sm text-destructive", compact ? "mt-2 px-3 py-2" : "px-4 py-3")}>
      <div>{error.message}</div>
      {requestId ? <div className="mt-1 text-xs text-destructive/70">requestId: {requestId}</div> : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 px-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  );
}

function FilterPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border border-border bg-muted/50 px-2 py-1 text-foreground">
      {label} <span className="ml-1 text-muted-foreground">{value}</span>
    </span>
  );
}

function SourceBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2.5">
      <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-xs">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "success" | "info" | "warning" | "destructive" | "secondary"> = {
    completed: "success",
    success: "success",
    running: "info",
    queued: "warning",
    failed: "destructive",
    cancelled: "secondary",
    idle: "secondary",
  };
  return <Badge variant={variantMap[status] ?? "secondary"}>{statusLabel(status)}</Badge>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "-";
}

function formatTime(value?: string | null) {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("en-US", { hour12: false });
}

function taskName(taskType: string) {
  return tasks.find((task) => task.id === taskType)?.name ?? taskType;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    completed: "Completed",
    success: "Success",
    running: "Running",
    queued: "Queued",
    failed: "Failed",
    cancelled: "Cancelled",
    idle: "Idle",
  };
  return labels[status] ?? status;
}

function capabilityLabel(capability: string) {
  const labels: Record<string, string> = {
    chat: "Chat",
    coding: "Coding",
    code: "Code",
    vision: "Vision",
    document: "Document",
    file_understanding: "Document",
    async: "Async",
    multi_agent: "Multi-Agent",
  };
  return labels[capability] ?? capability;
}

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

const sampleHistory: RunRecord[] = [
  {
    id: "sample-1",
    taskType: "document_analysis",
    providerId: "mimo",
    modelId: "MiMo-V2.5-Pro",
    input: {},
    params: {},
    output: { type: "text", text: "" },
    status: "completed",
    createdAt: "2024-05-28T14:32:21Z",
  },
  {
    id: "sample-2",
    taskType: "coding",
    providerId: "minimax",
    modelId: "MiniMax-M2.7",
    input: {},
    params: {},
    output: { type: "text", text: "" },
    status: "running",
    createdAt: "2024-05-28T14:25:07Z",
  },
  {
    id: "sample-3",
    taskType: "code_review",
    providerId: "mimo",
    modelId: "MiMo-V2.5",
    input: {},
    params: {},
    output: { type: "text", text: "" },
    status: "failed",
    errorMessage: "HTTP 429: Rate limit",
    createdAt: "2024-05-28T14:08:33Z",
  },
];
