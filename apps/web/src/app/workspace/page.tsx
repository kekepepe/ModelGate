import { Suspense } from "react";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function WorkspacePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-6 text-sm text-muted-foreground">Loading Playground...</main>}>
      <WorkspaceShell />
    </Suspense>
  );
}
