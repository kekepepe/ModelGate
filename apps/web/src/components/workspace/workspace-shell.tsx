"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Boxes,
  Check,
  ChevronsRight,
  CircleDot,
  Clock3,
  Code2,
  Copy,
  Database,
  Download,
  FileArchive,
  FileCode2,
  FileText,
  History,
  Image as ImageIcon,
  KeyRound,
  LayoutGrid,
  MessageSquare,
  Network,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  UploadCloud,
  Video,
  WandSparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_BASE_URL, ApiError, deleteData, getData, postData, uploadData } from "@/lib/api";
import { getTemplatesForTask, type PromptTemplate } from "@/lib/prompt-templates";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { FileRecord, ModelInfo, ParamField, ParamSchema, Provider, RecommendResult, RunRecord } from "@/types/model";

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
  { id: "chat", name: "聊天", runtime: "chat", input: "text", output: "text", requiredInputTypes: ["text"], icon: MessageSquare },
  { id: "coding", name: "写代码", runtime: "chat", input: "text/code", output: "text", requiredInputTypes: ["text"], icon: Code2 },
  { id: "code_review", name: "代码审查", runtime: "chat", input: "code", output: "text", requiredInputTypes: ["code"], icon: FileCode2 },
  { id: "image_understanding", name: "图片理解", runtime: "chat", input: "image", output: "text", requiredInputTypes: ["image"], icon: ImageIcon, disabled: true },
  { id: "document_analysis", name: "文档分析", runtime: "chat", input: "file", output: "text", requiredInputTypes: ["file"], icon: FileText },
  { id: "video_understanding", name: "视频理解", runtime: "chat", input: "video", output: "text", requiredInputTypes: ["video"], icon: Video, disabled: true },
  { id: "text_to_image", name: "文生图", runtime: "generation", input: "text", output: "image", requiredInputTypes: ["text"], icon: WandSparkles, disabled: true },
  { id: "image_to_image", name: "图生图", runtime: "generation", input: "image", output: "image", requiredInputTypes: ["image"], icon: ImageIcon, disabled: true },
  { id: "text_to_video", name: "文生视频", runtime: "generation", input: "text", output: "video", requiredInputTypes: ["text"], icon: Video, disabled: true },
  { id: "image_to_video", name: "图生视频", runtime: "generation", input: "image", output: "video", requiredInputTypes: ["image"], icon: Video, disabled: true },
  { id: "first_last_frame_video", name: "首尾帧视频", runtime: "generation", input: "image", output: "video", requiredInputTypes: ["image"], icon: FileArchive, disabled: true },
  { id: "prompt_optimize", name: "Prompt 优化", runtime: "chat", input: "text", output: "text", requiredInputTypes: ["text"], icon: Sparkles },
  { id: "multi_agent_workflow", name: "多 Agent 工作流", runtime: "workflow", input: "mixed", output: "flow", requiredInputTypes: ["text"], icon: Network, disabled: true },
];

