"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2, Zap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ApiError, deleteData, getData, postData, putData } from "@/lib/api";
import type { Provider } from "@/types/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";

type ProviderTestStatus =
  | "ok"
  | "missing_key"
  | "auth_failed"
  | "rate_limited"
  | "timeout"
  | "unreachable"
  | "forbidden"
  | "bad_request"
  | "server_error"
  | "request_error"
  | "no_chat_model"
  | "config_error"
  | "error";

interface ProviderTestResult {
  providerId: string;
  status: ProviderTestStatus;
  errorType?: string;
  message?: string;
  modelId?: string;
  testedAt?: number;
}

const STORAGE_KEY = "modelgate:provider-test-results";

function loadCachedTests(): Record<string, ProviderTestResult> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ProviderTestResult>;
  } catch {
    return {};
  }
}

function saveCachedTests(value: Record<string, ProviderTestResult>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

const STATUS_TO_TONE: Record<ProviderTestStatus, StatusTone> = {
  ok: "ready",
  missing_key: "warn",
  no_chat_model: "warn",
  config_error: "warn",
  auth_failed: "failed",
  rate_limited: "warn",
  timeout: "failed",
  unreachable: "failed",
  forbidden: "failed",
  bad_request: "failed",
  server_error: "failed",
  request_error: "failed",
  error: "failed",
};

const STATUS_LABEL: Record<ProviderTestStatus, string> = {
  ok: "Connected",
  missing_key: "No key",
  no_chat_model: "No chat model",
  config_error: "Config error",
  auth_failed: "Auth failed",
  rate_limited: "Rate limited",
  timeout: "Timeout",
  unreachable: "Unreachable",
  forbidden: "Forbidden",
  bad_request: "Bad request",
  server_error: "Server error",
  request_error: "Request error",
  error: "Error",
};

export function ApiKeysClient() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const highlightProvider = searchParams.get("provider");
  const highlightRef = useRef<HTMLFormElement | null>(null);

  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  useEffect(() => {
    setTestResults(loadCachedTests());
  }, []);

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => getData<Provider[]>("/providers"),
  });
  const providers = providersQuery.data ?? [];

  useEffect(() => {
    if (!highlightProvider || !providers.length) return;
    if (!highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightProvider, providers.length]);

  const saveKeyMutation = useMutation({
    mutationFn: ({ providerId, apiKey }: { providerId: string; apiKey: string }) =>
      putData<Provider>(`/providers/${providerId}/key`, { apiKey }),
    onSuccess: (provider) => {
      setDraftKeys((current) => ({ ...current, [provider.id]: "" }));
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  const clearKeyMutation = useMutation({
    mutationFn: (providerId: string) => deleteData<Provider>(`/providers/${providerId}/key`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }),
  });

  async function handleTest(providerId: string) {
    setTestingProvider(providerId);
    try {
      const result = await postData<ProviderTestResult>(`/providers/${providerId}/test`, {});
      const enriched: ProviderTestResult = { ...result, testedAt: Date.now() };
      setTestResults((current) => {
        const next = { ...current, [providerId]: enriched };
        saveCachedTests(next);
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test failed";
      const fallback: ProviderTestResult = {
        providerId,
        status: "error",
        errorType: error instanceof ApiError ? error.type : "NetworkError",
        message,
        testedAt: Date.now(),
      };
      setTestResults((current) => {
        const next = { ...current, [providerId]: fallback };
        saveCachedTests(next);
        return next;
      });
    } finally {
      setTestingProvider(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Manage provider API keys. Keys are AES-256-GCM encrypted at rest and never displayed in plaintext."
      />

      <div className="rounded-lg border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" />
          Provider API Keys
        </h2>
        <div className="mt-4 space-y-3">
          {providers.map((provider) => {
            const isHighlighted = provider.id === highlightProvider;
            const testResult = testResults[provider.id];
            const isTestingThis = testingProvider === provider.id;
            return (
              <form
                key={provider.id}
                ref={isHighlighted ? highlightRef : undefined}
                className={
                  "grid gap-3 rounded-lg border p-3 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(240px,340px)_auto] " +
                  (isHighlighted
                    ? "border-primary/60 bg-primary/5 [animation:pulse-highlight_2s_ease-out_forwards]"
                    : "border-border bg-muted/20")
                }
                onSubmit={(event) => {
                  event.preventDefault();
                  const apiKey = (draftKeys[provider.id] ?? "").trim();
                  if (apiKey) saveKeyMutation.mutate({ providerId: provider.id, apiKey });
                }}
              >
                <div className="min-w-0">
                  <div className="font-medium">{provider.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {provider.envKey ?? "No envKey"}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <StatusPill tone={provider.enabled ? "ready" : "muted"}>
                      {provider.enabled ? "Enabled" : "Disabled"}
                    </StatusPill>
                    <StatusPill tone={provider.configured ? "ready" : "warn"}>
                      {provider.configured
                        ? `Configured · ${provider.keySource === "local" ? "Local UI" : "Env Var"}`
                        : "Not configured"}
                    </StatusPill>
                    {testResult ? (
                      <StatusPill tone={STATUS_TO_TONE[testResult.status]}>
                        {STATUS_LABEL[testResult.status]}
                      </StatusPill>
                    ) : null}
                  </div>
                  {testResult?.message ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {testResult.message}
                      {testResult.testedAt ? (
                        <span className="ml-2 text-[10px] text-muted-foreground/70">
                          {new Date(testResult.testedAt).toLocaleTimeString()}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <Input
                  type="password"
                  value={draftKeys[provider.id] ?? ""}
                  onChange={(event) =>
                    setDraftKeys((current) => ({
                      ...current,
                      [provider.id]: event.target.value,
                    }))
                  }
                  placeholder="Enter new API Key"
                  autoComplete="off"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!draftKeys[provider.id]?.trim() || saveKeyMutation.isPending}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isTestingThis || !provider.configured}
                    onClick={() => handleTest(provider.id)}
                    title={
                      provider.configured
                        ? "Probe provider with a 1-token chat request"
                        : "Configure an API key before testing"
                    }
                  >
                    <Zap className="mr-1 h-3.5 w-3.5" />
                    {isTestingThis ? "Testing..." : "Test"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={clearKeyMutation.isPending || provider.keySource !== "local"}
                    onClick={() => clearKeyMutation.mutate(provider.id)}
                    title="Clear local API key"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            );
          })}
          {providers.length === 0 ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              No providers registered.
            </div>
          ) : null}
        </div>
        {saveKeyMutation.error ? <ErrorText error={saveKeyMutation.error} /> : null}
        {clearKeyMutation.error ? <ErrorText error={clearKeyMutation.error} /> : null}
      </div>
    </div>
  );
}

function ErrorText({ error }: { error: Error }) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error.message}
      {requestId ? (
        <span className="ml-2 text-xs text-destructive/70">requestId: {requestId}</span>
      ) : null}
    </div>
  );
}
