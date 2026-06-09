"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AgentBoard } from "@/components/projects/agent-board";
import { AgentRunDrawer } from "@/components/projects/agent-run-drawer";
import { TaskTreeApproval } from "@/components/projects/task-tree-approval";
import { BudgetMeter } from "@/components/projects/budget-meter";
import { ArtifactDrawer } from "@/components/projects/artifact-drawer";
import { projectApi, type ProjectRunStatus, type ProjectRunDetails, type ArtifactView, type AgentRunView, type ProjectTaskView, type PatchApplyResponse } from "@/lib/api";

interface Budget {
  maxAgents?: number;
  maxTokens?: number;
  maxRuntimeSeconds?: number;
  maxContextFiles?: number;
}

function statusToTone(status: ProjectRunStatus): StatusTone {
  switch (status) {
    case "running":
    case "pending":
      return "running";
    case "awaiting_approval":
      return "warn";
    case "validation_failed":
      return "warn";
    case "completed":
      return "ready";
    case "failed":
    case "budget_exceeded":
    case "cancelled":
      return "failed";
    default:
      return "muted";
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactView | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<{
    run: AgentRunView;
    task: ProjectTaskView | null;
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => projectApi.get(id),
    refetchInterval: (q) => {
      const d = q.state.data as ProjectRunDetails | undefined;
      const status = d?.projectRun.status;
      if (!status) return 2000;
      return status === "completed" || status === "failed" || status === "cancelled" || status === "budget_exceeded" || status === "validation_failed"
        ? false
        : 2000;
    },
  });

  const approveMut = useMutation({
    mutationFn: (body: {
      taskIds?: string[];
      fileApprovals?: Record<string, Record<string, "accept" | "reject">>;
    }) => projectApi.approve(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", id] }),
  });

  const cancelMut = useMutation({
    mutationFn: () => projectApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", id] }),
  });

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteMut = useMutation({
    mutationFn: () => projectApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setDeleteOpen(false);
      router.push("/projects");
    },
    onError: (err: Error) => {
      setDeleteError(err.message || "Delete failed");
    },
  });

  const applyPatchMut = useMutation({
    mutationFn: (body: { artifactId: string; confirmHighRisk: boolean }) =>
      projectApi.applyPatch(id, body.artifactId, { confirmHighRisk: body.confirmHighRisk }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", id] }),
  });

  const rejectPatchMut = useMutation({
    mutationFn: (artifactId: string) => projectApi.rejectPatch(id, artifactId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", id] }),
  });

  const regenerateMut = useMutation({
    mutationFn: (taskIds: string[]) =>
      projectApi.regeneratePatches(id, { taskIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", id] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading project run…
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">Project run not found.</div>;
  }

  const { projectRun: pr, tasks, agentRuns, artifacts } = data;

  return (
    <div className="space-y-6 p-6" data-testid="project-detail">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Back to projects
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{pr.title || pr.goal}</h1>
          <p className="text-sm text-muted-foreground">{pr.goal}</p>
          <div className="flex items-center gap-2">
            <StatusPill tone={statusToTone(pr.status)} data-testid="project-status">
              {pr.status.replace("_", " ")}
            </StatusPill>
            {pr.errorMessage && (
              <span className="text-xs text-destructive" data-testid="error-message">
                {pr.errorMessage}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pr.status === "running" || pr.status === "awaiting_approval" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelMut.mutate()}
              disabled={cancelMut.isPending}
              data-testid="cancel-button"
            >
              <X className="mr-1 h-3 w-3" /> Cancel
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={deleteMut.isPending}
            data-testid="delete-button"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
        </div>
      </div>

      <BudgetMeter usage={pr.usage} budget={pr.budget as Budget | null} />

      {pr.status === "awaiting_approval" && tasks.length > 0 && (
        <TaskTreeApproval
          tasks={tasks}
          artifacts={artifacts}
          isPatchMode={(pr.mode || "") === "patch" || pr.mode === "apply_with_approval"}
          onApprove={(selectedIds, fileApprovals) =>
            approveMut.mutate({ taskIds: selectedIds, fileApprovals })
          }
          isSubmitting={approveMut.isPending}
        />
      )}

      <AgentBoard
        agentRuns={agentRuns}
        tasks={tasks}
        artifacts={artifacts}
        onArtifactClick={setSelectedArtifact}
        onAgentClick={(run, task) => setSelectedAgent({ run, task })}
      />

      <ArtifactDrawer
        artifact={selectedArtifact}
        onOpenChange={(open) => !open && setSelectedArtifact(null)}
        onApplyPatch={(artifactId, confirmHighRisk) =>
          applyPatchMut.mutate({ artifactId, confirmHighRisk })
        }
        onRejectPatch={(artifactId) => rejectPatchMut.mutate(artifactId)}
        onRegeneratePatch={() => {
          const taskId = selectedArtifact?.taskId;
          if (taskId) regenerateMut.mutate([taskId]);
        }}
      />

      <AgentRunDrawer
        agentRun={selectedAgent?.run ?? null}
        task={selectedAgent?.task ?? null}
        artifacts={
          selectedAgent
            ? artifacts.filter((a) => a.agentRunId === selectedAgent.run.id)
            : []
        }
        onOpenChange={(open) => !open && setSelectedAgent(null)}
      />

      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleteMut.isPending) { setDeleteOpen(o); if (!o) setDeleteError(null); } }}>
        <DialogContent data-testid="delete-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Delete this project run?</DialogTitle>
            <DialogDescription>
              This will permanently remove the run, its tasks, agent runs, artifacts, and memory entries.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMut.isPending}
              data-testid="delete-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteMut.mutate();
              }}
              disabled={deleteMut.isPending}
              data-testid="delete-confirm"
            >
              {deleteMut.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3 w-3" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
