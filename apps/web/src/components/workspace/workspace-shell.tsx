"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import { DynamicParamForm } from "@/components/workspace/dynamic-param-form";
import { FileUploader } from "@/components/workspace/file-uploader";
import { ModelSelector } from "@/components/workspace/model-selector";
import { ResultPanel } from "@/components/workspace/result-panel";
import { TaskCenter } from "@/components/workspace/task-center";
import { deleteData, getData, postData, uploadData } from "@/lib/api";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { FileRecord, ModelInfo, ParamSchema, Provider, RecommendResult, RunRecord, TaskType } from "@/types/model";

const tasks: TaskType[] = [
  { id: "chat", name: "聊天", input: "text", output: "text", requiredInputTypes: ["text"] },
  { id: "coding", name: "写代码", input: "text/code", output: "text", requiredInputTypes: ["text"] },
  { id: "code_review", name: "代码审查", input: "code", output: "text", requiredInputTypes: ["code"] },
  { id: "document_analysis", name: "文档分析", input: "file", output: "text", requiredInputTypes: ["file"] },
  { id: "prompt_optimize", name: "Prompt 优化", input: "text", output: "text", requiredInputTypes: ["text"] },
];

export function WorkspaceShell() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
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

  useEffect(() => {
    const taskType = searchParams.get("taskType");
    if (taskType && taskType !== selectedTaskType) {
      setSelectedTaskType(taskType);
    }
  }, [searchParams, selectedTaskType, setSelectedTaskType]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskType) ?? tasks[0];
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
    queryKey: ["recommendation", selectedTaskType, inputTypes, providerFilter, params],
    queryFn: () =>
      postData<RecommendResult>("/models/recommend", {
        taskType: selectedTaskType,
        inputTypes,
        requiredOutput: "text",
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
    mutationFn: () =>
      postData<RunRecord>("/chat/runs", {
        taskType: selectedTaskType,
        modelId: selectedModelId,
        prompt,
        fileIds: files.map((file) => file.id),
        params,
      }),
    onSuccess: (run) => {
      setLatestRun(run);
      queryClient.invalidateQueries({ queryKey: ["history-runs"] });
    },
  });

  const canRun = Boolean(selectedModelId) && (prompt.trim().length > 0 || files.length > 0);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="border-r border-slate-200 bg-slate-50 p-4">
          <div className="mb-4">
            <h1 className="text-lg font-semibold">ModelGate</h1>
            <p className="mt-1 text-xs text-slate-500">本地多模型工作台</p>
          </div>
          <TaskCenter tasks={tasks} selectedTaskType={selectedTaskType} onSelectTask={setSelectedTaskType} />
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">模型</h2>
            <ModelSelector
              providers={providersQuery.data ?? []}
              recommendation={recommendationQuery.data}
              providerFilter={providerFilter}
              selectedModelId={selectedModelId}
              onProviderFilter={setProviderFilter}
              onSelectModel={setSelectedModelId}
            />
          </div>
        </aside>

        <section className="min-w-0 p-5">
          <div className="mx-auto max-w-4xl space-y-5">
            <div>
              <h2 className="text-xl font-semibold">{selectedTask.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedModel ? selectedModel.displayName : "正在根据任务筛选模型"}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Prompt</label>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="mt-2 min-h-52 w-full resize-y rounded-md border border-slate-300 bg-white p-3 text-sm outline-none focus:border-slate-700"
                placeholder="输入要发送给模型的内容"
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section>
                <h3 className="mb-3 text-sm font-semibold">文件</h3>
                <FileUploader
                  files={files}
                  uploading={uploadMutation.isPending}
                  onUpload={(file) => uploadMutation.mutate(file)}
                  onDelete={(fileId) => deleteFileMutation.mutate(fileId)}
                />
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold">参数</h3>
                <DynamicParamForm schema={paramSchemaQuery.data} values={params} onChange={setParam} />
              </section>
            </div>

            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3">
              <div className="text-sm text-slate-600">
                {recommendationQuery.data?.availableModels.length ?? 0} 个模型可用
              </div>
              <button
                type="button"
                disabled={!canRun || runMutation.isPending}
                onClick={() => runMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                title="运行任务"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {runMutation.isPending ? "运行中" : "运行"}
              </button>
            </div>
          </div>
        </section>

        <aside className="border-l border-slate-200 bg-slate-50 p-4">
          <ResultPanel
            run={latestRun}
            history={historyQuery.data ?? []}
            onRerun={(run) => {
              setPrompt(String(run.input.prompt ?? ""));
              setSelectedModelId(run.modelId);
            }}
          />
        </aside>
      </div>
    </main>
  );
}
