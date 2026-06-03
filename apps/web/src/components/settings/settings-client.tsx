"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";

import { ApiError, deleteData, getData, putData } from "@/lib/api";
import type { Provider } from "@/types/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";

export function SettingsClient() {
  const queryClient = useQueryClient();
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const providersQuery = useQuery({ queryKey: ["providers"], queryFn: () => getData<Provider[]>("/providers") });
  const providers = providersQuery.data ?? [];
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="API keys are stored locally and never displayed in plaintext."
      />

      <div className="rounded-lg border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" />
          Provider API Keys
        </h2>
        <div className="mt-4 space-y-3">
          {providers.map((provider) => (
            <form
              key={provider.id}
              className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(240px,340px)_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                const apiKey = (draftKeys[provider.id] ?? "").trim();
                if (apiKey) saveKeyMutation.mutate({ providerId: provider.id, apiKey });
              }}
            >
              <div className="min-w-0">
                <div className="font-medium">{provider.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{provider.envKey ?? "No envKey"}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Badge variant={provider.enabled ? "success" : "secondary"}>
                    {provider.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Badge variant={provider.configured ? "info" : "warning"}>
                    {provider.configured ? `Configured: ${provider.keySource === "local" ? "Local UI" : "Env Var"}` : "Not Configured"}
                  </Badge>
                </div>
              </div>
              <Input
                type="password"
                value={draftKeys[provider.id] ?? ""}
                onChange={(event) => setDraftKeys((current) => ({ ...current, [provider.id]: event.target.value }))}
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
                  size="icon"
                  disabled={clearKeyMutation.isPending || provider.keySource !== "local"}
                  onClick={() => clearKeyMutation.mutate(provider.id)}
                  title="Clear local API key"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </form>
          ))}
          {providers.length === 0 ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">No providers registered.</div>
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
      {requestId ? <span className="ml-2 text-xs text-destructive/70">requestId: {requestId}</span> : null}
    </div>
  );
}
