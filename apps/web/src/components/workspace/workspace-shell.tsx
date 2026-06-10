"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, GitCompare, PanelLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";

import { useWorkspaceQueries, tasks } from "./use-workspace-queries";
import { ModeTabs } from "./mode-tabs";
import { ModelSelectorRow } from "./model-selector-row";
import { ParamsPopover } from "./params-popover";
import { ChatWorkspace } from "./chat-workspace";
import { ConversationSidebar } from "./conversation-sidebar";
import { PromptTemplatePopover } from "./prompt-template-popover";
import { CompareDrawer } from "./compare-drawer";

export function WorkspaceShell() {
  const q = useWorkspaceQueries();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingTemplateParams, setPendingTemplateParams] = useState<{
    name: string;
    params: Record<string, string | number | boolean>;
  } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleNewChat = useCallback(() => {
    q.resetWorkspace();
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("conversationId");
    router.replace(`${pathname}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`, {
      scroll: false,
    });
  }, [q, router, pathname, searchParams]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      q.setConversationId(id);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("conversationId", id);
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    },
    [q, router, pathname, searchParams],
  );

  const modelSlot = (
    <ModelSelectorRow
      availableModels={q.availableModels}
      hiddenModels={q.hiddenModels}
      selectedModelId={q.selectedModelId}
      selectedModel={q.selectedModel}
      selectedProvider={q.selectedProvider}
      providers={q.providers}
      taskInputTypes={q.inputTypes}
      onSelectModel={q.setSelectedModelId}
      originalModelId={q.fromRunModelId ?? undefined}
    />
  );

  const paramsSlot = (
    <ParamsPopover
      schema={q.paramSchema}
      params={q.params}
      provider={q.selectedProvider}
      model={q.selectedModel}
      taskId={q.selectedTask.id}
      onChange={q.setParam}
      onApplyMany={q.setParams}
      onReset={() => {
        const schema = q.paramSchema;
        if (!schema) return;
        const defaults = Object.fromEntries(
          schema.fields.map((f) => [f.key, f.default ?? (f.type === "boolean" ? false : "")]),
        );
        q.setParams(defaults);
      }}
    />
  );

  const extraActionsSlot = (
    <>
      <PromptTemplatePopover
        taskId={q.selectedTask.id}
        currentPrompt={q.prompt}
        currentParams={q.params}
        onSelect={(template) => {
          q.setPrompt(template.prompt);
          if (template.recommendedParams) {
            setPendingTemplateParams({ name: template.title, params: template.recommendedParams });
          }
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1"
        disabled={
          !q.selectedModelId || q.availableModels.length < 2 || q.prompt.trim().length === 0
        }
        onClick={() => setCompareOpen(true)}
        title="Compare with other models"
      >
        <GitCompare className="h-3.5 w-3.5" />
        Compare
      </Button>
    </>
  );

  return (
    <div className="relative flex min-h-full">
      {sidebarOpen && (
        <ConversationSidebar
          activeConversationId={q.conversationId}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
        />
      )}
      <div className="flex flex-1 justify-center px-4 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />

        <div className="relative w-full max-w-5xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                data-testid="sidebar-toggle"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
              <ModeTabs
                tasks={tasks}
                selectedTaskType={q.selectedTaskType}
                onSelect={q.handleSelectTask}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewChat}
              data-testid="workspace-new-task"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              New Chat
            </Button>
          </div>

          <ChatWorkspace
            modelSlot={modelSlot}
            paramsSlot={paramsSlot}
            extraActionsSlot={extraActionsSlot}
          />

          {q.runMutation.error ? (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              data-testid="workspace-run-error"
            >
              <div>{q.runMutation.error.message}</div>
              {q.runMutation.error instanceof ApiError && q.runMutation.error.requestId ? (
                <div className="mt-1 text-xs text-destructive/70">
                  requestId: {q.runMutation.error.requestId}
                </div>
              ) : null}
            </div>
          ) : null}

          {pendingTemplateParams ? (
            <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <div>
                Template <span className="font-medium">{pendingTemplateParams.name}</span>{" "}
                recommends specific params. Apply them?
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPendingTemplateParams(null)}>
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    for (const [k, v] of Object.entries(pendingTemplateParams.params)) {
                      q.setParam(k, v);
                    }
                    setPendingTemplateParams(null);
                  }}
                >
                  Apply params
                </Button>
              </div>
            </div>
          ) : null}

          <CompareDrawer
            open={compareOpen}
            onClose={() => setCompareOpen(false)}
            taskType={q.selectedTaskType}
            prompt={q.prompt}
            fileIds={q.files.map((f) => f.id)}
            params={q.params}
            availableModels={q.availableModels}
            providers={q.providers}
            initialModelIds={
              q.selectedModelId
                ? [
                    q.selectedModelId,
                    ...q.availableModels
                      .filter((m) => m.id !== q.selectedModelId)
                      .slice(0, 1)
                      .map((m) => m.id),
                  ]
                : q.availableModels.slice(0, 2).map((m) => m.id)
            }
          />
        </div>
      </div>
    </div>
  );
}
