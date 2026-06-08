"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Hash,
  Layers,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { getData } from "@/lib/api";

// --- Types -----------------------------------------------------------------

type UsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  totalRequests: number;
  successRate: number;
  failedRequests: number;
  avgLatencyMs: number | null;
};

type DailyUsage = {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
  failedRequests: number;
  successRate: number;
};

type ProviderUsage = {
  provider: string;
  providerId: string;
  requests: number;
  tokens: number;
  cost: number;
  percentage: number;
};

type ModelUsage = {
  model: string;
  modelId: string;
  provider: string;
  providerId: string | null;
  requests: number;
  tokens: number;
  cost: number;
  successRate: number;
  avgLatencyMs: number | null;
};

type UsageLogStatus =
  | "success"
  | "failed"
  | "timeout"
  | "rate_limited"
  | "invalid_params"
  | "invalid_api_key"
  | "cancelled"
  | "running"
  | string
  | null;

type UsageLog = {
  id: string;
  recordType: string;
  recordId: string;
  providerId: string;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCost: number | null;
  currency: string;
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
  taskType: string | null;
  status: UsageLogStatus;
  latencyMs: number | null;
  errorMessage: string | null;
};

type UsageLogDetail = {
  log: UsageLog;
  parent: {
    recordKind?: "run" | "generation_task";
    taskType?: string;
    status?: string;
    errorType?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    progress?: number;
    providerStatus?: string | null;
    input?: unknown;
    params?: unknown;
    output?: unknown;
    idempotencyKey?: string | null;
  };
  requestLogs: Array<{
    id: string;
    providerId: string;
    modelId: string | null;
    statusCode: number | null;
    latencyMs: number | null;
    errorType: string | null;
    errorMessage: string | null;
    request: unknown;
    response: unknown;
    createdAt: string | null;
  }>;
};

// --- Constants -------------------------------------------------------------

type Preset = "today" | "7d" | "30d" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "custom", label: "Custom" },
];

const CHART_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#0ea5e9",
  "#a855f7",
  "#ec4899",
];

const STATUS_LABELS: Record<string, string> = {
  success: "Success",
  failed: "Failed",
  timeout: "Timeout",
  rate_limited: "Rate Limited",
  invalid_params: "Invalid Params",
  invalid_api_key: "Invalid API Key",
  cancelled: "Cancelled",
  running: "Running",
};

const STATUS_VARIANT: Record<string, "default" | "destructive" | "warning" | "info" | "secondary" | "outline"> = {
  success: "default",
  failed: "destructive",
  timeout: "warning",
  rate_limited: "warning",
  invalid_params: "info",
  invalid_api_key: "info",
  cancelled: "secondary",
  running: "outline",
};

// --- Date range helpers ----------------------------------------------------

type DateRange = { start: string; end: string };

