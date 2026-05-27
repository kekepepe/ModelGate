"use client";

import { useSearchParams } from "next/navigation";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function WorkspaceShell() {
  const params = useSearchParams();
  const taskType = params.get("taskType") ?? "chat";
  const selectedModelId = useWorkspaceStore((state) => state.selectedModelId);

  return (
    <main className="grid min-h-screen grid-cols-[280px_1fr_360px] bg-slate-50">
      <aside className="border-r bg-white p-4">
        <h2 className="font-semibold">任务与模型</h2>
        <div className="mt-4 rounded-md bg-slate-100 p-3 text-sm">当前任务：{taskType}</div>
        <div className="mt-3 rounded-md bg-slate-100 p-3 text-sm">
          当前模型：{selectedModelId ?? "未选择"}
        </div>
      </aside>

      <section className="p-4">
        <h1 className="text-xl font-semibold">输入与参数</h1>
        <textarea
          className="mt-4 min-h-48 w-full rounded-md border border-slate-300 p-3"
          placeholder="输入 prompt..."
        />
        <button className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm text-white">运行</button>
      </section>

      <aside className="border-l bg-white p-4">
        <h2 className="font-semibold">结果与历史</h2>
        <p className="mt-4 text-sm text-slate-600">运行结果将在这里展示。</p>
      </aside>
    </main>
  );
}

