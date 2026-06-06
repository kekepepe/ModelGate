"use client";

import { useState } from "react";
import { RefreshCw, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModelInfo, ParamSchema, Provider } from "@/types/model";
import { ParamsGroup } from "./params-group";

export function ParamsPopover({
  schema,
  params,
  provider,
  model,
  onChange,
  onReset,
}: {
  schema?: ParamSchema;
  params: Record<string, string | number | boolean>;
  provider?: Provider;
  model?: ModelInfo;
  onChange: (key: string, value: string | number | boolean) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={300}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Parameters</TooltipContent>
        </Tooltip>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={8}
          className="w-[360px] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Parameters</h3>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Body */}
          <div className="max-h-[280px] overflow-y-auto p-4">
            <ParamsGroup schema={schema} params={params} onChange={onChange} />

            {/* Schema source info */}
            {schema ? (
              <div className="mt-5 border-t pt-4">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Schema Source</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Provider</div>
                    <div className="mt-0.5 font-medium">{provider?.name ?? "-"}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Model</div>
                    <div className="mt-0.5 font-medium">{model?.displayName ?? "-"}</div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-muted-foreground">Version</div>
                    <div className="mt-0.5 font-medium">v{schema.version}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <Button variant="ghost" size="sm" onClick={onReset} disabled={!schema}>
              <RefreshCw className="mr-1 h-3 w-3" />
              Reset to Defaults
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
