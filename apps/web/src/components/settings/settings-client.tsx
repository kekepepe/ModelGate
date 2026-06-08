"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, ArrowRight, Download, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

import { ExportModal } from "./export-modal";
import { DeleteModal } from "./delete-modal";

export function SettingsClient() {
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">Privacy & Data</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Export or delete your local workspace data. API keys are never exported and always preserved on delete.
        </p>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export Data
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete Local Data
          </Button>
        </div>
      </div>

      <ExportModal open={exportOpen} onOpenChange={setExportOpen} />
      <DeleteModal open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}