function rangeFor(preset: Preset, custom: DateRange | null): DateRange {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  if (preset === "custom" && custom?.start && custom?.end) {
    const startDate = new Date(`${custom.start}T00:00:00`);
    const endDate = new Date(`${custom.end}T00:00:00`);
    const endNextDay = new Date(endDate);
    endNextDay.setDate(endNextDay.getDate() + 1);
    return { start: startDate.toISOString(), end: endNextDay.toISOString() };
  }
  const start = new Date(end);
  if (preset === "today") {
    start.setDate(start.getDate() - 1);
  } else if (preset === "7d") {
    start.setDate(start.getDate() - 7);
  } else if (preset === "30d") {
    start.setDate(start.getDate() - 30);
  } else {
    // custom with no values yet → default to 7d
    start.setDate(start.getDate() - 7);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function buildQuery(range: DateRange): string {
  const params = new URLSearchParams();
  params.set("startDate", range.start);
  params.set("endDate", range.end);
  return `?${params.toString()}`;
}

// --- Formatters ------------------------------------------------------------

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatCost(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value === 0) return "—";
  return `$${value.toFixed(2)}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString();
}

function formatDay(value: string): string {
  const d = new Date(value);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// --- Main page -------------------------------------------------------------

export function UsagePage() {
  const [preset, setPreset] = useState<Preset>("7d");
  const [custom, setCustom] = useState<DateRange | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);
  const qs = useMemo(() => buildQuery(range), [range]);

  const summaryQuery = useQuery({
    queryKey: ["usage-summary", range.start, range.end],
    queryFn: () => getData<UsageSummary>(`/usage/summary${qs}`),
  });
  const dailyQuery = useQuery({
    queryKey: ["usage-daily", range.start, range.end],
    queryFn: () => getData<DailyUsage[]>(`/usage/daily${qs}`),
  });
  const providersQuery = useQuery({
    queryKey: ["usage-providers", range.start, range.end],
    queryFn: () => getData<ProviderUsage[]>(`/usage/providers${qs}`),
  });
  const modelsQuery = useQuery({
    queryKey: ["usage-models", range.start, range.end],
    queryFn: () => getData<ModelUsage[]>(`/usage/models${qs}`),
  });
  const logsQuery = useQuery({
    queryKey: ["usage-logs", range.start, range.end],
    queryFn: () => getData<UsageLog[]>(`/usage/logs${qs}`),
  });

  const summary = summaryQuery.data;
  const daily = dailyQuery.data ?? [];
  const providers = providersQuery.data ?? [];
  const models = modelsQuery.data ?? [];
  const logs = logsQuery.data ?? [];

  const isLoading =
    summaryQuery.isLoading ||
    dailyQuery.isLoading ||
    providersQuery.isLoading ||
    modelsQuery.isLoading ||
    logsQuery.isLoading;

  const isError =
    summaryQuery.isError ||
    dailyQuery.isError ||
    providersQuery.isError ||
    modelsQuery.isError ||
    logsQuery.isError;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage"
        description="Track API usage, cost, tokens, and request history across all providers."
        action={
          <DateRangeFilter
            preset={preset}
            custom={custom}
            onPresetChange={setPreset}
            onCustomChange={setCustom}
          />
        }
      />

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load usage data. Try refreshing or changing the date range.
        </div>
      )}

      <SummaryCards summary={summary} isLoading={summaryQuery.isLoading} />

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Daily Usage Trend</h2>
          <span className="text-xs text-muted-foreground">
            {daily.length} {daily.length === 1 ? "day" : "days"}
          </span>
        </div>
        <div className="p-4">
          <DailyTrendChart data={daily} isLoading={dailyQuery.isLoading} />
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Provider × Model Usage</h2>
        </div>
        <div className="p-4">
          <UsageHeatmap data={models} isLoading={modelsQuery.isLoading} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Provider Distribution</h2>
          </div>
          <div className="p-4">
            <ProviderDistribution
              data={providers}
              isLoading={providersQuery.isLoading}
            />
          </div>
        </div>
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Model Usage Ranking</h2>
            <span className="text-xs text-muted-foreground">
              Top {models.length}
            </span>
          </div>
          <div className="p-4">
            <ModelRanking data={models} isLoading={modelsQuery.isLoading} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Recent Request Logs</h2>
          <span className="text-xs text-muted-foreground">
            {logs.length} {logs.length === 1 ? "request" : "requests"}
          </span>
        </div>
        <RecentLogsTable
          data={logs}
          isLoading={logsQuery.isLoading}
          onSelect={setSelectedLogId}
        />
      </div>

      {selectedLogId && (
        <RequestDetailDrawer
          logId={selectedLogId}
          onClose={() => setSelectedLogId(null)}
        />
      )}

      {isLoading && !summary && !daily.length && !providers.length && !models.length && !logs.length ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : null}
    </div>
  );
}

// --- Date range filter -----------------------------------------------------

function DateRangeFilter({
  preset,
  custom,
  onPresetChange,
  onCustomChange,
}: {
  preset: Preset;
  custom: DateRange | null;
  onPresetChange: (preset: Preset) => void;
  onCustomChange: (range: DateRange | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Date range"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        value={preset}
        onChange={(event) => onPresetChange(event.target.value as Preset)}
      >
        {PRESETS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {preset === "custom" && (
        <>
          <input
            type="date"
            aria-label="Start date"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={custom?.start.slice(0, 10) ?? ""}
            onChange={(event) =>
              onCustomChange({
                start: event.target.value ? `${event.target.value}T00:00:00` : "",
                end: custom?.end ?? "",
              })
            }
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            aria-label="End date"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={custom?.end.slice(0, 10) ?? ""}
            onChange={(event) =>
              onCustomChange({
                start: custom?.start ?? "",
                end: event.target.value ? `${event.target.value}T00:00:00` : "",
              })
            }
          />
        </>
      )}
    </div>
  );
}

// --- Summary cards ---------------------------------------------------------

function SummaryCards({
  summary,
  isLoading,
}: {
  summary: UsageSummary | undefined;
  isLoading: boolean;
}) {
  const totalRequests = summary?.totalRequests;
  const totalTokens = summary?.totalTokens;
  const cost = summary?.estimatedCost;
  const successRate = summary?.successRate;
  const failed = summary?.failedRequests;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <MetricCard
        icon={<Hash className="h-4 w-4" />}
        label="Total Requests"
        value={isLoading ? "—" : formatNumber(totalRequests ?? 0)}
        sub={!isLoading && totalRequests ? `${totalRequests} in range` : ""}
      />
      <MetricCard
        icon={<Layers className="h-4 w-4" />}
        label="Total Tokens"
        value={isLoading ? "—" : formatNumber(totalTokens ?? 0)}
        sub={
          !isLoading && summary
            ? `${formatNumber(summary.inputTokens)} in / ${formatNumber(summary.outputTokens)} out`
            : ""
        }
      />
      <MetricCard
        icon={<DollarSign className="h-4 w-4" />}
        label="Total Cost"
        value={isLoading ? "—" : formatCost(cost ?? 0)}
        sub={
          !isLoading && (cost ?? 0) === 0
            ? "Cost estimation pending"
            : !isLoading
              ? "USD"
              : ""
        }
        muted={!isLoading && (cost ?? 0) === 0}
      />
      <MetricCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        label="Success Rate"
        value={isLoading ? "—" : formatPercent(successRate ?? 0)}
        sub={
          !isLoading && summary && totalRequests
            ? `${totalRequests - (failed ?? 0)} / ${totalRequests}`
            : ""
        }
      />
      <MetricCard
        icon={<AlertOctagon className="h-4 w-4" />}
        label="Failed Requests"
        value={isLoading ? "—" : formatNumber(failed ?? 0)}
        sub={!isLoading && totalRequests && failed ? `${((failed / totalRequests) * 100).toFixed(1)}% of total` : ""}
      />
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-semibold ${muted ? "text-muted-foreground" : ""}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// --- Daily trend chart -----------------------------------------------------

type TrendMetric = "requests" | "tokens" | "cost";

function DailyTrendChart({
  data,
  isLoading,
}: {
  data: DailyUsage[];
  isLoading: boolean;
}) {
  const [metric, setMetric] = useState<TrendMetric>("requests");

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-muted/40" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No daily data in this range
      </div>
    );
  }

  const formatted = data.map((point) => ({
    date: point.date,
    requests: point.requests,
    tokens: point.tokens,
    cost: point.cost,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(["requests", "tokens", "cost"] as TrendMetric[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMetric(option)}
            className={`h-7 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              metric === option
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {option[0].toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={formatted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis
              tickFormatter={(value: number) => formatNumber(Number(value))}
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
              width={48}
            />
            <Tooltip
              formatter={(value: number) =>
                metric === "cost" ? `$${value.toFixed(2)}` : formatNumber(value)
              }
              labelFormatter={(label: string) => `Date ${label}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {metric === "requests" && (
              <Bar dataKey="requests" name="Requests" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            )}
            {metric === "tokens" && (
              <Line
                type="monotone"
                dataKey="tokens"
                name="Tokens"
                stroke={CHART_COLORS[1]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            )}
            {metric === "cost" && (
              <Line
                type="monotone"
                dataKey="cost"
                name="Cost"
                stroke={CHART_COLORS[2]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// --- Provider distribution -------------------------------------------------

function ProviderDistribution({
  data,
  isLoading,
}: {
  data: ProviderUsage[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-muted/40" />;
  }
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No provider usage in this range
      </div>
    );
  }

  const top = data.slice(0, 6);
  const rest = data.slice(6);
  const chartData =
    rest.length > 0
      ? [
          ...top,
          {
            provider: "Others",
            providerId: "__others__",
            requests: rest.reduce((sum, item) => sum + item.requests, 0),
            tokens: rest.reduce((sum, item) => sum + item.tokens, 0),
            cost: rest.reduce((sum, item) => sum + item.cost, 0),
            percentage: rest.reduce((sum, item) => sum + item.percentage, 0),
          },
        ]
      : top;

  return (
    <div className="space-y-4">
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              formatter={(value: number, _name, item) => [
                `${formatNumber(value)} (${(item?.payload?.percentage ?? 0).toFixed(1)}%)`,
                "Requests",
              ]}
            />
            <Pie
              data={chartData}
              dataKey="requests"
              nameKey="provider"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={2}
            >
              {chartData.map((entry, index) => (
                <Cell key={entry.providerId} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1.5">
        {chartData.map((entry, index) => (
          <div key={entry.providerId} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="flex-1 truncate">{entry.provider}</span>
            <span className="text-muted-foreground">{formatNumber(entry.requests)}</span>
            <span className="w-12 text-right font-medium">{entry.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Provider × Model heatmap ------------------------------------------------

function UsageHeatmap({ data, isLoading }: { data: ModelUsage[]; isLoading: boolean }) {
  if (isLoading) {
    return <div className="h-32 animate-pulse rounded bg-muted/30" />;
  }
  if (data.length === 0) {
    return <div className="py-6 text-center text-xs text-muted-foreground">No usage data for this period.</div>;
  }

  // Build provider → models map
  const providerMap = new Map<string, Map<string, number>>();
  for (const entry of data) {
    const providerKey = entry.provider || entry.providerId || "Unknown";
    if (!providerMap.has(providerKey)) providerMap.set(providerKey, new Map());
    providerMap.get(providerKey)!.set(entry.model || entry.modelId, entry.requests);
  }

  const providerNames = Array.from(providerMap.keys());
  const modelSet = new Set<string>();
  for (const models of providerMap.values()) {
    for (const model of models.keys()) modelSet.add(model);
  }
  const modelNames = Array.from(modelSet);

  // Find max for color scaling
  let maxRequests = 0;
  for (const models of providerMap.values()) {
    for (const count of models.values()) {
      if (count > maxRequests) maxRequests = count;
    }
  }

  const getIntensity = (count: number) => {
    if (maxRequests === 0 || count === 0) return 0;
    return Math.max(0.1, Math.min(1, count / maxRequests));
  };

  return (
    <div className="overflow-x-auto">
      <div
        className="grid text-xs"
        style={{
          gridTemplateColumns: `minmax(100px, auto) repeat(${modelNames.length}, minmax(48px, 1fr))`,
        }}
      >
        {/* Header row */}
        <div className="px-2 py-1.5 text-muted-foreground" />
        {modelNames.map((model) => (
          <div
            key={model}
            className="truncate px-1 py-1.5 text-center font-mono text-[10px] text-muted-foreground"
            title={model}
          >
            {model.length > 12 ? `${model.slice(0, 12)}…` : model}
          </div>
        ))}

        {/* Data rows */}
        {providerNames.map((provider) => (
          <div key={provider} className="contents">
            <div className="truncate px-2 py-1.5 font-medium text-foreground" title={provider}>
              {provider}
            </div>
            {modelNames.map((model) => {
              const count = providerMap.get(provider)?.get(model) ?? 0;
              const intensity = getIntensity(count);
              return (
                <div
                  key={model}
                  className="flex items-center justify-center rounded-sm px-1 py-1.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: `hsl(var(--primary) / ${intensity * 0.6})`,
                    color: intensity > 0.4 ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
                  }}
                  title={`${provider} × ${model}: ${count} requests`}
                >
                  {count > 0 ? count : ""}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Model ranking ---------------------------------------------------------

type SortKey = "model" | "provider" | "requests" | "tokens" | "cost" | "successRate" | "avgLatencyMs";
type SortDir = "asc" | "desc";

function ModelRanking({
  data,
  isLoading,
}: {
  data: ModelUsage[];
  isLoading: boolean;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "requests",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    const numericKeys: SortKey[] = [
      "requests",
      "tokens",
      "cost",
      "successRate",
      "avgLatencyMs",
    ];
    const isNumeric = numericKeys.includes(sort.key);
    const rows = [...data];
    rows.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (isNumeric) {
        return sort.dir === "desc" ? Number(bv) - Number(av) : Number(av) - Number(bv);
      }
      return sort.dir === "desc"
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });
    return rows;
  }, [data, sort]);

  const onHeaderClick = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  };

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-muted/40" />;
  }
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No model usage in this range
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <SortableTh label="Model" active={sort.key === "model"} dir={sort.dir} onClick={() => onHeaderClick("model")} />
            <SortableTh label="Provider" active={sort.key === "provider"} dir={sort.dir} onClick={() => onHeaderClick("provider")} />
            <SortableTh label="Requests" active={sort.key === "requests"} dir={sort.dir} onClick={() => onHeaderClick("requests")} align="right" />
            <SortableTh label="Tokens" active={sort.key === "tokens"} dir={sort.dir} onClick={() => onHeaderClick("tokens")} align="right" />
            <SortableTh label="Cost" active={sort.key === "cost"} dir={sort.dir} onClick={() => onHeaderClick("cost")} align="right" />
            <SortableTh label="Success Rate" active={sort.key === "successRate"} dir={sort.dir} onClick={() => onHeaderClick("successRate")} align="right" />
            <SortableTh label="Avg Latency" active={sort.key === "avgLatencyMs"} dir={sort.dir} onClick={() => onHeaderClick("avgLatencyMs")} align="right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((row) => (
            <tr key={row.modelId} className="hover:bg-muted/30">
              <td className="px-2 py-2 font-mono text-xs">{row.model}</td>
              <td className="px-2 py-2 text-xs text-muted-foreground">{row.provider}</td>
              <td className="px-2 py-2 text-right text-xs font-medium">{formatNumber(row.requests)}</td>
              <td className="px-2 py-2 text-right text-xs">{formatNumber(row.tokens)}</td>
              <td className="px-2 py-2 text-right text-xs">{row.cost > 0 ? `$${row.cost.toFixed(2)}` : "—"}</td>
              <td className="px-2 py-2 text-right text-xs">{formatPercent(row.successRate)}</td>
              <td className="px-2 py-2 text-right text-xs">{formatLatency(row.avgLatencyMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`cursor-pointer select-none px-2 py-2 font-medium hover:text-foreground ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={onClick}
    >
      {label}
      {active && <span className="ml-1 text-[10px]">{dir === "desc" ? "▼" : "▲"}</span>}
    </th>
  );
}

// --- Recent logs table -----------------------------------------------------

function RecentLogsTable({
  data,
  isLoading,
  onSelect,
}: {
  data: UsageLog[];
  isLoading: boolean;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-muted/40 m-4" />;
  }
  if (data.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No requests in this range
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Time</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Task</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Model</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Provider</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Tokens</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Cost</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Latency</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((log) => (
            <tr
              key={log.id}
              className="cursor-pointer hover:bg-muted/30"
              onClick={() => onSelect(log.id)}
            >
              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                {formatDateTime(log.createdAt)}
              </td>
              <td className="px-3 py-2 text-xs">{log.taskType ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs">{log.modelId ?? "—"}</td>
              <td className="px-3 py-2 text-xs">
                <Badge variant="outline" className="text-[10px]">{log.providerId}</Badge>
              </td>
              <td className="px-3 py-2 text-xs">
                {log.status ? (
                  <Badge variant={STATUS_VARIANT[log.status] ?? "outline"} className="text-[10px]">
                    {STATUS_LABELS[log.status] ?? log.status}
                  </Badge>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-right text-xs">{formatNumber(log.totalTokens)}</td>
              <td className="px-3 py-2 text-right text-xs">
                {log.estimatedCost != null && log.estimatedCost > 0 ? `$${log.estimatedCost.toFixed(4)}` : "—"}
              </td>
              <td className="px-3 py-2 text-right text-xs">{formatLatency(log.latencyMs)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                <ChevronRight className="h-4 w-4" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Request detail drawer -------------------------------------------------

function RequestDetailDrawer({
  logId,
  onClose,
}: {
  logId: string;
  onClose: () => void;
}) {
  const detailQuery = useQuery({
    queryKey: ["usage-log", logId],
    queryFn: () => getData<UsageLogDetail>(`/usage/logs/${logId}`),
    enabled: !!logId,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const detail = detailQuery.data;
  const log = detail?.log;
  const parent = detail?.parent;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-xl flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">Request Detail</h2>
            <p className="font-mono text-[11px] text-muted-foreground">{logId}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {detailQuery.isLoading && (
            <div className="h-32 animate-pulse rounded bg-muted/40" />
          )}
          {detailQuery.isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Failed to load request detail.
            </div>
          )}
          {detail && log && (
            <div className="space-y-4 text-sm">
              <DetailSection title="Summary">
                <DetailRow label="Task Type" value={log.taskType ?? parent?.taskType ?? "—"} />
                <DetailRow label="Provider" value={log.providerId} />
                <DetailRow label="Model" value={log.modelId ?? "—"} />
                <DetailRow
                  label="Status"
                  value={
                    log.status ? (
                      <Badge variant={STATUS_VARIANT[log.status] ?? "outline"}>
                        {STATUS_LABELS[log.status] ?? log.status}
                      </Badge>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailRow
                  label="Created"
                  value={formatDateTime(log.createdAt)}
                />
              </DetailSection>

              <DetailSection title="Token Usage">
                <DetailRow label="Input" value={formatNumber(log.inputTokens)} />
                <DetailRow label="Output" value={formatNumber(log.outputTokens)} />
                <DetailRow label="Total" value={formatNumber(log.totalTokens)} />
                <DetailRow
                  label="Cost"
                  value={
                    log.estimatedCost != null && log.estimatedCost > 0
                      ? `$${log.estimatedCost.toFixed(4)} ${log.currency}`
                      : "—"
                  }
                />
                <DetailRow label="Latency" value={formatLatency(log.latencyMs)} />
              </DetailSection>

              {parent && (parent.errorMessage || parent.errorType) && (
                <DetailSection title="Error">
                  <DetailRow label="Type" value={parent.errorType ?? "—"} />
                  <DetailRow label="Message" value={parent.errorMessage ?? "—"} />
                </DetailSection>
              )}

              {parent?.params != null && (
                <DetailSection title="Model Parameters">
                  <JsonBlock value={parent.params} />
                </DetailSection>
              )}

              {detail.requestLogs.length > 0 && (
                <DetailSection title="Provider Requests">
                  <div className="space-y-3">
                    {detail.requestLogs.map((requestLog) => (
                      <div key={requestLog.id} className="rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-muted-foreground">{requestLog.id}</span>
                          <span className="text-muted-foreground">
                            {formatDateTime(requestLog.createdAt)}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <DetailRow label="Status" value={requestLog.statusCode ?? "—"} />
                          <DetailRow label="Latency" value={formatLatency(requestLog.latencyMs)} />
                          {requestLog.errorType && (
                            <DetailRow label="Error" value={requestLog.errorType} />
                          )}
                        </div>
                        {requestLog.errorMessage && (
                          <p className="mt-2 text-xs text-destructive">{requestLog.errorMessage}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </DetailSection>
              )}

              {parent?.output != null && (
                <DetailSection title="Output">
                  <JsonBlock value={parent.output} />
                </DetailSection>
              )}

              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <DetailSection title="Metadata">
                  <JsonBlock value={log.metadata} />
                </DetailSection>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-border/60 py-1 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed">
      {text}
    </pre>
  );
}
