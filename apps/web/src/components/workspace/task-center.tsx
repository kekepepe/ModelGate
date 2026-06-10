"use client";

import { MessageSquare, PenTool, SearchCode, Sparkles, FileText } from "lucide-react";

import type { TaskType } from "@/types/model";

const iconMap = {
  chat: MessageSquare,
  coding: PenTool,
  code_review: SearchCode,
  document_analysis: FileText,
  prompt_optimize: Sparkles,
};

type TaskCenterProps = {
  tasks: TaskType[];
  selectedTaskType: string;
  onSelectTask: (taskType: string) => void;
};

export function TaskCenter({ tasks, selectedTaskType, onSelectTask }: TaskCenterProps) {
  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const Icon = iconMap[task.id as keyof typeof iconMap] ?? MessageSquare;
        const selected = task.id === selectedTaskType;
        return (
          <button
            key={task.id}
            type="button"
            onClick={() => onSelectTask(task.id)}
            className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition ${
              selected
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white hover:border-slate-400"
            }`}
            title={`切换到${task.name}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{task.name}</span>
              <span
                className={`mt-1 block text-xs ${selected ? "text-slate-200" : "text-slate-500"}`}
              >
                {task.input} → {task.output}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
