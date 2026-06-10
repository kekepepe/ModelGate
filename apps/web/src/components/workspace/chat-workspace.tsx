"use client";

import { useCallback } from "react";

import { useWorkspaceStore } from "@/stores/workspace-store";
import type { ChatMessage } from "@/stores/workspace-store";

import { ConversationHeader } from "./conversation-header";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { useWorkspaceQueries } from "./use-workspace-queries";

type Props = {
  modelSlot?: React.ReactNode;
  paramsSlot?: React.ReactNode;
  extraActionsSlot?: React.ReactNode;
};

export function ChatWorkspace({ modelSlot, paramsSlot, extraActionsSlot }: Props) {
  const q = useWorkspaceQueries();
  const messages = useWorkspaceStore((s) => s.messages);
  const appendMessage = useWorkspaceStore((s) => s.appendMessage);

  const conversationId = q.conversationId;
  const summary = q.conversationSummary;

  const isStreaming = q.runMutation.isPending;
  const canSend = q.canRun && !isStreaming;

  const handleSend = useCallback(() => {
    const trimmed = q.prompt.trim();
    if (!trimmed && q.files.length === 0) return;
    if (!q.selectedModelId) return;

    const userMessage: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      role: "user",
      content: trimmed,
      status: "completed",
      createdAt: new Date().toISOString(),
      attachments: q.files.map((f) => ({ fileId: f.id, name: f.originalName })),
    };
    appendMessage(userMessage);

    // Pass the values explicitly as a payload instead of relying on the
    // mutationFn closure. TanStack Query v5's useMutation only updates the
    // observer's options via a useEffect that runs *after* commit, so
    // clicking send right after typing can race against that effect and
    // dispatch a stale mutationFn closure whose `prompt` is `""`.
    q.runMutation.mutate({
      taskType: q.selectedTaskType,
      modelId: q.selectedModelId,
      prompt: trimmed,
      fileIds: q.fileIds,
      params: q.params,
      conversationId: q.conversationId,
    });
    q.setPrompt("");
  }, [appendMessage, q]);

  const handleStop = useCallback(() => {
    q.cancelMutation.mutate();
  }, [q]);

  return (
    <div
      className="flex h-[calc(100vh-180px)] min-h-[480px] flex-col rounded-2xl border bg-card shadow-[0_12px_36px_rgba(72,60,45,0.06)]"
      data-testid="chat-workspace"
    >
      {conversationId && summary && (
        <ConversationHeader conversationId={conversationId} summary={summary} />
      )}
      <div className="flex-1 overflow-hidden">
        <MessageList messages={messages} />
      </div>
      <Composer
        prompt={q.prompt}
        onPromptChange={q.setPrompt}
        onSend={handleSend}
        onStop={handleStop}
        isStreaming={isStreaming}
        canSend={canSend}
        files={q.files}
        onUpload={(file) => q.uploadMutation.mutate(file)}
        onRemoveFile={(fileId) => q.deleteFileMutation.mutate(fileId)}
        uploadError={q.uploadMutation.error?.message ?? null}
        modelSlot={modelSlot}
        paramsSlot={paramsSlot}
        extraActionsSlot={extraActionsSlot}
      />
    </div>
  );
}
