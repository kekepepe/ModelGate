import { Suspense } from "react";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function WorkspacePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#07111f] p-6 text-sm text-slate-400">加载工作台...</main>}>
      <WorkspaceShell />
    </Suspense>
  );
}
