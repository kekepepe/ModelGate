"use client";

import { Loader2 } from "lucide-react";

import type { ChatMessage } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";

import { MarkdownMessage } from "./markdown-message";

export function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end" data-testid="chat-message-user">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {message.attachments && message.attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.attachments.map((a) => (
              <span
                key={a.fileId}
                className="rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[10px]"
              >
                📎 {a.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AssistantMessage({ message }: { message: ChatMessage }) {
  const isStreaming = message.status === "streaming" || message.status === "pending";
  const isFailed = message.status === "failed";
  const isCancelled = message.status === "cancelled";

  return (
    <div className="flex justify-start" data-testid="chat-message-assistant">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl rounded-tl-sm border bg-card px-4 py-2.5 text-sm shadow-sm",
          isFailed && "border-destructive/40 bg-destructive/5",
          isCancelled && "border-muted-foreground/30 bg-muted/40",
        )}
      >
        {message.modelId ? (
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>{message.modelId}</span>
            {isStreaming ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          </div>
        ) : null}
        <div data-testid="chat-message-assistant-content">
          {message.content ? (
            <MarkdownMessage content={message.content} />
          ) : isStreaming ? (
            <span className="text-muted-foreground">…</span>
          ) : null}
        </div>
        {isFailed && message.errorMessage ? (
          <div className="mt-2 text-xs text-destructive">
            {message.errorType ? <span className="font-medium">{message.errorType}: </span> : null}
            {message.errorMessage}
          </div>
        ) : null}
        {isCancelled ? (
          <div className="mt-2 text-xs text-muted-foreground">Generation cancelled.</div>
        ) : null}
      </div>
    </div>
  );
}
