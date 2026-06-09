"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  language: string;
  value: string;
  className?: string;
};

export function CodeBlock({ language, value, className }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // best-effort
    }
  };

  return (
    <div className={cn("my-2 overflow-hidden rounded-md border bg-muted/40", className)}>
      <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{language || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-background/60"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-xs leading-relaxed">
        <code className={`language-${language}`}>{value}</code>
      </pre>
    </div>
  );
}
