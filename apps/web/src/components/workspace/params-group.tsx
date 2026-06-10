"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ParamField, ParamSchema } from "@/types/model";

const FIELD_GROUPS: Record<string, string> = {
  // Generation — sampling behavior
  temperature: "Generation",
  top_p: "Generation",
  top_k: "Generation",
  // Sampling — output limits
  max_tokens: "Sampling",
  max_output_tokens: "Sampling",
  max_completion_tokens: "Sampling",
  contextBudget: "Sampling",
  timeout: "Sampling",
  seed: "Sampling",
  // Output — format & rendering
  response_format: "Output",
  quality: "Output",
  size: "Output",
  aspect_ratio: "Output",
  // Provider — transport
  stream: "Provider",
  cache: "Provider",
};

const GROUP_ORDER = ["Generation", "Sampling", "Output", "Provider", "General"];

function groupFields(fields: ParamField[]): Map<string, ParamField[]> {
  const groups = new Map<string, ParamField[]>();
  for (const field of fields) {
    const group = FIELD_GROUPS[field.key] ?? "General";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(field);
  }
  return groups;
}

export function ParamsGroup({
  schema,
  params,
  onChange,
  modifiedFields,
}: {
  schema?: ParamSchema;
  params: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
  /** Fields that were changed by a preset — shown with a blue dot. */
  modifiedFields?: Set<string>;
}) {
  if (!schema || schema.fields.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Select a model to see parameters.
      </div>
    );
  }

  const groups = groupFields(schema.fields);

  return (
    <div className="space-y-5">
      {GROUP_ORDER.map((groupName) => {
        const fields = groups.get(groupName);
        if (!fields || fields.length === 0) return null;
        return (
          <div key={groupName}>
            <h4 className="mb-3 text-xs font-medium uppercase text-muted-foreground">
              {groupName}
            </h4>
            <div className="space-y-3">
              {fields.map((field) => (
                <ParamFieldRow
                  key={field.key}
                  field={field}
                  value={params[field.key] ?? field.default ?? ""}
                  onChange={onChange}
                  modified={modifiedFields?.has(field.key) ?? false}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ParamFieldRow({
  field,
  value,
  onChange,
  modified,
}: {
  field: ParamField;
  value: string | number | boolean;
  onChange: (key: string, value: string | number | boolean) => void;
  modified: boolean;
}) {
  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm text-foreground">
          {field.label}
          {modified ? <span className="ml-1 text-blue-500">●</span> : null}
        </Label>
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(field.key, checked)}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="grid gap-1.5">
        <Label className="text-sm text-foreground">
          {field.label}
          {modified ? <span className="ml-1 text-blue-500">●</span> : null}
        </Label>
        <Select value={String(value)} onValueChange={(v) => onChange(field.key, v)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => {
              const optionValue = typeof option === "string" ? option : option.value;
              const label = typeof option === "string" ? option : option.label;
              return (
                <SelectItem key={String(optionValue)} value={String(optionValue)}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const isNumber = field.type === "number";
  const numericValue = Number(value);
  const hasRange = isNumber && typeof field.min === "number" && typeof field.max === "number";

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm text-foreground">
          {field.label}
          {modified ? <span className="ml-1 text-blue-500">●</span> : null}
        </Label>
        <Input
          type={isNumber ? "number" : "text"}
          value={String(value)}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => onChange(field.key, isNumber ? Number(e.target.value) : e.target.value)}
          className="h-8 w-20 text-right"
        />
      </div>
      {hasRange ? (
        <input
          type="range"
          value={Number.isFinite(numericValue) ? numericValue : Number(field.default ?? field.min)}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(field.key, Number(e.target.value))}
          className="w-full accent-primary"
        />
      ) : null}
    </div>
  );
}
