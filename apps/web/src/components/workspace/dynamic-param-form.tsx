"use client";

import type { ParamSchema } from "@/types/model";

type DynamicParamFormProps = {
  schema?: ParamSchema;
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
};

export function DynamicParamForm({ schema, values, onChange }: DynamicParamFormProps) {
  if (!schema) {
    return <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500">选择模型后显示参数。</div>;
  }

  return (
    <div className="space-y-3">
      {schema.fields.map((field) => {
        const value = values[field.key] ?? field.default ?? "";
        if (field.type === "boolean") {
          return (
            <label key={field.key} className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3">
              <span className="text-sm font-medium">{field.label}</span>
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) => onChange(field.key, event.target.checked)}
              />
            </label>
          );
        }

        return (
          <label key={field.key} className="block rounded-md border border-slate-200 bg-white p-3">
            <span className="text-sm font-medium">{field.label}</span>
            <input
              type={field.type === "number" ? "number" : "text"}
              min={field.min}
              max={field.max}
              step={field.step}
              value={String(value)}
              onChange={(event) => {
                const nextValue = field.type === "number" ? Number(event.target.value) : event.target.value;
                onChange(field.key, nextValue);
              }}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        );
      })}
    </div>
  );
}
