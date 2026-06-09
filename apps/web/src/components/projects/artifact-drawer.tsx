"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UnifiedDiffView } from "./unified-diff-view";
import { PatchActions } from "./patch-actions";
import { TestResultsView } from "./test-results-view";
import type { ArtifactView } from "@/lib/api";

interface Props {
  artifact: ArtifactView | null;
  onOpenChange: (open: boolean) => void;
  onApplyPatch?: (artifactId: string, confirmHighRisk: boolean) => void;
  onRejectPatch?: (artifactId: string) => void;
  onRegeneratePatch?: (artifactId: string) => void;
}

function toneFor(type: string): StatusTone {
  if (type === "final_plan") return "ready";
  if (type === "review") return "warn";
  if (type === "worker") return "running";
  if (type === "patch") return "running";
  return "muted";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function ArtifactDrawer({
  artifact,
  onOpenChange,
  onApplyPatch,
  onRejectPatch,
  onRegeneratePatch,
}: Props) {
  const open = artifact !== null;
  const isPatch = artifact?.type === "patch";

  const metadata = artifact?.metadata as Record<string, unknown> | null | undefined;
  const validation = metadata?.validation as Record<string, unknown> | undefined;
  const highRiskFiles = (validation?.highRiskFiles as Array<{ file: string; reason: string }>) || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-3 sm:max-w-[640px]"
        data-testid="artifact-drawer"
      >
        {artifact && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <StatusPill tone={toneFor(artifact.type)}>{artifact.type}</StatusPill>
                <SheetTitle className="text-sm">{artifact.name}</SheetTitle>
              </div>
              <SheetDescription>
                {formatBytes(artifact.sizeBytes)}
                {artifact.truncated ? " · truncated" : ""}
              </SheetDescription>
            </SheetHeader>

            {isPatch ? (
              <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                <ScrollArea className="flex-1 rounded-md border">
                  <div className="p-3" data-testid="artifact-content">
                    <UnifiedDiffView
                      diff={String(artifact.content ?? "")}
                      highRiskFiles={highRiskFiles}
                    />
                  </div>
                </ScrollArea>
                {onApplyPatch && onRejectPatch && onRegeneratePatch && (
                  <div className="shrink-0">
                    <PatchActions
                      artifact={artifact}
                      onApply={(confirmHighRisk) => onApplyPatch(artifact.id, confirmHighRisk)}
                      onReject={() => onRejectPatch(artifact.id)}
                      onRegenerate={() => onRegeneratePatch(artifact.id)}
                    />
                  </div>
                )}
              </div>
            ) : artifact.type === "verifier_report" ? (
              <ScrollArea className="flex-1 rounded-md border bg-muted/30 p-3">
                <TestResultsView
                  verdict={String((artifact.content as Record<string, unknown>)?.verdict ?? "?")}
                  analysis={String((artifact.content as Record<string, unknown>)?.analysis ?? "")}
                  failedTests={
                    ((artifact.content as Record<string, unknown>)?.failed_tests as Array<Record<string, unknown>>) ?? []
                  }
                  appliedFiles={
                    ((artifact.content as Record<string, unknown>)?.applied_files as string[]) ?? []
                  }
                  round={(artifact.content as Record<string, unknown>)?.round as number | undefined}
                  pytestSummary={
                    (artifact.content as Record<string, unknown>)?.pytest as Record<string, unknown> | undefined
                  }
                />
              </ScrollArea>
            ) : (
              <ScrollArea className="flex-1 rounded-md border bg-muted/30 p-3">
                <pre
                  className="whitespace-pre-wrap break-words text-xs leading-relaxed"
                  data-testid="artifact-content"
                >
                  {artifact.contentKind === "json"
                    ? JSON.stringify(artifact.content, null, 2)
                    : String(artifact.content ?? "")}
                </pre>
              </ScrollArea>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
