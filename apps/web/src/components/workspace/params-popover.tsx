"use client";

import { useState } from "react";
import { RefreshCw, SlidersHorizontal, X, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModelInfo, ParamSchema, Provider } from "@/types/model";
import { ParamsGroup } from "./params-group";
import {
  BUILTIN_PRESETS,
  applyPreset,
  isPresetApplicable,
  type PresetId,
} from "@/lib/param-presets";

export function ParamsPopover({
  schema,
  params,
  provider,
  model,
  taskId,
  onChange,
  onApplyMany,
  onReset,
}: {
  schema?: ParamSchema;
  params: Record<string, string | number | boolean>;
  provider?: Provider;
  model?: ModelInfo;
  taskId: string;
  onChange: (key: string, value: string | number | boolean) => void;
  onApplyMany: (next: Record<string, string | number | boolean>) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [presetMessage, setPresetMessage] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<PresetId>("default");
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);

  const applicablePresets = BUILTIN_PRESETS.filter((p) => isPresetApplicable(p, taskId));

  const handlePreset = (id: PresetId) => {
    setPresetMenuOpen(false);
    if (id === "default") {
      onReset();
      setActivePreset("default");
      setPresetMessage("Reset to model defaults.");
      return;
    }
    if (!schema) return;
    const confirmed = window.confirm(
      `Discard current params and apply "${BUILTIN_PRESETS.find((p) => p.id === id)?.label}" preset?`,
    );
    if (!confirmed) return;
    const outcome = applyPreset(id, schema, params);
    onApplyMany(outcome.applied);
    setActivePreset(id);
    const skipped = outcome.skippedFields.length;
    setPresetMessage(
      `Applied "${BUILTIN_PRESETS.find((p) => p.id === id)?.label}" preset · ${outcome.setFields.length} fields set` +
        (skipped > 0 ? `, ${skipped} skipped` : ""),
    );
  };

  const presetLabel =
    activePreset === "default" ? "Default" : BUILTIN_PRESETS.find((p) => p.id === activePreset)?.label ?? "Default";

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
          className="w-[380px] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Parameters</h3>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Preset row */}
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between text-xs">
              <div className="text-muted-foreground">Preset</div>
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setPresetMenuOpen((v) => !v)}
                  disabled={!schema}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {presetLabel}
                </Button>
                {presetMenuOpen ? (
                  <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border bg-popover p-1 shadow-lg">
                    <button
                      type="button"
                      className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                      onClick={() => handlePreset("default")}
                    >
                      <div className="font-medium">Default</div>
                      <div className="text-[10px] text-muted-foreground">Model schema defaults</div>
                    </button>
                    {applicablePresets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                        onClick={() => handlePreset(p.id)}
                      >
                        <div className="font-medium">{p.label}</div>
                        <div className="text-[10px] text-muted-foreground">{p.description}</div>
                      </button>
                    ))}
                    <div className="my-1 border-t" />
                    <button
                      type="button"
                      disabled
                      title="Coming in a later version"
                      className="block w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground"
                    >
                      + Save current as preset
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {presetMessage ? (
              <div className="mt-2 rounded border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] text-foreground/80">
                {presetMessage}
              </div>
            ) : null}
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