const workflowSteps = [
  "选择任务",
  "识别输入",
  "过滤模型",
  "选择官方模型名",
  "生成参数面板",
  "调用 Provider API",
  "返回结果",
  "保存历史与日志",
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
        throw new Error("请选择模型后再运行。");
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
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[250px_minmax(0,1fr)]">
        <Sidebar providers={providers} />
        <div className="flex min-h-screen min-w-0 flex-col">
          <Topbar
            canRun={canRun}
            running={runMutation.isPending}
            onRun={() => runMutation.mutate(undefined)}
            onCancel={() => cancelMutation.mutate()}
            onReset={() => resetWorkspace()}
          />
          <section className="min-w-0 flex-1 space-y-3 p-3 lg:p-4">
            <WorkflowSteps />
            <div className="grid gap-3 2xl:grid-cols-[430px_minmax(0,1fr)_420px]">
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
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
          </section>
        </div>
      </div>
    </main>
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
      // Backend signaled cancellation (event between deltas, or in response
      // to /cancel). Stop reading further chunks and surface the cancelled
      // state through the latestRun — the caller also triggers the cancel
      // HTTP request, so the run is fully terminal on the server side too.
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
        // CancelledRunError is the signal to short-circuit out of the
        // stream without surfacing an error to the caller — the run is in
        // a terminal cancelled state and the UI already reflects that.
        if (eventError instanceof CancelledRunError) {
          try {
            await reader.cancel();
          } catch {
            // best-effort: the stream is already being torn down
          }
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

function Sidebar({ providers }: { providers: Provider[] }) {
  const navItems = [
    { label: "任务中心", icon: LayoutGrid, href: "/workspace?taskType=chat", active: true },
    { label: "Chat Runtime", icon: MessageSquare, href: "/workspace?taskType=chat" },
    { label: "历史记录", icon: History, href: "/history" },
    { label: "请求日志", icon: Clock3, href: "/history" },
    { label: "Provider 管理", icon: Boxes, href: "/settings" },
    { label: "模型注册表", icon: Database, href: "/models" },
    { label: "设置", icon: Settings, href: "/settings" },
  ];

  return (
    <aside className="hidden min-h-screen border-r border-slate-800/90 bg-[#06101d] xl:flex xl:flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-300">
          <Bot className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="text-sm font-semibold tracking-wide">AI Model Workspace</div>
      </div>
      <nav className="space-y-1 p-3">
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const sectionBreak = index === 3 || index === 5 || index === 8;
          return (
            <div key={item.label}>
              {sectionBreak ? <div className="my-3 h-px bg-slate-800" /> : null}
              <Link
                href={item.href}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  item.active
                    ? "border border-blue-500/30 bg-blue-500/15 text-blue-200"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="mt-auto space-y-4 p-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Provider 状态</span>
            <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-300">配置状态</span>
          </div>
          <div className="space-y-2">
            {(providers.length > 0 ? providers : fallbackProviders).slice(0, 3).map((provider) => (
              <div key={provider.id} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className={`h-2 w-2 rounded-full ${provider.enabled !== false ? "bg-emerald-400" : "bg-slate-500"}`} />
                  {provider.name}
                </span>
                <span className={`rounded-full px-2 py-0.5 ${provider.configured ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                  {provider.configured ? "已配置" : "未配置"}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs leading-relaxed text-slate-500">
          本地运行 · 开源可控
          <br />
          v1.0.0
        </div>
      </div>
    </aside>
  );
}

function Topbar({
  canRun,
  running,
  onRun,
  onCancel,
  onReset,
}: {
  canRun: boolean;
  running: boolean;
  onRun: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-3 border-b border-slate-800 bg-[#06101d]/95 px-4 backdrop-blur">
      <h1 className="mr-auto text-lg font-semibold tracking-wide">任务工作台</h1>
      <span className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">本地单用户 / 无登录</span>
      <Link href="/settings" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
        <KeyRound className="h-4 w-4 text-amber-300" aria-hidden="true" />
        API Key 配置
      </Link>
      <button type="button" onClick={onReset} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white">
        <Plus className="h-4 w-4" aria-hidden="true" />
        新建任务
      </button>
      {running ? (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500"
          title="取消运行"
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
          取消
        </button>
      ) : (
        <button
          type="button"
          disabled={!canRun}
          onClick={onRun}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          title="运行"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          运行
        </button>
      )}
    </header>
  );
}

function WorkflowSteps() {
  return (
    <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-3 text-xs text-slate-400 lg:flex">
      {workflowSteps.map((step, index) => (
        <div key={step} className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-400/50 bg-blue-500/15 text-blue-200">
            {index + 1}
          </span>
          <span className="truncate">{step}</span>
          {index < workflowSteps.length - 1 ? <ChevronsRight className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}

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
    <Panel title="任务与输入" action={<CircleDot className="h-4 w-4 text-blue-400" aria-hidden="true" />}>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-xs text-slate-400">选择任务</div>
          <div className="grid grid-cols-2 gap-2">
            {tasks.filter((task) => !task.disabled).map((task) => {
              const Icon = task.icon;
              const selected = task.id === selectedTaskType;
              return (
                <button
                  key={task.id}
                  type="button"
                  disabled={task.disabled}
                  onClick={() => onSelectTask(task.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                    selected
                      ? "border-blue-500 bg-blue-500/15 text-blue-100"
                      : task.disabled
                        ? "cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-600"
                        : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{task.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs text-slate-400">上传文件</div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-4 py-5 text-center text-sm text-slate-300 transition hover:border-blue-500/70 hover:bg-blue-500/5"
          >
            <UploadCloud className="mb-2 h-6 w-6 text-slate-400" aria-hidden="true" />
            <span>{uploading ? "上传中..." : "将文件拖拽到此处，或点击上传"}</span>
            <span className="mt-1 text-xs text-slate-500">支持 图片 / 视频 / 音频 / 文档 / 代码文件</span>
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
            <span className="font-medium text-slate-300">已识别输入信息</span>
            {activeFile ? (
              <button type="button" onClick={() => onDeleteFile(activeFile.id)} className="inline-flex items-center gap-1 text-blue-300">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                清除
              </button>
            ) : null}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/35">
            {activeFile ? (
              <div>
                <dl className="divide-y divide-slate-800 text-xs">
                  <InfoRow label="文件名" value={activeFile.originalName} />
                  <InfoRow label="MIME 类型" value={activeFile.mimeType} />
                  <InfoRow label="扩展名" value={extensionOf(activeFile.originalName)} />
                  <InfoRow label="输入类型" value={activeFile.detectedType} />
                  <InfoRow label="文件大小" value={formatBytes(activeFile.sizeBytes)} />
                  <InfoRow label="状态" value={activeFile.status} />
                </dl>
                {activeFile.detectedType === "image" && activeFile.previewUrl ? (
                  <img
                    src={`${API_BASE_URL.replace(/\/api$/, "")}${activeFile.previewUrl}`}
                    alt={activeFile.originalName}
                    className="m-3 h-24 w-36 rounded-md border border-slate-800 object-cover"
                  />
                ) : null}
                {activeFile.errorMessage ? <div className="px-3 pb-3 text-xs text-rose-300">{activeFile.errorMessage}</div> : null}
              </div>
            ) : (
              <div className="p-4 text-xs text-slate-500">上传文件后展示类型、大小、解析状态和后端识别结果。</div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="workspace-prompt" className="text-sm font-semibold text-slate-200">
              输入 / Prompt
            </label>
            <PromptTemplatePopover taskId={selectedTask.id} onSelect={(template) => onPromptChange(template.prompt)} />
          </div>
          <textarea
            id="workspace-prompt"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            className="min-h-40 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-500"
            placeholder="输入要发送给模型的内容"
            maxLength={4000}
          />
          <div className="mt-1 text-right text-xs text-slate-500">{prompt.length} / 4000</div>
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
    <Panel title="模型推荐与执行" subtitle="基于当前任务、输入与输出目标，已为你过滤并排序推荐官方模型。">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3 text-xs">
          <FilterPill label="任务" value={selectedTask.name} />
          <FilterPill label="输入类型" value={selectedTask.input} />
          <FilterPill label="输出目标" value={selectedTask.output} />
          <div className="h-6 w-px bg-slate-800" />
          <button
            type="button"
            onClick={() => onProviderFilter(null)}
            className={`rounded-md border px-3 py-1.5 ${providerFilter === null ? "border-blue-500 bg-blue-500/15 text-blue-200" : "border-slate-700 text-slate-300"}`}
          >
            Provider 全部
          </button>
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => onProviderFilter(provider.id)}
              className={`rounded-md border px-3 py-1.5 ${providerFilter === provider.id ? "border-blue-500 bg-blue-500/15 text-blue-200" : "border-slate-700 text-slate-300"}`}
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
              className={`relative rounded-lg border p-3 text-left transition ${
                model.id === selectedModelId
                  ? "border-blue-500 bg-blue-500/15 shadow-[0_0_0_1px_rgba(59,130,246,0.2)]"
                  : "border-slate-800 bg-slate-950/35 hover:border-slate-600"
              }`}
            >
              {model.id === selectedModelId ? (
                <span className="absolute right-0 top-0 rounded-bl-lg rounded-tr-lg bg-blue-500 px-2 py-1">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
              ) : null}
              <div className="pr-8 text-sm font-semibold text-slate-100">{model.displayName}</div>
              <div className="mt-1 text-xs text-slate-500">{providerName(model.provider)}</div>
              <div className="mt-3 flex flex-wrap gap-1">
                {model.capabilities.slice(0, 5).map((capability) => (
                  <span key={capability} className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                    {capabilityLabel(capability)}
                  </span>
                ))}
              </div>
            </button>
          ))}
          {hiddenModels.slice(0, 3).map((model) => (
            <div key={model.id} className="rounded-lg border border-slate-800 bg-slate-950/20 p-3 opacity-60">
              <div className="text-sm font-semibold text-slate-400">{model.displayName}</div>
              <div className="mt-2 text-xs text-slate-500">{model.reasons.join(", ")}</div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/35">
          <div className="flex items-center justify-between border-b border-slate-800">
            <div className="flex text-sm">
              {[
                ["preview", "预览输出"],
                ["status", "任务状态"],
                ["archive", "结果归档"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTabChange(id as "preview" | "status" | "archive")}
                  className={`border-b-2 px-4 py-2 ${activeTab === id ? "border-blue-500 text-blue-300" : "border-transparent text-slate-400"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-60 p-4">
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
      title="动态参数面板"
      action={
        <button type="button" onClick={onReset} disabled={!schema} className="inline-flex items-center gap-1 text-xs text-blue-300 disabled:text-slate-600">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          重置
        </button>
      }
    >
      <div className="space-y-4">
        {fields.length > 0 ? (
          fields.map((field) => <ParameterField key={field.key} field={field} value={params[field.key] ?? field.default ?? ""} onChange={onChange} />)
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-4 text-sm text-slate-500">选择模型后显示参数。</div>
        )}
        <div className="border-t border-slate-800 pt-4">
          <div className="mb-3 text-sm font-medium text-slate-300">参数 Schema 来源</div>
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
        <span className="text-slate-300">{field.key}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(field.key, event.target.checked)}
          className="h-5 w-5 accent-blue-500"
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="grid gap-2 text-sm">
        <span className="text-slate-300">{field.key}</span>
        <select
          value={String(value)}
          onChange={(event) => onChange(field.key, event.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
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
    <label className="grid gap-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-300">{field.key}</span>
        <input
          type={isNumber ? "number" : "text"}
          value={String(value)}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => onChange(field.key, isNumber ? Number(event.target.value) : event.target.value)}
          className="w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-right text-slate-100"
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
          className="accent-blue-500"
        />
      ) : null}
    </label>
  );
}

function OutputPreview({ run, error, selectedModel }: { run: RunRecord | null; error: Error | null; selectedModel?: ModelInfo }) {
  if (error) return <ErrorBanner error={error} />;

  // Storage URLs from generation tasks (or any future chat adapter that
  // surfaces media) come back as relative paths — the API serves them on the
  // same origin, so just prefix the base URL.
  const toAbsolute = (url: string) =>
    url.startsWith("http://") || url.startsWith("https://") ? url : `${API_BASE_URL.replace(/\/api$/, "")}${url}`;

  const videoStorageUrl = (run?.output as { videoStorageUrl?: string } | null)?.videoStorageUrl;
  const imageStorageUrl = (run?.output as { imageStorageUrl?: string } | null)?.imageStorageUrl;
  const videoUrl = run?.output?.videoUrl ?? (videoStorageUrl ? toAbsolute(videoStorageUrl) : undefined);
  const imageUrl = run?.output?.imageUrl ?? (imageStorageUrl ? toAbsolute(imageStorageUrl) : undefined);

  if (videoUrl) {
    return (
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-violet-300">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Video className="h-4 w-4" aria-hidden="true" />
            <span>{selectedModel?.displayName ?? run?.modelId} 视频输出</span>
          </div>
          <button
            type="button"
            onClick={() => window.open(videoUrl, "_blank", "noopener,noreferrer")}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300"
            title="下载视频"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            下载
          </button>
        </div>
        <video controls src={videoUrl} className="max-h-96 w-full rounded-lg border border-slate-800 bg-slate-950" />
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-violet-300">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            <span>{selectedModel?.displayName ?? run?.modelId} 图片输出</span>
          </div>
          <button
            type="button"
            onClick={() => window.open(imageUrl, "_blank", "noopener,noreferrer")}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300"
            title="下载图片"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            下载
          </button>
        </div>
        <img
          src={imageUrl}
          alt={selectedModel?.displayName ?? "image output"}
          className="max-h-96 max-w-full rounded-lg border border-slate-800 bg-slate-950 object-contain"
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
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-violet-300">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>{selectedModel?.displayName ?? run.modelId} 输出</span>
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(run.output?.text ?? "")}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300"
            title="复制结果"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            复制
          </button>
          <button
            type="button"
            onClick={downloadText}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300"
            title="下载结果"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            下载
          </button>
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900/80 p-4 leading-relaxed text-slate-200">{run.output.text}</pre>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <div className="flex items-center gap-2 text-violet-300">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span>系统设计方案大纲（示例）</span>
      </div>
      <p>一、总体架构</p>
      <p className="text-slate-400">采用分层服务架构，前后端分离，支持高可用与可扩展性。</p>
      <div className="rounded-lg bg-slate-900/90 p-3 font-mono text-xs text-slate-300">
        graph TD
        <br />
        Client[客户端] --&gt; API[网关层] --&gt; Service[服务层]
        <br />
        Service --&gt; DB[(数据层)]
      </div>
      <p>二、核心模块</p>
      <p className="text-slate-400">用户管理、Provider 管理、模型注册表、任务运行时、历史记录与请求日志。</p>
    </div>
  );
}

function RuntimeStatus({ run, selectedModel }: { run: RunRecord | null; selectedModel?: ModelInfo }) {
  const status = run?.status ?? "idle";
  return (
    <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
      <SourceBox label="当前状态" value={status} />
      <SourceBox label="模型" value={selectedModel?.displayName ?? "-"} />
      <SourceBox label="记录 ID" value={run?.id ?? "-"} />
      <SourceBox label="输出类型" value={run?.output?.type ?? "text"} />
    </div>
  );
}

function ArchiveList({ history, onRerun }: { history: RunRecord[]; onRerun: (run: RunRecord) => void }) {
  if (history.length === 0) return <div className="text-sm text-slate-500">暂无归档结果。</div>;
  return (
    <div className="space-y-2">
      {history.slice(0, 5).map((item) => (
        <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/35 p-3 text-sm">
          <span className="truncate text-slate-300">{item.id}</span>
          <div className="flex items-center gap-2">
            <StatusBadge status={item.status} />
            <button type="button" onClick={() => onRerun(item)} className="rounded-md border border-slate-700 p-1.5 text-slate-400 hover:text-blue-300" title="重新运行">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
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
    <Panel title="历史记录" compact>
      <Table
        headers={["时间", "任务", "模型", "状态", "输出类型", "操作"]}
        rows={rows.map((item) => [
          formatTime(item.createdAt),
          taskName(item.taskType),
          item.modelId,
          <StatusBadge key="status" status={item.status} />,
          item.output?.type ?? "文本",
          item.id.startsWith("sample-") ? (
            <span key="action" className="text-slate-600">-</span>
          ) : (
            <button key="action" type="button" onClick={() => onRerun(item)} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-blue-300" title="重新运行">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
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
    <Panel title="请求日志" compact>
      <Table
        headers={["时间", "Provider", "状态", "耗时", "Token", "错误信息"]}
        rows={rows.map((item, index) => [
          formatTime(item.createdAt),
          providers.find((provider) => provider.id === item.providerId)?.name ?? item.providerId,
          <StatusBadge key="status" status={item.status} />,
          `${9 + index * 3}.1s`,
          `${0.9 + index * 0.2}k / ${0.3 + index * 0.5}k`,
          item.errorMessage ?? "-",
        ])}
      />
    </Panel>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-900/80 text-slate-400">
          <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="text-slate-300">
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
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/20">
      <div className={`flex items-start justify-between gap-3 border-b border-slate-800 ${compact ? "px-4 py-3" : "px-4 py-3"}`}>
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
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
    <div className={`rounded-lg border border-rose-500/40 bg-rose-500/10 text-sm text-rose-200 ${compact ? "mt-2 px-3 py-2" : "px-4 py-3"}`}>
      <div>{error.message}</div>
      {requestId ? <div className="mt-1 text-xs text-rose-300">requestId: {requestId}</div> : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-3 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-right text-slate-300">{value}</dd>
    </div>
  );
}

function FilterPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border border-slate-800 bg-slate-950/50 px-2.5 py-1.5 text-slate-300">
      {label} <span className="ml-1 text-slate-500">{value}</span>
    </span>
  );
}

function SourceBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-xs text-slate-200">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-500/15 text-emerald-300",
    success: "bg-emerald-500/15 text-emerald-300",
    running: "bg-sky-500/15 text-sky-300",
    queued: "bg-amber-500/15 text-amber-300",
    failed: "bg-rose-500/15 text-rose-300",
    cancelled: "bg-slate-500/15 text-slate-300",
    idle: "bg-slate-500/15 text-slate-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles[status] ?? styles.idle}`}>{statusLabel(status)}</span>;
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
  if (!value) return "14:32:21";
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
}

function taskName(taskType: string) {
  return tasks.find((task) => task.id === taskType)?.name ?? taskType;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    completed: "成功",
    success: "成功",
    running: "运行中",
    queued: "排队中",
    failed: "失败",
    cancelled: "取消",
    idle: "未开始",
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
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-blue-500"
        title="选择 Prompt 模板"
      >
        <WandSparkles className="h-3.5 w-3.5" aria-hidden="true" />
        模板
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-md border border-slate-700 bg-slate-900 p-1 shadow-xl shadow-black/40">
          {templates.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">该任务暂无模板。</div>
          ) : (
            templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  onSelect(template);
                  setOpen(false);
                }}
                className="w-full rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                title={template.prompt}
              >
                <div className="font-medium">{template.title}</div>
                <div className="mt-0.5 line-clamp-2 text-slate-500">{template.prompt}</div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

const fallbackProviders: Provider[] = [
  { id: "mimo", name: "MiMo", authType: "bearer", enabled: true, adapter: "openai_compatible" },
  { id: "minimax", name: "MiniMax", authType: "bearer", enabled: true, adapter: "openai_compatible" },
  { id: "volcengine_coding", name: "火山 Coding Plan", authType: "bearer", enabled: true, adapter: "openai_compatible" },
];

const sampleHistory: RunRecord[] = [
  {
    id: "sample-1",
    taskType: "document_analysis",
    providerId: "mimo",
    modelId: "MiMo-V2.5-Pro",
    input: {},
    params: {},
    output: { type: "文本", text: "" },
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
    output: { type: "代码", text: "" },
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
    output: { type: "文本", text: "" },
    status: "failed",
    errorMessage: "HTTP 429: Rate limit",
    createdAt: "2024-05-28T14:08:33Z",
  },
];
