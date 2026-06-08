"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CreateProjectRunBody } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: CreateProjectRunBody) => void;
  isSubmitting: boolean;
  error: string | null;
}

export function ProjectCreateModal({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
}: Props) {
  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");
  const [plannerModelId, setPlannerModelId] = useState("gpt-4o");
  const [maxAgents, setMaxAgents] = useState(6);
  const [maxTokens, setMaxTokens] = useState(200_000);
  const [maxRuntimeSeconds, setMaxRuntimeSeconds] = useState(600);

  function handleSubmit() {
    if (!goal.trim()) return;
    onSubmit({
      goal: goal.trim(),
      title: title.trim() || undefined,
      plannerModelId: plannerModelId.trim() || undefined,
      budget: { maxAgents, maxTokens, maxRuntimeSeconds },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]" data-testid="create-project-modal">
        <DialogHeader>
          <DialogTitle>New project run</DialogTitle>
          <DialogDescription>
            Describe the goal. Intake will structure it, then Planner breaks it into
            2-6 tasks for review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <Textarea
              id="goal"
              data-testid="goal-input"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Add a /health endpoint to the API and a button on the dashboard"
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="API Health Check"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plannerModel">Planner model</Label>
            <Input
              id="plannerModel"
              value={plannerModelId}
              onChange={(e) => setPlannerModelId(e.target.value)}
              placeholder="gpt-4o"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="maxAgents">Max agents</Label>
              <Input
                id="maxAgents"
                type="number"
                value={maxAgents}
                onChange={(e) => setMaxAgents(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max tokens</Label>
              <Input
                id="maxTokens"
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 1000)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxRuntime">Max runtime (s)</Label>
              <Input
                id="maxRuntime"
                type="number"
                value={maxRuntimeSeconds}
                onChange={(e) => setMaxRuntimeSeconds(parseInt(e.target.value, 10) || 60)}
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive" data-testid="create-error">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !goal.trim()}
            data-testid="create-submit"
          >
            {isSubmitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
