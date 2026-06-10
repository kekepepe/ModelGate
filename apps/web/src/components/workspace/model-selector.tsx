"use client";

import type { ModelInfo, Provider, RecommendResult } from "@/types/model";

type ModelSelectorProps = {
  providers: Provider[];
  recommendation?: RecommendResult;
  providerFilter: string | null;
  selectedModelId: string | null;
  onProviderFilter: (providerId: string | null) => void;
  onSelectModel: (modelId: string) => void;
};

export function ModelSelector({
  providers,
  recommendation,
  providerFilter,
  selectedModelId,
  onProviderFilter,
  onSelectModel,
}: ModelSelectorProps) {
  const availableModels = recommendation?.availableModels ?? [];
  const hiddenModels = recommendation?.hiddenModels ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onProviderFilter(null)}
          className={`rounded-md border px-3 py-1.5 text-xs ${
            providerFilter === null
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white"
          }`}
        >
          全部
        </button>
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => onProviderFilter(provider.id)}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              providerFilter === provider.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white"
            }`}
          >
            {provider.name}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {availableModels.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            providerName={
              providers.find((provider) => provider.id === model.provider)?.name ?? model.provider
            }
            selected={model.id === selectedModelId}
            onSelect={() => onSelectModel(model.id)}
          />
        ))}
      </div>

      {hiddenModels.length > 0 ? (
        <details className="rounded-md border border-slate-200 bg-white p-3 text-xs">
          <summary className="cursor-pointer font-medium text-slate-700">
            隐藏模型 {hiddenModels.length}
          </summary>
          <div className="mt-3 space-y-2">
            {hiddenModels.slice(0, 8).map((model) => (
              <div key={model.id} className="rounded-md bg-slate-50 p-2 text-slate-600">
                <div className="font-medium">{model.displayName}</div>
                <div className="mt-1">{model.reasons.join(", ")}</div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ModelCard({
  model,
  providerName,
  selected,
  onSelect,
}: {
  model: ModelInfo;
  providerName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border p-3 text-left transition ${
        selected
          ? "border-emerald-600 bg-emerald-50"
          : "border-slate-200 bg-white hover:border-slate-400"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{model.displayName}</div>
          <div className="mt-1 text-xs text-slate-500">{providerName}</div>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
          {model.runtime}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {model.capabilities.slice(0, 5).map((capability) => (
          <span
            key={capability}
            className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-600"
          >
            {capability}
          </span>
        ))}
      </div>
    </button>
  );
}
