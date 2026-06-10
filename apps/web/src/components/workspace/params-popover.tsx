"use client";

import { useEffect, useMemo, useState } from "react";
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
  loadCustomPresets,
  saveCustomPreset,
  deleteCustomPreset,
  applyCustomPreset,
  type PresetId,
  type CustomPreset,
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
  const [activePreset, setActivePreset] = useState<PresetId | string>("default");
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());
  const [userModifiedAfterPreset, setUserModifiedAfterPreset] = useState(false);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [saveMode, setSaveMode] = useState(false);
  const [saveName, setSaveName] = useState("");

  const applicablePresets = BUILTIN_PRESETS.filter((p) => isPresetApplicable(p, taskId));

  // Cap max_completion_tokens at model's maxOutputTokens
  const effectiveSchema = useMemo(() => {
    if (!schema || !model?.maxOutputTokens) return schema;
    const cap = model.maxOutputTokens;
    let changed = false;
    const fields = schema.fields.map((f) => {
      if (f.key === "max_completion_tokens" && typeof f.max === "number" && f.max > cap) {
        changed = true;
        return { ...f, max: cap };
      }
      return f;
    });
    return changed ? { ...schema, fields } : schema;
  }, [schema, model?.maxOutputTokens]);

  // Load custom presets on mount
  useEffect(() => {
    setCustomPresets(loadCustomPresets());
  }, []);

  // Track user manual changes for "Custom · modified from X" label
  const handleFieldChange = (key: string, value: string | number | boolean) => {
    onChange(key, value);
    if (activePreset !== "default") {
      setUserModifiedAfterPreset(true);
      setModifiedFields((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handlePreset = (id: PresetId | string) => {
    setPresetMenuOpen(false);
    if (id === "default") {
      onReset();
      setActivePreset("default");
      setPresetMessage("Reset to model defaults.");
      setModifiedFields(new Set());
      setUserModifiedAfterPreset(false);
      return;
    }
    if (!schema) return;

    // Check if it's a custom preset
    const customPreset = customPresets.find((p) => p.id === id);
    if (customPreset) {
      const confirmed = window.confirm(
        `Discard current params and apply "${customPreset.name}" preset?`,
      );
      if (!confirmed) return;
      const outcome = applyCustomPreset(customPreset, schema, params);
      onApplyMany(outcome.applied);
      setActivePreset(id);
      setModifiedFields(new Set(outcome.setFields));
      setUserModifiedAfterPreset(false);
      const skipped = outcome.skippedFields.length;
      setPresetMessage(
        `Applied "${customPreset.name}" preset · ${outcome.setFields.length} fields set` +
          (skipped > 0 ? `, ${skipped} skipped` : ""),
      );
      return;
    }

    const confirmed = window.confirm(
      `Discard current params and apply "${BUILTIN_PRESETS.find((p) => p.id === id)?.label}" preset?`,
    );
    if (!confirmed) return;
    const outcome = applyPreset(id as PresetId, schema, params);
    onApplyMany(outcome.applied);
    setActivePreset(id);
    setModifiedFields(new Set(outcome.setFields));
    setUserModifiedAfterPreset(false);
    const skipped = outcome.skippedFields.length;
    setPresetMessage(
      `Applied "${BUILTIN_PRESETS.find((p) => p.id === id)?.label}" preset · ${outcome.setFields.length} fields set` +
        (skipped > 0 ? `, ${skipped} skipped` : ""),
    );
  };

  const handleSaveCustom = () => {
    const name = saveName.trim();
    if (!name) return;
    const created = saveCustomPreset(name, params);
    setCustomPresets((prev) => [...prev, created]);
    setActivePreset(created.id);
    setModifiedFields(new Set());
    setUserModifiedAfterPreset(false);
    setSaveMode(false);
    setSaveName("");
    setPresetMessage(`Saved "${name}" as custom preset.`);
  };

  const handleDeleteCustom = (id: string) => {
    deleteCustomPreset(id);
    setCustomPresets((prev) => prev.filter((p) => p.id !== id));
    if (activePreset === id) {
      setActivePreset("default");
      setModifiedFields(new Set());
      setUserModifiedAfterPreset(false);
    }
  };

  const activePresetLabel = (() => {
    if (activePreset === "default") return "Default";
    const builtin = BUILTIN_PRESETS.find((p) => p.id === activePreset);
    if (builtin) return builtin.label;
    const custom = customPresets.find((p) => p.id === activePreset);
    if (custom) return custom.name;
    return "Default";
  })();

  const presetLabel = userModifiedAfterPreset
    ? `Custom · modified from ${activePresetLabel}`
    : activePresetLabel;

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
                    {customPresets.length > 0 ? (
                      <>
                        <div className="my-1 border-t" />
                        {customPresets.map((cp) => (
                          <div
                            key={cp.id}
                            className="group flex items-center rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                          >
                            <button
                              type="button"
                              className="min-w-0 flex-1"
                              onClick={() => handlePreset(cp.id)}
                            >
                              <div className="font-medium truncate">{cp.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {Object.keys(cp.params).length} fields
                              </div>
                            </button>
                            <button
                              type="button"
                              className="ml-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCustom(cp.id);
                              }}
                              aria-label={`Delete ${cp.name} preset`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </>
                    ) : null}
                    <div className="my-1 border-t" />
                    {saveMode ? (
                      <div className="flex items-center gap-1 px-2 py-1.5">
                        <input
                          type="text"
                          value={saveName}
                          onChange={(e) => setSaveName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveCustom();
                            if (e.key === "Escape") {
                              setSaveMode(false);
                              setSaveName("");
                            }
                          }}
                          placeholder="Preset name"
                          className="h-6 flex-1 rounded border bg-background px-1.5 text-xs"
                          autoFocus
                        />
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={handleSaveCustom}
                          disabled={!saveName.trim()}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                        onClick={() => setSaveMode(true)}
                      >
                        + Save current as preset
                      </button>
                    )}
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
            <ParamsGroup
              schema={effectiveSchema}
              params={params}
              onChange={handleFieldChange}
              modifiedFields={modifiedFields}
            />

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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onReset();
                setActivePreset("default");
                setModifiedFields(new Set());
                setUserModifiedAfterPreset(false);
              }}
              disabled={!schema}
            >
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
