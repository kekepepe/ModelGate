"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, XCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  verdict: string;
  analysis: string;
  failedTests: Record<string, unknown>[];
  appliedFiles: string[];
  round?: number;
  pytestSummary?: Record<string, unknown>;
}

export function TestResultsView({
  verdict,
  analysis,
  failedTests,
  appliedFiles,
  round,
  pytestSummary,
}: Props) {
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

  const toggle = (nodeid: string) => {
    setExpandedTests((prev) => {
      const next = new Set(prev);
      if (next.has(nodeid)) next.delete(nodeid);
      else next.add(nodeid);
      return next;
    });
  };

  return (
    <div className="space-y-3 text-sm" data-testid="test-results-view">
      {round != null ? (
        <p className="text-xs font-semibold text-muted-foreground">Round {round}</p>
      ) : null}

      <div className="flex items-center gap-2">
        <span className="font-semibold">Verdict:</span>
        {verdict === "pass" ? (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle className="h-4 w-4" /> Pass
          </span>
        ) : (
          <span className="flex items-center gap-1 text-rose-600">
            <XCircle className="h-4 w-4" /> Fail
          </span>
        )}
      </div>

      {analysis ? (
        <div>
          <p className="font-semibold">Analysis</p>
          <p className="text-muted-foreground whitespace-pre-wrap">{analysis}</p>
        </div>
      ) : null}

      {pytestSummary ? (
        <div>
          <p className="font-semibold">Pytest summary</p>
          <p className="text-xs text-muted-foreground font-mono">
            {JSON.stringify(pytestSummary)}
          </p>
        </div>
      ) : null}

      {appliedFiles.length > 0 ? (
        <div>
          <p className="font-semibold">Applied files</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {appliedFiles.map((f) => (
              <li key={f} className="font-mono text-xs">{f}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {failedTests.length > 0 ? (
        <div>
          <p className="mb-1 font-semibold">Failed tests ({failedTests.length})</p>
          <ul className="space-y-1">
            {failedTests.map((ft) => {
              const nodeid = String(ft.nodeid ?? "");
              const message = ft.message ? String(ft.message) : "";
              const trace = ft.traceback_excerpt ? String(ft.traceback_excerpt) : "";
              const open = expandedTests.has(nodeid);
              return (
                <li key={nodeid} className="rounded border bg-background">
                  <button
                    onClick={() => toggle(nodeid)}
                    className="flex w-full items-center gap-2 p-2 text-left text-xs hover:bg-muted/30"
                  >
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate font-mono">{nodeid}</span>
                  </button>
                  {open ? (
                    <div className="border-t p-2 text-xs">
                      {message ? (
                        <p className="mb-1 whitespace-pre-wrap text-rose-600">{message}</p>
                      ) : null}
                      {trace ? (
                        <pre className="max-h-40 overflow-auto rounded bg-muted/30 p-2 text-[11px]">
                          {trace}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
