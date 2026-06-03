"use client";

import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ModelInfo, Provider } from "@/types/model";

export function ModelSelectorRow({
  availableModels,
  selectedModelId,
  selectedModel,
  selectedProvider,
  onSelectModel,
}: {
  availableModels: ModelInfo[];
  selectedModelId: string | null;
  selectedModel?: ModelInfo;
  selectedProvider?: Provider;
  onSelectModel: (modelId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b px-5 py-3">
      <span className="text-xs text-muted-foreground">Model:</span>
      <Select value={selectedModelId ?? undefined} onValueChange={onSelectModel}>
        <SelectTrigger className="h-8 w-auto min-w-[200px] border-0 bg-transparent px-2 text-sm font-medium shadow-none focus:ring-0">
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedProvider ? (
        <Badge variant="secondary" className="text-xs">
          {selectedProvider.name}
        </Badge>
      ) : null}
    </div>
  );
}
