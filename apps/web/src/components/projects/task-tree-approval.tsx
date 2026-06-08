"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import type { ProjectTaskView } from "@/lib/api";

interface Props {
  tasks: ProjectTaskView[];
  onApprove: (taskIds: string[]) => void;
  isSubmitting: boolean;
}

function roleTone(role: string): StatusTone {
  const known = ["backend", "frontend", "database", "test", "docs", "refactor", "security"];
  return known.includes(role) ? "queued" : "muted";
}

export function TaskTreeApproval({ tasks, onApprove, isSubmitting }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(tasks.map((t) => t.id)),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4" data-testid="task-tree-approval">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Planner proposal</h2>
          <p className="text-xs text-muted-foreground">
            {tasks.length} tasks proposed. Uncheck any you don&apos;t want to execute.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => onApprove(Array.from(selected))}
          disabled={isSubmitting || selected.size === 0}
          data-testid="approve-button"
        >
          {isSubmitting ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Check className="mr-1 h-3 w-3" />
          )}
          Approve {selected.size}
        </Button>
      </div>
      <ul className="space-y-2" data-testid="task-list">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex items-start gap-3 rounded-md border bg-background p-3"
          >
            <input
              type="checkbox"
              checked={selected.has(t.id)}
              onChange={() => toggle(t.id)}
              className="mt-1 h-4 w-4 rounded border-gray-300"
              data-testid={`task-checkbox-${t.id}`}
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <StatusPill tone={roleTone(t.role)}>{t.role}</StatusPill>
                <span className="text-sm font-medium">{t.title}</span>
                <span className="text-xs text-muted-foreground">{t.id}</span>
              </div>
              {t.description && (
                <p className="text-xs text-muted-foreground">{t.description}</p>
              )}
              {t.allowedFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Files: {t.allowedFiles.join(", ")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
