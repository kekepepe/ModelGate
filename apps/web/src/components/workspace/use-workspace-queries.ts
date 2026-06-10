"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Code2,
  FileArchive,
  FileCode2,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Network,
  Sparkles,
  Video,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_BASE_URL, ApiError, deleteData, getData, postData, uploadData } from "@/lib/api";
import type { ConversationView, MessageView } from "@/lib/api";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { ChatMessage } from "@/stores/workspace-store";
import type {
  FileRecord,
  ModelInfo,
  ParamSchema,
  Provider,
  RecommendResult,
  RunRecord,
} from "@/types/model";

export type TaskOption = {
  id: string;
  name: string;
  runtime: "chat" | "generation" | "workflow";
  input: string;
  output: string;
  requiredInputTypes: string[];
  icon: LucideIcon;
  disabled?: boolean;
};

export type ChatRunPayload = {
  taskType: string;
  modelId: string | null;
  prompt: string;
  fileIds: string[];
  params: Record<string, string | number | boolean>;
  conversationId?: string | null;
};

export const tasks: TaskOption[] = [
  {
    id: "chat",
    name: "Chat",
    runtime: "chat",
    input: "text",
    output: "text",
    requiredInputTypes: ["text"],
    icon: MessageSquare,
  },
  {
    id: "coding",
    name: "Coding",
    runtime: "chat",
    input: "text/code",
    output: "text",
    requiredInputTypes: ["text"],
    icon: Code2,
  },
  {
    id: "code_review",
    name: "Code Review",
    runtime: "chat",
    input: "code",
    output: "text",
    requiredInputTypes: ["code"],
    icon: FileCode2,
  },
  {
    id: "image_understanding",
    name: "Image Understanding",
    runtime: "chat",
    input: "image",
    output: "text",
    requiredInputTypes: ["image"],
    icon: ImageIcon,
    disabled: true,
  },
  {
    id: "document_analysis",
    name: "Document Analysis",
    runtime: "chat",
    input: "file",
    output: "text",
    requiredInputTypes: ["file"],
    icon: FileText,
  },
  {
    id: "video_understanding",
    name: "Video Understanding",
    runtime: "chat",
    input: "video",
    output: "text",
    requiredInputTypes: ["video"],
    icon: Video,
    disabled: true,
  },
  {
    id: "text_to_image",
    name: "Text to Image",
    runtime: "generation",
    input: "text",
    output: "image",
    requiredInputTypes: ["text"],
    icon: WandSparkles,
    disabled: true,
  },
  {
    id: "image_to_image",
    name: "Image to Image",
    runtime: "generation",
    input: "image",
    output: "image",
    requiredInputTypes: ["image"],
    icon: ImageIcon,
    disabled: true,
  },
  {
    id: "text_to_video",
    name: "Text to Video",
    runtime: "generation",
    input: "text",
    output: "video",
    requiredInputTypes: ["text"],
    icon: Video,
    disabled: true,
  },
  {
    id: "image_to_video",
    name: "Image to Video",
    runtime: "generation",
    input: "image",
    output: "video",
    requiredInputTypes: ["image"],
    icon: Video,
    disabled: true,
  },
  {
    id: "first_last_frame_video",
    name: "Frame to Video",
    runtime: "generation",
    input: "image",
    output: "video",
    requiredInputTypes: ["image"],
    icon: FileArchive,
    disabled: true,
  },
  {
    id: "prompt_optimize",
    name: "Prompt Optimize",
    runtime: "chat",
    input: "text",
    output: "text",
    requiredInputTypes: ["text"],
    icon: Sparkles,
  },
  {
    id: "multi_agent_workflow",
    name: "Multi-Agent Workflow",
    runtime: "workflow",
    input: "mixed",
    output: "flow",
    requiredInputTypes: ["text"],
    icon: Network,
    disabled: true,
  },
];

