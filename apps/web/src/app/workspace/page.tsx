import { Suspense } from "react";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function WorkspacePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-100 p-6 text-sm text-slate-600">加载工作台...</main>}>
      <WorkspaceShell />
    </Suspense>
  );
}
