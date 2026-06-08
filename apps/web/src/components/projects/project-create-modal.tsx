"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getData } from "@/lib/api";
import type { CreateProjectRunBody } from "@/lib/api";
import type { ModelInfo, Provider } from "@/types/model";

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
  const [mode, setMode] = useState("advisory");
  const [plannerModelId, setPlannerModelId] = useState<string>("");
  const [maxAgents, setMaxAgents] = useState(6);
  const [maxTokens, setMaxTokens] = useState(200_000);
  const [maxRuntimeSeconds, setMaxRuntimeSeconds] = useState(600);

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => getData<Provider[]>("/providers"),
    enabled: open,
  });

  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => getData<ModelInfo[]>("/models"),
    enabled: open,
  });

  const providers = providersQuery.data ?? [];
  const models = modelsQuery.data ?? [];

  const availableModels = useMemo(() => {
    return models.filter((m) => {
      const provider = providers.find((p) => p.id === m.provider);
      return provider && provider.configured !== false && provider.enabled !== false;
    });
  }, [models, providers]);

  const modelsByProvider = useMemo(() => {
    const groups = new Map<string, { provider: Provider | undefined; models: ModelInfo[] }>();
    for (const m of availableModels) {
      const key = m.provider;
      if (!groups.has(key)) {
        groups.set(key, { provider: providers.find((p) => p.id === key), models: [] });
      }
      groups.get(key)!.models.push(m);
    }
    return Array.from(groups.entries()).sort((a, b) =>
      (a[1].provider?.name ?? a[0]).localeCompare(b[1].provider?.name ?? b[0]),
    );
  }, [availableModels, providers]);

  // Set default model once data loads
  useMemo(() => {
    if (!plannerModelId && availableModels.length > 0) {
      setPlannerModelId(availableModels[0].id);
    }
  }, [availableModels, plannerModelId]);

  const modeDescriptions: Record<string, string> = {
    advisory: "Workers propose changes without generating code",
    patch: "Workers generate unified diffs for review and application",
    apply_with_approval: "Workers generate patches; you choose what to apply to source",
  };

  function handleSubmit() {
    if (!goal.trim()) return;
    onSubmit({
      goal: goal.trim(),
      title: title.trim() || undefined,
      mode,
      plannerModelId: plannerModelId || undefined,
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
            <Label htmlFor="mode">Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger id="mode" data-testid="mode-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="advisory">Advisory</SelectItem>
                <SelectItem value="patch">Patch</SelectItem>
                <SelectItem value="apply_with_approval">Apply with approval</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {modeDescriptions[mode]}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plannerModel">Planner model</Label>
            <Select
              value={plannerModelId}
              onValueChange={setPlannerModelId}
              disabled={modelsQuery.isLoading || availableModels.length === 0}
            >
              <SelectTrigger id="plannerModel" data-testid="planner-model-select">
                <SelectValue
                  placeholder={
                    modelsQuery.isLoading
                      ? "Loading models…"
                      : availableModels.length === 0
                        ? "No models available"
                        : "Select a model"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {modelsByProvider.map(([providerId, { provider, models: pModels }]) => (
                  <SelectGroup key={providerId}>
                    <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {provider?.name ?? providerId}
                    </div>
                    {pModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName || m.officialModelName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
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
            disabled={isSubmitting || !goal.trim() || !plannerModelId}
            data-testid="create-submit"
          >
            {isSubmitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
