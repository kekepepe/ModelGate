"use client";

import { useState } from "react";
import { Check, X, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArtifactView } from "@/lib/api";

interface PatchActionsProps {
  artifact: ArtifactView;
  onApply: (confirmHighRisk: boolean) => void;
  onReject: () => void;
  onRegenerate: () => void;
  disabled?: boolean;
}

export function PatchActions({
  artifact,
  onApply,
  onReject,
  onRegenerate,
  disabled = false,
}: PatchActionsProps) {
  const [highRiskConfirmed, setHighRiskConfirmed] = useState(false);

  const metadata = artifact.metadata as Record<string, unknown> | null | undefined;
  const validation = metadata?.validation as Record<string, unknown> | undefined;
  const highRiskFiles = (validation?.highRiskFiles as Array<{ file: string; reason: string }>) || [];
  const isRejected = metadata?.rejected === true;
  const isApplied = metadata?.applied === true;
  const hasHighRisk = highRiskFiles.length > 0;

  if (isRejected || isApplied) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isApplied && (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <Check className="h-3.5 w-3.5" /> Applied
          </span>
        )}
        {isRejected && (
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <X className="h-3.5 w-3.5" /> Rejected
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hasHighRisk && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-medium text-amber-700 dark:text-amber-300">
              High-risk files detected
            </p>
            <ul className="mt-1 list-disc list-inside text-amber-600 dark:text-amber-400">
              {highRiskFiles.map((hr) => (
                <li key={hr.file}>
                  {hr.file} <span className="text-muted-foreground">({hr.reason})</span>
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-1.5 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={highRiskConfirmed}
                onChange={(e) => setHighRiskConfirmed(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              <span>I confirm I want to apply changes to high-risk files</span>
            </label>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={() => onApply(hasHighRisk)}
          disabled={disabled || (hasHighRisk && !highRiskConfirmed)}
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          Apply
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={onReject}
          disabled={disabled}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Reject
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRegenerate}
          disabled={disabled}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Regenerate
        </Button>
      </div>
    </div>
  );
}
