/**
 * ErrorBanner — unified error display component for ModelGate V2.
 *
 * Reads from the error dictionary (`@/lib/errors/dictionary`) to display
 * user-friendly error messages and recommended actions.
 *
 * Designed from `docs/05-前端设计/前端V2界面与功能优化方案.md` §19.
 */

"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { lookupError, resolveActionHref } from "@/lib/errors/dictionary";

type Props = {
  /** Backend error type string (AppError.error_type). */
  errorType: string;
  /** Optional provider id for deep-linking to API Keys page. */
  providerId?: string;
  /** Optional run id for deep-linking to Activity page. */
  runId?: string;
  /** Optional request id for display. */
  requestId?: string;
  /** Optional task id for generation tasks. */
  taskId?: string;
  /** Optional raw error message for additional context. */
  rawMessage?: string;
  /** Optional retry callback. */
  onRetry?: () => void;
  /** Extra CSS classes. */
  className?: string;
};

export function ErrorBanner({
  errorType,
  providerId,
  runId,
  requestId,
  taskId,
  rawMessage,
  onRetry,
  className,
}: Props) {
  const entry = lookupError(errorType);
  const vars = { providerId, runId };

  return (
    <div
      className={`space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm ${className ?? ""}`}
    >
      {/* Header: icon + status pill + message */}
      <div className="flex items-start gap-2 text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <StatusPill tone={entry.tone} className="text-[10px]">
              {entry.tone === "warn" ? "Warning" : entry.tone === "muted" ? "Info" : "Error"}
            </StatusPill>
          </div>
          <div className="font-medium">{entry.message}</div>
          {rawMessage && rawMessage !== entry.message ? (
            <div className="text-xs text-destructive/70">{rawMessage}</div>
          ) : null}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {providerId ? (
          <span>
            Provider: <span className="font-medium text-foreground">{providerId}</span>
          </span>
        ) : null}
        {requestId ? (
          <span>
            requestId: <span className="font-mono text-foreground">{requestId}</span>
          </span>
        ) : null}
        {taskId ? (
          <span>
            taskId: <span className="font-mono text-foreground">{taskId}</span>
          </span>
        ) : null}
      </div>

      {/* Actions */}
      {entry.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {entry.actions.map((action, idx) => {
            if (action.kind === "link") {
              const href = resolveActionHref(action, vars);
              // If placeholder wasn't resolved (no var provided), skip the action
              if (href.includes("{")) return null;
              return (
                <Button key={idx} asChild variant="outline" size="sm">
                  <Link href={href}>{action.label}</Link>
                </Button>
              );
            }
            if (action.kind === "button" && action.onClick === "retry" && onRetry) {
              return (
                <Button key={idx} variant="outline" size="sm" onClick={onRetry}>
                  {action.label}
                </Button>
              );
            }
            return null;
          })}
        </div>
      ) : null}
    </div>
  );
}
