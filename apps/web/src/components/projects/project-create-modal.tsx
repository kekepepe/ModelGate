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

const AGENT_ROLES = [
  { key: "intake", label: "Intake", description: "Parses goal into structured intake" },
  { key: "planner", label: "Planner", description: "Breaks goal into tasks" },
  { key: "worker", label: "Worker", description: "Implements individual tasks" },
  { key: "supervisor", label: "Supervisor", description: "Reviews worker outputs" },
  { key: "integrator", label: "Integrator", description: "Combines into final plan" },
] as const;

type AgentRoleKey = (typeof AGENT_ROLES)[number]["key"];

function findRecommendedModel(models: ModelInfo[]): ModelInfo | null {
  // Prefer chat models with large context windows
  const withChat = models.filter(
    (m) => m.capabilities?.includes("chat") || m.taskTypes?.includes("chat"),
  );
  const largeContext = withChat.filter((m) => (m.contextWindow ?? 0) >= 32768);
  return largeContext[0] ?? withChat[0] ?? models[0] ?? null;
}

export function ProjectCreateModal({ open, onOpenChange, onSubmit, isSubmitting, error }: Props) {
  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("advisory");
  const [agentModels, setAgentModels] = useState<Record<AgentRoleKey, string>>({
    intake: "",
    planner: "",
    worker: "",
    supervisor: "",
    integrator: "",
  });
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

  const recommended = useMemo(() => findRecommendedModel(availableModels), [availableModels]);

  // Set defaults once data loads
  useMemo(() => {
    if (availableModels.length > 0 && Object.values(agentModels).every((v) => !v)) {
      const defaultId = recommended?.id ?? availableModels[0].id;
      setAgentModels({
        intake: defaultId,
        planner: defaultId,
        worker: defaultId,
        supervisor: defaultId,
        integrator: defaultId,
      });
    }
  }, [availableModels, recommended, agentModels]);

  // Build grouped options: recommended first, then by provider
  const modelOptions = useMemo(() => {
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

  function setAgentModel(role: AgentRoleKey, modelId: string) {
    setAgentModels((prev) => ({ ...prev, [role]: modelId }));
  }

  const modeDescriptions: Record<string, string> = {
    advisory: "Workers propose changes without generating code",
    patch: "Workers generate unified diffs for review and application",
    apply_with_approval: "Workers generate patches; you choose what to apply to source",
    controlled_auto: "Auto-apply patches, run pytest, verifier reviews in a loop",
  };

  function handleSubmit() {
    if (!goal.trim()) return;
    onSubmit({
      goal: goal.trim(),
      title: title.trim() || undefined,
      mode,
      intakeModelId: agentModels.intake || undefined,
      plannerModelId: agentModels.planner || undefined,
      workerModelId: agentModels.worker || undefined,
      supervisorModelId: agentModels.supervisor || undefined,
      integratorModelId: agentModels.integrator || undefined,
      budget: { maxAgents, maxTokens, maxRuntimeSeconds },
    });
  }

  const isLoading = modelsQuery.isLoading || providersQuery.isLoading;
  const hasModels = availableModels.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px] max-h-[85vh] flex flex-col"
        data-testid="create-project-modal"
      >
        <DialogHeader>
          <DialogTitle>New project run</DialogTitle>
          <DialogDescription>
            Describe the goal. Intake will structure it, then Planner breaks it into 2-6 tasks for
            review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1 flex-1 min-h-0">
          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <Textarea
              id="goal"
              data-testid="goal-input"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Add a /health endpoint to the API and a button on the dashboard"
              rows={3}
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
                <SelectItem value="controlled_auto">Controlled Auto</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{modeDescriptions[mode]}</p>
          </div>

          <div className="space-y-2">
            <Label>Agent models</Label>
            <div className="rounded-md border divide-y">
              {AGENT_ROLES.map((role) => (
                <div
                  key={role.key}
                  className="flex items-center gap-3 px-3 py-2"
                  data-testid={`agent-model-row-${role.key}`}
                >
                  <div className="w-24 shrink-0">
                    <span className="text-sm font-medium">{role.label}</span>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {role.description}
                    </p>
                  </div>
                  <Select
                    value={agentModels[role.key]}
                    onValueChange={(v) => setAgentModel(role.key, v)}
                    disabled={isLoading || !hasModels}
                  >
                    <SelectTrigger
                      className="h-8 flex-1 text-xs"
                      data-testid={`agent-model-select-${role.key}`}
                    >
                      <SelectValue placeholder={isLoading ? "Loading…" : "Select model"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {modelOptions.map(([providerId, { provider, models: pModels }]) => (
                        <SelectGroup key={providerId}>
                          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {provider?.name ?? providerId}
                          </div>
                          {pModels.map((m) => {
                            const isRecommended = m.id === recommended?.id;
                            return (
                              <SelectItem key={m.id} value={m.id} className="text-xs">
                                {m.displayName || m.officialModelName}
                                {isRecommended && (
                                  <span className="ml-1 text-green-600 dark:text-green-400">
                                    (Recommended)
                                  </span>
                                )}
                              </SelectItem>
                            );
                          })}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
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
            disabled={isSubmitting || !goal.trim() || !hasModels}
            data-testid="create-submit"
          >
            {isSubmitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
