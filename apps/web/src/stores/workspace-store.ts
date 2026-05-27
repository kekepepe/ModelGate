import { create } from "zustand";

type WorkspaceState = {
  selectedTaskType: string;
  selectedModelId: string | null;
  setSelectedTaskType: (taskType: string) => void;
  setSelectedModelId: (modelId: string | null) => void;
  resetWorkspace: () => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedTaskType: "chat",
  selectedModelId: null,
  setSelectedTaskType: (taskType) => set({ selectedTaskType: taskType, selectedModelId: null }),
  setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),
  resetWorkspace: () => set({ selectedTaskType: "chat", selectedModelId: null }),
}));

