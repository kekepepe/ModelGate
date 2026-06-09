"use client";

import { cn } from "@/lib/utils";

interface Props {
  round: number;
  maxRounds: number;
  className?: string;
}

export function RoundCounter({ round, maxRounds, className }: Props) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm",
        className,
      )}
      data-testid="round-counter"
    >
      <span className="font-semibold">Round {round}</span>
      <span className="text-muted-foreground">/ {maxRounds}</span>
    </div>
  );
}
