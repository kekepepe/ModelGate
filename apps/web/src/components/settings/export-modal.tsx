"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const SCOPES = [
  { id: "usageLogs", label: "Usage Logs" },
  { id: "runs", label: "Runs" },
  { id: "requestLogs", label: "Request Logs" },
] as const;

export function ExportModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [scope, setScope] = useState("usageLogs");
  const [format, setFormat] = useState<"json" | "zip">("json");
  const [mask, setMask] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope, format, mask: String(mask) });
      const resp = await fetch(`/api/usage/export?${params}`);
      if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);

      if (format === "json") {
        const data = await resp.json();
        const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
        downloadBlob(blob, `${scope}.json`);
      } else {
        const blob = await resp.blob();
        downloadBlob(blob, `${scope}.zip`);
      }
      onOpenChange(false);
    } catch {
      // Error handled silently — user can retry
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Data</DialogTitle>
          <DialogDescription>
            Download your workspace data. API keys are never included in exports.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Scope */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Scope</Label>
            <div className="flex gap-2">
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScope(s.id)}
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    scope === s.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Format</Label>
            <div className="flex gap-2">
              {(["json", "zip"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`rounded-md border px-3 py-1.5 text-xs uppercase transition-colors ${
                    format === f
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Mask */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Mask content</Label>
              <p className="text-xs text-muted-foreground">
                Replace prompts and outputs with &quot;[masked: N chars]&quot;
              </p>
            </div>
            <Switch checked={mask} onCheckedChange={setMask} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={loading}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {loading ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
