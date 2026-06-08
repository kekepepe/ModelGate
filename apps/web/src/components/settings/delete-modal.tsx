"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function DeleteModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ deleted: Record<string, number> } | null>(null);

  const confirmed = confirmText === "DELETE";

  const handleDelete = async () => {
    if (!confirmed) return;
    setLoading(true);
    try {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z");
      const resp = await fetch(`/api/usage/logs?olderThan=${cutoff}`, { method: "DELETE" });
      if (!resp.ok) throw new Error(`Delete failed: ${resp.status}`);
      const data = await resp.json();
      setResult(data.data);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setConfirmText("");
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Local Data</DialogTitle>
          <DialogDescription>
            Permanently delete runs, request logs, and usage logs older than a specified number of days.
            API keys are preserved.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-4">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              Deleted {result.deleted.usageLogs} usage logs, {result.deleted.runs} runs, and{" "}
              {result.deleted.requestLogs} request logs.
            </div>
            <p className="text-xs text-muted-foreground">API keys are preserved.</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Days */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Delete data older than</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={days}
                  onChange={(e) => setDays(Math.max(1, Number(e.target.value)))}
                  min={1}
                  className="h-8 w-20"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>

            {/* Confirmation */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Type <span className="font-mono text-destructive">DELETE</span> to confirm
              </Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="h-8"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!confirmed || loading}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {loading ? "Deleting..." : "Delete Data"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
