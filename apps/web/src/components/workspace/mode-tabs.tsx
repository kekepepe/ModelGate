"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { TaskOption } from "./use-workspace-queries";

export function ModeTabs({
  tasks,
  selectedTaskType,
  onSelect,
}: {
  tasks: TaskOption[];
  selectedTaskType: string;
  onSelect: (taskType: string) => void;
}) {
  const enabledTasks = tasks.filter((t) => !t.disabled);

  return (
    <div className="mb-8 flex justify-center">
      <Tabs value={selectedTaskType} onValueChange={onSelect}>
        <TabsList className="bg-muted/50">
          {enabledTasks.map((task) => {
            const Icon = task.icon;
            return (
              <TabsTrigger key={task.id} value={task.id} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {task.name}
              </TabsTrigger>
            );
          })}
          <TabsTrigger value="generation" disabled className="gap-1.5 opacity-50">
            Generation
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
