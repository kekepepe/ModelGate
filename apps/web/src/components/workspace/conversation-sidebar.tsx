"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { conversationApi, type ConversationView } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
};

export function ConversationSidebar({ activeConversationId, onSelect, onNewChat }: Props) {
  const queryClient = useQueryClient();
  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => conversationApi.list(),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => conversationApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const conversations = conversationsQuery.data ?? [];

  return (
    <div
      className="flex h-full w-60 flex-col border-r bg-muted/30"
      data-testid="conversation-sidebar"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Conversations</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onNewChat}
          data-testid="conversation-new-chat"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          <div className="space-y-0.5 p-1">
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onSelect={() => onSelect(conv.id)}
                onDelete={() => deleteMutation.mutate(conv.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: {
  conversation: ConversationView;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
        isActive && "bg-accent font-medium",
      )}
      onClick={onSelect}
      data-testid={`conversation-item-${conversation.id}`}
    >
      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{conversation.title}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        data-testid={`conversation-delete-${conversation.id}`}
      >
        <Trash2 className="h-3 w-3 text-muted-foreground" />
      </Button>
    </div>
  );
}