export function useWorkspaceQueries() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentRunIdRef = useRef<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<"preview" | "status" | "archive">(
    "preview",
  );

  const selectedTaskType = useWorkspaceStore((state) => state.selectedTaskType);
  const selectedModelId = useWorkspaceStore((state) => state.selectedModelId);
  const providerFilter = useWorkspaceStore((state) => state.providerFilter);
  const prompt = useWorkspaceStore((state) => state.prompt);
  const params = useWorkspaceStore((state) => state.params);
  const files = useWorkspaceStore((state) => state.files);
  const latestRun = useWorkspaceStore((state) => state.latestRun);
  const messages = useWorkspaceStore((state) => state.messages);
  const setSelectedTaskType = useWorkspaceStore((state) => state.setSelectedTaskType);
  const setSelectedModelId = useWorkspaceStore((state) => state.setSelectedModelId);
  const setProviderFilter = useWorkspaceStore((state) => state.setProviderFilter);
  const setPrompt = useWorkspaceStore((state) => state.setPrompt);
  const setParam = useWorkspaceStore((state) => state.setParam);
  const setParams = useWorkspaceStore((state) => state.setParams);
  const addFile = useWorkspaceStore((state) => state.addFile);
  const removeFile = useWorkspaceStore((state) => state.removeFile);
  const setLatestRun = useWorkspaceStore((state) => state.setLatestRun);
  const appendMessage = useWorkspaceStore((state) => state.appendMessage);
  const updateMessage = useWorkspaceStore((state) => state.updateMessage);
  const clearMessages = useWorkspaceStore((state) => state.clearMessages);
  const conversationId = useWorkspaceStore((state) => state.conversationId);
  const setConversationId = useWorkspaceStore((state) => state.setConversationId);
  const loadMessages = useWorkspaceStore((state) => state.loadMessages);
  const resetWorkspace = useWorkspaceStore((state) => state.resetWorkspace);
  const activeAssistantIdRef = useRef<string | null>(null);

  // Read ?fromRun= for "Rerun with another model" deep-link from Activity page
  const fromRunId = searchParams.get("fromRun");

  const fromRunQuery = useQuery({
    queryKey: ["from-run", fromRunId],
    queryFn: () => getData<RunRecord>(`/history/${fromRunId}`),
    enabled: Boolean(fromRunId),
    staleTime: 0,
  });

  // Track the original model from the run (persists even if user changes selection)
  const [fromRunModelId, setFromRunModelId] = useState<string | null>(null);

  // Pre-fill workspace when fromRun data arrives
  useEffect(() => {
    const run = fromRunQuery.data;
    if (!run || !fromRunId) return;

    // Pre-fill task type, prompt, params, model
    if (run.taskType && tasks.some((t) => t.id === run.taskType && !t.disabled)) {
      setSelectedTaskType(run.taskType);
    }
    const runPrompt = typeof run.input?.prompt === "string" ? run.input.prompt : "";
    if (runPrompt) setPrompt(runPrompt);
    if (run.params && typeof run.params === "object") {
      setParams(run.params as Record<string, string | number | boolean>);
    }
    if (run.modelId) {
      setSelectedModelId(run.modelId);
      setFromRunModelId(run.modelId);
    }

    // Show toast about files
    const hadFiles = Array.isArray(run.input?.fileIds) && run.input.fileIds.length > 0;
    if (hadFiles) {
      // Brief notification — use a simple DOM toast since we don't have a toast library
      const toast = document.createElement("div");
      toast.textContent = "Original files not re-attached. Upload again if needed.";
      toast.className =
        "fixed bottom-4 right-4 z-50 rounded-md border bg-card px-4 py-2 text-sm shadow-lg";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 5000);
    }

    // Clean up URL param to prevent re-fetch on refresh
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("fromRun");
    const qs = nextParams.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromRunQuery.data, fromRunId]);

  // Load conversation from URL ?conversationId=
  const urlConversationId = searchParams.get("conversationId");
  const conversationQuery = useQuery({
    queryKey: ["conversation", urlConversationId],
    queryFn: () => getData<ConversationView>(`/conversations/${urlConversationId}`),
    enabled: Boolean(urlConversationId),
    staleTime: 0,
  });

  useEffect(() => {
    const conv = conversationQuery.data;
    if (!conv || !urlConversationId) return;
    setConversationId(urlConversationId);
    if (conv.messages && conv.messages.length > 0) {
      const mapped: ChatMessage[] = conv.messages.map((m: MessageView) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status as ChatMessage["status"],
        modelId: m.modelId ?? undefined,
        providerId: m.providerId ?? undefined,
        runId: m.runId ?? undefined,
        createdAt: m.createdAt ?? new Date().toISOString(),
      }));
      loadMessages(mapped);
    }
    if (conv.modelId) setSelectedModelId(conv.modelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationQuery.data, urlConversationId]);

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

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => getData<Provider[]>("/providers"),
  });
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => getData<ModelInfo[]>("/models"),
  });
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
  const historyQuery = useQuery({
    queryKey: ["history-runs"],
    queryFn: () => getData<RunRecord[]>("/history/runs"),
  });

  useEffect(() => {
    if (!selectedModelId && recommendationQuery.data?.availableModels?.[0]) {
      setSelectedModelId(recommendationQuery.data.availableModels[0].id);
    }
  }, [recommendationQuery.data, selectedModelId, setSelectedModelId]);

  useEffect(() => {
    const schema = paramSchemaQuery.data;
    if (!schema) return;
    const defaults = Object.fromEntries(
      schema.fields.map((field) => [
        field.key,
        field.default ?? (field.type === "boolean" ? false : ""),
      ]),
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
        conversationId,
      };
      if (!runPayload.modelId) {
        throw new Error("Please select a model before running.");
      }
      currentRunIdRef.current = null;

      const assistantId = `msg_assistant_${Date.now()}`;
      activeAssistantIdRef.current = assistantId;
      appendMessage({
        id: assistantId,
        role: "assistant",
        content: "",
        status: "streaming",
        modelId: runPayload.modelId ?? undefined,
        createdAt: new Date().toISOString(),
      });

      return streamChatRun(
        {
          taskType: runPayload.taskType,
          modelId: runPayload.modelId,
          prompt: runPayload.prompt,
          fileIds: runPayload.fileIds,
          params: runPayload.params,
          conversationId: runPayload.conversationId ?? undefined,
        },
        (run) => {
          if (run.id) currentRunIdRef.current = run.id;
          setLatestRun(run);
          setActiveResultTab("preview");
          const assistantMessageId = activeAssistantIdRef.current;
          if (assistantMessageId) {
            const text =
              run.output?.type === "text" ? ((run.output as { text?: string }).text ?? "") : "";
            updateMessage(assistantMessageId, {
              content: text,
              status: run.status === "cancelled" ? "cancelled" : "streaming",
              runId: run.id,
              providerId: run.providerId,
            });
          }
        },
      );
    },
    onSuccess: (run) => {
      setLatestRun(run);
      setActiveResultTab("preview");
      queryClient.invalidateQueries({ queryKey: ["history-runs"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      const assistantMessageId = activeAssistantIdRef.current;
      if (assistantMessageId) {
        const text =
          run.output?.type === "text" ? ((run.output as { text?: string }).text ?? "") : "";
        updateMessage(assistantMessageId, {
          content: text,
          status: run.status === "cancelled" ? "cancelled" : "completed",
          runId: run.id,
          providerId: run.providerId,
        });
      }
      // Update URL with conversationId if newly created
      const newConvId = (run as RunRecord & { conversationId?: string }).conversationId;
      if (newConvId && !conversationId) {
        setConversationId(newConvId);
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.set("conversationId", newConvId);
        router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
      }
      activeAssistantIdRef.current = null;
      currentRunIdRef.current = null;
    },
    onError: (error) => {
      const assistantMessageId = activeAssistantIdRef.current;
      if (assistantMessageId) {
        if (error instanceof CancelledRunError) {
          updateMessage(assistantMessageId, { status: "cancelled" });
        } else {
          const apiError = error instanceof ApiError ? error : null;
          updateMessage(assistantMessageId, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Run failed.",
            errorType: apiError?.type,
          });
        }
      }
      activeAssistantIdRef.current = null;
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
      return postData<RunRecord>(`/chat/runs/${runId}/cancel`, {});
    },
    onSuccess: (response) => {
      if (response) {
        setLatestRun({ ...response, status: "cancelled" });
      }
      const assistantMessageId = activeAssistantIdRef.current;
      if (assistantMessageId) {
        updateMessage(assistantMessageId, { status: "cancelled" });
      }
      activeAssistantIdRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["history-runs"] });
    },
  });

  const providers = providersQuery.data ?? [];
  const history = historyQuery.data ?? [];
  const availableModels = recommendationQuery.data?.availableModels ?? [];
  const hiddenModels = recommendationQuery.data?.hiddenModels ?? [];
  const selectedProvider = providers.find((provider) => provider.id === selectedModel?.provider);
  const canRun = Boolean(selectedModelId) && (prompt.trim().length > 0 || files.length > 0);

  return {
    // State
    selectedTaskType,
    selectedModelId,
    providerFilter,
    prompt,
    params,
    files,
    latestRun,
    messages,
    conversationId,
    fromRunId,
    fromRunModelId,
    // Setters
    setSelectedTaskType,
    setSelectedModelId,
    setProviderFilter,
    setPrompt,
    setParam,
    setParams,
    addFile,
    removeFile,
    setLatestRun,
    appendMessage,
    updateMessage,
    clearMessages,
    setConversationId,
    loadMessages,
    resetWorkspace,
    // Derived
    selectedTask,
    fileIds,
    inputTypes,
    canRun,
    // Conversation data
    conversationSummary: (conversationQuery.data as ConversationView | undefined)?.summary ?? null,
    // Query data
    providers,
    models: modelsQuery.data ?? [],
    availableModels,
    hiddenModels,
    selectedModel,
    selectedProvider,
    paramSchema: paramSchemaQuery.data,
    history,
    // Mutations
    uploadMutation,
    deleteFileMutation,
    runMutation,
    cancelMutation,
    // Refs
    fileInputRef,
    currentRunIdRef,
    // UI state
    activeResultTab,
    setActiveResultTab,
    // URL sync
    handleSelectTask,
  };
}

