"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Trash2 } from "lucide-react";

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
import { ProjectCreateModal } from "@/components/projects/project-create-modal";
import { projectApi, type ProjectRunStatus, type ProjectRunView } from "@/lib/api";

function statusToTone(status: ProjectRunStatus): StatusTone {
  switch (status) {
    case "running":
    case "pending":
      return "running";
    case "awaiting_approval":
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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectRunView | null>(null);
  const [listDeleteError, setListDeleteError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectApi.list(),
    refetchInterval: (q) => {
      const runs = q.state.data ?? [];
      const hasActive = runs.some(
        (r) => r.status === "running" || r.status === "pending" || r.status === "awaiting_approval",
      );
      return hasActive ? 2000 : false;
    },
  });

  const createMut = useMutation({
    mutationFn: projectApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setCreateOpen(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => projectApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setPendingDelete(null);
      setListDeleteError(null);
    },
    onError: (err: Error) => {
      setListDeleteError(err.message || "Delete failed");
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Project Mode</h1>
          <p className="text-sm text-muted-foreground">
            Multi-agent orchestration: Intake → Planner → Workers → Supervisor → Integrator
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="new-project-button">
          <Plus className="mr-2 h-4 w-4" />
          New project run
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading project runs…
        </div>
      )}

      {data && data.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          No project runs yet. Click &quot;New project run&quot; to start.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-card" data-testid="project-list">
          <table className="w-full">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Goal</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Tokens</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {data.map((pr) => (
                <tr key={pr.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${pr.id}`}
                      className="font-medium text-foreground hover:underline"
                      data-testid="project-link"
                    >
                      {pr.title || pr.goal.slice(0, 40)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={statusToTone(pr.status)}>
                      {pr.status.replace("_", " ")}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 max-w-md truncate text-muted-foreground">{pr.goal}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(pr.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{pr.usage?.tokensUsed ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setListDeleteError(null);
                        setPendingDelete(pr);
                      }}
                      data-testid={`project-delete-${pr.id}`}
                      className="text-destructive hover:text-destructive"
                      aria-label={`Delete ${pr.title || pr.goal}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProjectCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(body) => createMut.mutate(body)}
        isSubmitting={createMut.isPending}
        error={createMut.error instanceof Error ? createMut.error.message : null}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!deleteMut.isPending) {
            if (!o) {
              setPendingDelete(null);
              setListDeleteError(null);
            }
          }
        }}
      >
        <DialogContent data-testid="list-delete-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Delete this project run?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `“${pendingDelete.title || pendingDelete.goal.slice(0, 60)}” will be permanently removed, along with its tasks, agent runs, artifacts, and memory entries. This action cannot be undone.`
                : "This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {listDeleteError && (
            <p className="text-sm text-destructive" data-testid="list-delete-error">
              {listDeleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPendingDelete(null);
                setListDeleteError(null);
              }}
              disabled={deleteMut.isPending}
              data-testid="list-delete-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                if (pendingDelete) deleteMut.mutate(pendingDelete.id);
              }}
              disabled={deleteMut.isPending}
              data-testid="list-delete-confirm"
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
