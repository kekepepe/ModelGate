import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Unified status pill — ModelGate V2 status vocabulary.
 *
 * Tones map to a small color palette:
 *   ready    — provider/runtime ok, key configured (sage/emerald)
 *   running  — in-flight (blue)
 *   queued   — pending start (slate/muted)
 *   warn     — no key / limited / degraded (amber)
 *   failed   — error / unreachable (rose)
 *   muted    — disabled / unknown (neutral)
 *
 * Children carry the label so callers control wording per
 * `docs/05-前端设计/前端V2界面与功能优化方案.md` §14.
 */
export type StatusTone = "ready" | "running" | "queued" | "warn" | "failed" | "muted";

const toneClasses: Record<StatusTone, string> = {
  ready: "border-emerald-300/60 bg-emerald-50 text-emerald-800",
  running: "border-sky-300/60 bg-sky-50 text-sky-800",
  queued: "border-slate-300/60 bg-slate-50 text-slate-700",
  warn: "border-amber-300/60 bg-amber-50 text-amber-800",
  failed: "border-rose-300/60 bg-rose-50 text-rose-800",
  muted: "border-muted bg-muted/40 text-muted-foreground",
};

const dotClasses: Record<StatusTone, string> = {
  ready: "bg-emerald-500",
  running: "bg-sky-500 animate-pulse",
  queued: "bg-slate-400",
  warn: "bg-amber-500",
  failed: "bg-rose-500",
  muted: "bg-muted-foreground/40",
};

export function StatusPill({
  tone,
  className,
  withDot = true,
  children,
}: {
  tone: StatusTone;
  className?: string;
  withDot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {withDot ? <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[tone])} /> : null}
      {children}
    </span>
  );
}