/* ── Streaming logic ─────────────────────────────────────── */

export async function streamChatRun(
  payload: {
    taskType: string;
    modelId: string;
    prompt: string;
    fileIds: string[];
    params: Record<string, string | number | boolean>;
    compareGroupId?: string;
    conversationId?: string;
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
  let capturedConversationId: string | undefined;

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
      if (typeof event.conversationId === "string") {
        capturedConversationId = event.conversationId;
      }
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
          try {
            await reader.cancel();
          } catch {
            /* best-effort */
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

  if (doneRun) {
    const result = doneRun as RunRecord & { conversationId?: string };
    result.conversationId = capturedConversationId;
    return result;
  }
  return {
    id: runId || "streaming-run",
    taskType: payload.taskType,
    providerId: "",
    modelId: payload.modelId,
    input: { prompt: payload.prompt, fileIds: payload.fileIds },
    params: payload.params,
    output: { type: "text", text: outputText },
    status: "completed",
    conversationId: capturedConversationId,
  } as RunRecord & { conversationId?: string };
}

export class CancelledRunError extends Error {
  constructor(public runId: string) {
    super(`Run ${runId} cancelled.`);
    this.name = "CancelledRunError";
  }
}

function buildStreamingEventError(event: Record<string, unknown>): Error {
  const error =
    event.error && typeof event.error === "object"
      ? (event.error as Record<string, unknown>)
      : event;
  return new ApiError(
    String(error.message ?? "Streaming chat failed."),
    200,
    String(error.errorType ?? error.type ?? "STREAM_ERROR"),
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
