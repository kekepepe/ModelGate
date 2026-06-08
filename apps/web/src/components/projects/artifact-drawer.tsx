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
import type { ArtifactView } from "@/lib/api";

interface Props {
  artifact: ArtifactView | null;
  onOpenChange: (open: boolean) => void;
}

function toneFor(type: string): StatusTone {
  if (type === "final_plan") return "ready";
  if (type === "review") return "warn";
  if (type === "worker") return "running";
  return "muted";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function ArtifactDrawer({ artifact, onOpenChange }: Props) {
  const open = artifact !== null;
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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
