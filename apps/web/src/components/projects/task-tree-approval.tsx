"use client";

import { useState } from "react";
import { Check, Loader2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import type { ArtifactView, ProjectTaskView } from "@/lib/api";

interface Props {
  tasks: ProjectTaskView[];
  artifacts?: ArtifactView[];
  isPatchMode?: boolean;
  onApprove: (
    taskIds: string[],
    fileApprovals?: Record<string, Record<string, "accept" | "reject">>,
  ) => void;
  isSubmitting: boolean;
}

function roleTone(role: string): StatusTone {
  const known = ["backend", "frontend", "database", "test", "docs", "refactor", "security"];
  return known.includes(role) ? "queued" : "muted";
}

function getTaskPatchFiles(
  taskId: string,
  artifacts: ArtifactView[],
): Array<{ file: string; reason?: string }> {
  const patchArtifact = artifacts.find((a) => a.type === "patch" && a.taskId === taskId);
  if (!patchArtifact) return [];

  const metadata = patchArtifact.metadata as Record<string, unknown> | null | undefined;
  const validation = metadata?.validation as Record<string, unknown> | undefined;
  const highRiskFiles =
    (validation?.highRiskFiles as Array<{ file: string; reason: string }>) || [];

  // Extract file paths from diff content
  const diffText = String(patchArtifact.content ?? "");
  const fileSet = new Set<string>();
  const regex = /^\+\+\+ [ab]\/(.+)$/gm;
  let match;
  while ((match = regex.exec(diffText)) !== null) {
    if (match[1] !== "/dev/null") fileSet.add(match[1]);
  }

  const highRiskMap = new Map(highRiskFiles.map((hr) => [hr.file, hr.reason]));
  return Array.from(fileSet).map((file) => ({
    file,
    reason: highRiskMap.get(file),
  }));
}

export function TaskTreeApproval({
  tasks,
  artifacts = [],
  isPatchMode = false,
  onApprove,
  isSubmitting,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(tasks.map((t) => t.id)));
  // Track per-file approvals: { taskId: { filePath: "accept" | "reject" } }
  const [fileApprovals, setFileApprovals] = useState<
    Record<string, Record<string, "accept" | "reject">>
  >({});
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpanded(taskId: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleFileApproval(taskId: string, filePath: string) {
    setFileApprovals((prev) => {
      const taskApprovals = prev[taskId] || {};
      const current = taskApprovals[filePath] || "accept";
      return {
        ...prev,
        [taskId]: {
          ...taskApprovals,
          [filePath]: current === "accept" ? "reject" : "accept",
        },
      };
    });
  }

  function handleApprove() {
    const approvals = isPatchMode ? fileApprovals : undefined;
    onApprove(Array.from(selected), approvals);
  }

  return (
    <div className="rounded-lg border bg-card p-4" data-testid="task-tree-approval">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Planner proposal</h2>
          <p className="text-xs text-muted-foreground">
            {tasks.length} tasks proposed. Uncheck any you don&apos;t want to execute.
            {isPatchMode && " Review per-file patches below."}
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleApprove}
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
        {tasks.map((t) => {
          const patchFiles = isPatchMode ? getTaskPatchFiles(t.id, artifacts) : [];
          const isExpanded = expandedTasks.has(t.id);

          return (
            <li key={t.id} className="flex items-start gap-3 rounded-md border bg-background p-3">
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
                {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                {t.allowedFiles.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Files: {t.allowedFiles.join(", ")}
                  </p>
                )}

                {/* Per-file patch approval (V2.6 Patch Mode) */}
                {isPatchMode && patchFiles.length > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(t.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {patchFiles.length} file{patchFiles.length !== 1 ? "s" : ""} in patch
                    </button>
                    {isExpanded && (
                      <ul className="mt-1 ml-4 space-y-1">
                        {patchFiles.map((pf) => {
                          const approval = fileApprovals[t.id]?.[pf.file] || "accept";
                          const isRejected = approval === "reject";
                          return (
                            <li key={pf.file} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={!isRejected}
                                onChange={() => toggleFileApproval(t.id, pf.file)}
                                className="h-3 w-3 rounded"
                              />
                              <span
                                className={isRejected ? "line-through text-muted-foreground" : ""}
                              >
                                {pf.file}
                              </span>
                              {pf.reason && (
                                <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="h-3 w-3" />
                                  {pf.reason}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
