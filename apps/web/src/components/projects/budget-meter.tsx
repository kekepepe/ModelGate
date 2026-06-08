"use client";

import { Progress } from "@/components/ui/progress";

interface Usage {
  agentsUsed?: number;
  tokensUsed?: number;
  runtimeSeconds?: number;
  contextFilesUsed?: number;
}

interface Budget {
  maxAgents?: number;
  maxTokens?: number;
  maxRuntimeSeconds?: number;
  maxContextFiles?: number;
}

interface Props {
  usage: Usage | null;
  budget: Budget | null | undefined;
}

function pct(used: number | undefined, max: number | undefined): number {
  if (!used || !max || max === 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

export function BudgetMeter({ usage, budget }: Props) {
  if (!usage) {
    return null;
  }
  const agentsMax = budget?.maxAgents ?? 6;
  const tokensMax = budget?.maxTokens ?? 200_000;
  const runtimeMax = budget?.maxRuntimeSeconds ?? 600;

  return (
    <div
      className="rounded-lg border bg-card p-4"
      data-testid="budget-meter"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Budget</h3>
        <span className="text-xs text-muted-foreground">live usage</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Agents</span>
            <span data-testid="budget-agents">
              {usage.agentsUsed ?? 0} / {agentsMax}
            </span>
          </div>
          <Progress value={pct(usage.agentsUsed, agentsMax)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Tokens</span>
            <span data-testid="budget-tokens">
              {usage.tokensUsed ?? 0} / {tokensMax}
            </span>
          </div>
          <Progress value={pct(usage.tokensUsed, tokensMax)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Runtime (s)</span>
            <span data-testid="budget-runtime">
              {usage.runtimeSeconds ?? 0} / {runtimeMax}
            </span>
          </div>
          <Progress value={pct(usage.runtimeSeconds, runtimeMax)} />
        </div>
      </div>
    </div>
  );
}
