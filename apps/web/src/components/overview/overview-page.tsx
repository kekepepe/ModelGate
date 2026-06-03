"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Code2,
  FileText,
  MessageSquare,
  Sparkles,
  Video,
  WandSparkles,
  Play,
} from "lucide-react";
import Link from "next/link";

import { getData } from "@/lib/api";
import type { ModelInfo, Provider, RunRecord } from "@/types/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

export function OverviewPage() {
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: () => getData<Provider[]>("/providers") });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: () => getData<ModelInfo[]>("/models") });
  const historyQuery = useQuery({ queryKey: ["history-runs"], queryFn: () => getData<RunRecord[]>("/history/runs") });

  const providers = providersQuery.data ?? [];
  const models = modelsQuery.data ?? [];
  const runs = historyQuery.data ?? [];

  const configuredProviders = providers.filter((p) => p.configured).length;
  const enabledModels = models.filter((m) => m.enabled).length;
  const recentRuns = runs.slice(0, 5);
  const completedRuns = runs.filter((r) => r.status === "completed").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;

  const capabilityCards = [
    { icon: MessageSquare, title: "Chat", desc: "Multi-turn conversation with AI models", href: "/workspace?taskType=chat" },
    { icon: Code2, title: "Coding", desc: "Code generation, review and debugging", href: "/workspace?taskType=coding" },
    { icon: FileText, title: "Document Analysis", desc: "Extract insights from documents and files", href: "/workspace?taskType=document_analysis" },
    { icon: Sparkles, title: "Prompt Optimize", desc: "Improve and refine your prompts", href: "/workspace?taskType=prompt_optimize" },
    { icon: WandSparkles, title: "Generation", desc: "Text-to-image and text-to-video generation", href: "/workspace?taskType=text_to_image" },
    { icon: Video, title: "Video Understanding", desc: "Analyze and understand video content", href: "/workspace?taskType=video_understanding" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Your local multi-model AI API workspace"
        action={
          <Link href="/workspace?taskType=chat">
            <Button>
              <Play className="mr-1.5 h-4 w-4" />
              Open Playground
            </Button>
          </Link>
        }
      />

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Providers" value={String(providers.length)} sub={`${configuredProviders} configured`} />
        <StatCard label="Models" value={String(enabledModels)} sub={`${models.length} total`} />
        <StatCard label="Total Runs" value={String(runs.length)} sub={`${completedRuns} completed`} />
        <StatCard label="Failures" value={String(failedRuns)} sub={runs.length > 0 ? `${((failedRuns / runs.length) * 100).toFixed(1)}% rate` : "0% rate"} />
      </div>

      {/* Capability cards */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Capabilities</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {capabilityCards.map((card) => {
            const Icon = card.icon;
            const disabled = card.title === "Generation" || card.title === "Video Understanding";
            return (
              <Link
                key={card.title}
                href={disabled ? "#" : card.href}
                className={`group rounded-lg border bg-card p-4 transition ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-primary/40 hover:shadow-sm"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{card.title}</div>
                    <div className="text-xs text-muted-foreground">{card.desc}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Provider status + Recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Provider status */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Provider Status</h2>
          </div>
          <div className="divide-y">
            {providers.length > 0 ? providers.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${provider.configured ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <div>
                    <div className="text-sm font-medium">{provider.name}</div>
                    <div className="text-xs text-muted-foreground">{provider.adapter}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={provider.enabled ? "success" : "secondary"}>
                    {provider.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Badge variant={provider.configured ? "info" : "warning"}>
                    {provider.configured ? (provider.keySource === "local" ? "Local" : "Env") : "No Key"}
                  </Badge>
                </div>
              </div>
            )) : (
              <div className="p-4 text-sm text-muted-foreground">No providers registered.</div>
            )}
          </div>
        </div>

        {/* Recent runs */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Recent Runs</h2>
          </div>
          <div className="divide-y">
            {recentRuns.length > 0 ? recentRuns.map((run) => (
              <div key={run.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-mono text-xs">{run.id}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{run.taskType} / {run.modelId}</div>
                </div>
                <Badge
                  variant={
                    run.status === "completed" ? "success" :
                    run.status === "running" ? "info" :
                    run.status === "failed" ? "destructive" : "secondary"
                  }
                >
                  {run.status}
                </Badge>
              </div>
            )) : (
              <div className="p-4 text-sm text-muted-foreground">No runs yet. Try the Playground!</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
