"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, DollarSign, Hash, Zap } from "lucide-react";

import { getData } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

type UsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
};

type UsageLog = {
  id: string;
  recordType: string;
  recordId: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  currency: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export function UsagePage() {
  const summaryQuery = useQuery({
    queryKey: ["usage-summary"],
    queryFn: () => getData<UsageSummary>("/usage/summary"),
  });
  const logsQuery = useQuery({
    queryKey: ["usage-logs"],
    queryFn: () => getData<UsageLog[]>("/usage/logs"),
  });

  const summary = summaryQuery.data;
  const logs = logsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage"
        description="Token consumption and cost statistics across providers"
      />

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Hash className="h-4 w-4" />}
          label="Total Tokens"
          value={summary ? formatNumber(summary.totalTokens) : "-"}
          sub={summary ? `${formatNumber(summary.inputTokens)} in / ${formatNumber(summary.outputTokens)} out` : ""}
        />
        <MetricCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Estimated Cost"
          value={summary ? `$${summary.estimatedCost.toFixed(4)}` : "-"}
          sub={summary ? "USD" : ""}
        />
        <MetricCard
          icon={<Zap className="h-4 w-4" />}
          label="Input Tokens"
          value={summary ? formatNumber(summary.inputTokens) : "-"}
          sub={summary ? `${((summary.inputTokens / Math.max(summary.totalTokens, 1)) * 100).toFixed(0)}% of total` : ""}
        />
        <MetricCard
          icon={<Clock className="h-4 w-4" />}
          label="Output Tokens"
          value={summary ? formatNumber(summary.outputTokens) : "-"}
          sub={summary ? `${((summary.outputTokens / Math.max(summary.totalTokens, 1)) * 100).toFixed(0)}% of total` : ""}
        />
      </div>

      {/* Usage logs table */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Recent Usage Logs</h2>
        </div>
        {logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Time</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Provider</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Model</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Input</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Output</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Total</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.slice(0, 20).map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {formatTime(log.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">{log.providerId}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{log.modelId}</td>
                    <td className="px-3 py-2 text-xs">{formatNumber(log.inputTokens)}</td>
                    <td className="px-3 py-2 text-xs">{formatNumber(log.outputTokens)}</td>
                    <td className="px-3 py-2 text-xs font-medium">{formatNumber(log.totalTokens)}</td>
                    <td className="px-3 py-2 text-xs">${log.estimatedCost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No usage data yet. Run tasks in the Playground to see statistics.
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTime(value: string) {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("en-US", { hour12: false });
}
