"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/stores/workspace-store";

import { AssistantMessage, UserMessage } from "./chat-bubbles";

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  // Detect whether user scrolled up — pause auto-scroll until they're near the bottom again.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setStickToBottom(distance < 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    if (!stickToBottom) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, stickToBottom]);

  if (messages.length === 0) {
    return (
      <div
        className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 text-center"
        data-testid="chat-empty-state"
      >
        <div className="text-base font-medium text-foreground/80">Start a conversation</div>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Pick a model, type a prompt below, and send. Replies stream into this area as Markdown.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full min-h-[320px] flex-col gap-3 overflow-y-auto px-4 py-4")}
      data-testid="chat-message-list"
    >
      {messages.map((m) =>
        m.role === "user" ? (
          <UserMessage key={m.id} message={m} />
        ) : (
          <AssistantMessage key={m.id} message={m} />
        ),
      )}
    </div>
  );
}
