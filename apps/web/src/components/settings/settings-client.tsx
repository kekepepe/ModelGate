"use client";

import Link from "next/link";
import { KeyRound, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

export function SettingsClient() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="ModelGate workspace preferences."
      />

      <div className="rounded-lg border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" />
          Provider API Keys
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Provider API key management has moved to its own page.
        </p>
        <Button asChild size="sm" className="mt-4">
          <Link href="/api-keys" className="flex items-center gap-2">
            Open API Keys
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

