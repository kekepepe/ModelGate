"use client";

import type { ParamSchema } from "@/types/model";

export type PresetId = "default" | "creative" | "precise" | "long_context" | "low_cost";

export type PresetTarget = Record<string, number>;

export type PresetDefinition = {
  id: PresetId;
  label: string;
  description: string;
  applicableTasks: string[] | "*";
  target: PresetTarget;
};

export const BUILTIN_PRESETS: PresetDefinition[] = [
  {
    id: "creative",
    label: "Creative",
    description: "High variety. Best for brainstorming and prompt optimization.",
    applicableTasks: ["chat", "prompt_optimize"],
    target: {
      temperature: 1.0,
      top_p: 0.95,
      presence_penalty: 0.6,
      frequency_penalty: 0.3,
    },
  },
  {
    id: "precise",
    label: "Precise",
    description: "Deterministic. Best for coding, code review, document QA.",
    applicableTasks: ["coding", "code_review", "document_analysis"],
    target: {
      temperature: 0.2,
      top_p: 0.8,
      presence_penalty: 0,
      frequency_penalty: 0,
    },
  },
  {
    id: "long_context",
    label: "Long context",
    description: "Balanced sampling, large max_tokens. For long inputs/outputs.",
    applicableTasks: ["document_analysis", "chat"],
    target: {
      temperature: 0.5,
      top_p: 0.9,
    },
  },
  {
    id: "low_cost",
    label: "Low cost",
    description: "Short output to minimize tokens.",
    applicableTasks: "*",
    target: {
      temperature: 0.5,
      top_p: 0.9,
      max_tokens: 256,
    },
  },
];

export function getPreset(id: PresetId): PresetDefinition | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}

export type ApplyOutcome = {
  applied: Record<string, string | number | boolean>;
  setFields: string[];
  skippedFields: { key: string; reason: string }[];
};

const LONG_CONTEXT_RATIO = 0.8;
const MAX_TOKENS_ROUND = 256;

export function applyPreset(
  presetId: PresetId,
  schema: ParamSchema | undefined,
  currentParams: Record<string, string | number | boolean>,
): ApplyOutcome {
  const result: ApplyOutcome = {
    applied: { ...currentParams },
    setFields: [],
    skippedFields: [],
  };

  if (presetId === "default") {
    if (!schema) return result;
    for (const field of schema.fields) {
      if (field.default !== undefined) {
        result.applied[field.key] = field.default;
        result.setFields.push(field.key);
      }
    }
    return result;
  }

  const preset = getPreset(presetId);
  if (!preset || !schema) return result;

  const fieldsByKey = new Map(schema.fields.map((f) => [f.key, f]));

  for (const [key, target] of Object.entries(preset.target)) {
    const field = fieldsByKey.get(key);
    if (!field) {
      result.skippedFields.push({ key, reason: "not_supported_by_model" });
      continue;
    }
    if (field.type !== "number") {
      result.skippedFields.push({ key, reason: "non_numeric_field" });
      continue;
    }
    let value = target;
    if (field.min !== undefined) value = Math.max(field.min, value);
    if (field.max !== undefined) value = Math.min(field.max, value);
    result.applied[key] = value;
    result.setFields.push(key);
  }

  if (presetId === "long_context") {
    const maxTokensField = fieldsByKey.get("max_tokens");
    if (maxTokensField && maxTokensField.type === "number" && maxTokensField.max !== undefined) {
      const value =
        Math.floor((maxTokensField.max * LONG_CONTEXT_RATIO) / MAX_TOKENS_ROUND) * MAX_TOKENS_ROUND;
      result.applied["max_tokens"] = Math.max(MAX_TOKENS_ROUND, value);
      if (!result.setFields.includes("max_tokens")) result.setFields.push("max_tokens");
    } else if (!maxTokensField) {
      result.skippedFields.push({ key: "max_tokens", reason: "not_supported_by_model" });
    }
  }

  return result;
}

export function isPresetApplicable(preset: PresetDefinition, taskId: string): boolean {
  return preset.applicableTasks === "*" || preset.applicableTasks.includes(taskId);
}

export function fieldsModifiedFromPreset(
  preset: PresetDefinition,
  schema: ParamSchema | undefined,
  currentParams: Record<string, string | number | boolean>,
): string[] {
  if (!schema) return [];
  const outcome = applyPreset(preset.id, schema, {});
  const modified: string[] = [];
  for (const key of outcome.setFields) {
    if (currentParams[key] !== outcome.applied[key]) modified.push(key);
  }
  return modified;
}

/* ── Custom presets (localStorage) ────────────────────────── */

export type CustomPreset = {
  id: string;
  name: string;
  params: Record<string, string | number | boolean>;
  createdAt: number;
};

const CUSTOM_STORAGE_KEY = "modelgate:custom-presets";
const CUSTOM_SCHEMA_VERSION = 1;

type CustomPresetsStore = {
  version: number;
  presets: CustomPreset[];
};

export function loadCustomPresets(): CustomPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const store = JSON.parse(raw) as CustomPresetsStore;
    if (store.version !== CUSTOM_SCHEMA_VERSION) return [];
    return store.presets;
  } catch {
    return [];
  }
}

function saveCustomPresetsStore(presets: CustomPreset[]) {
  if (typeof window === "undefined") return;
  try {
    const store: CustomPresetsStore = { version: CUSTOM_SCHEMA_VERSION, presets };
    window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

export function saveCustomPreset(
  name: string,
  params: Record<string, string | number | boolean>,
): CustomPreset {
  const preset: CustomPreset = {
    id: crypto.randomUUID(),
    name,
    params: { ...params },
    createdAt: Date.now(),
  };
  const existing = loadCustomPresets();
  saveCustomPresetsStore([...existing, preset]);
  return preset;
}

export function deleteCustomPreset(id: string): void {
  const existing = loadCustomPresets();
  saveCustomPresetsStore(existing.filter((p) => p.id !== id));
}

export function applyCustomPreset(
  preset: CustomPreset,
  schema: ParamSchema | undefined,
  currentParams: Record<string, string | number | boolean>,
): ApplyOutcome {
  const result: ApplyOutcome = {
    applied: { ...currentParams },
    setFields: [],
    skippedFields: [],
  };
  if (!schema) return result;
  const fieldsByKey = new Map(schema.fields.map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(preset.params)) {
    const field = fieldsByKey.get(key);
    if (!field) {
      result.skippedFields.push({ key, reason: "not_supported_by_model" });
      continue;
    }
    if (field.type !== "number" && typeof value === "number") {
      result.skippedFields.push({ key, reason: "non_numeric_field" });
      continue;
    }
    let clamped = value;
    if (field.type === "number" && typeof value === "number") {
      if (field.min !== undefined) clamped = Math.max(field.min, clamped as number);
      if (field.max !== undefined) clamped = Math.min(field.max, clamped as number);
    }
    result.applied[key] = clamped;
    result.setFields.push(key);
  }
  return result;
}
