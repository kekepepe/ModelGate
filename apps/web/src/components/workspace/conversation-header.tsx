"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { postData } from "@/lib/api";
import type { ConversationView } from "@/lib/api";

type Props = {
  conversationId: string;
  summary: string | null;
};

export function ConversationHeader({ conversationId, summary }: Props) {
  const [expanded, setExpanded] = useState(true);
  const queryClient = useQueryClient();

  const resetMutation = useMutation({
    mutationFn: () => postData<ConversationView>(`/conversations/${conversationId}/summary/reset`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => postData<ConversationView>(`/conversations/${conversationId}/summary/regenerate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  if (!summary) return null;

  return (
    <div className="mx-3 mt-2 rounded-lg border bg-muted/40 text-sm" data-testid="conversation-summary">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 text-left font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Conversation Summary
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Regenerate summary"
          disabled={regenerateMutation.isPending}
          onClick={() => regenerateMutation.mutate()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Clear summary"
          disabled={resetMutation.isPending}
          onClick={() => resetMutation.mutate()}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded && (
        <div className="border-t px-3 py-2 text-muted-foreground whitespace-pre-wrap">
          {summary}
        </div>
      )}
    </div>
  );
}
