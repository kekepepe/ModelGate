import { create } from "zustand";

import type { FileRecord, RunRecord } from "@/types/model";

type WorkspaceState = {
  selectedTaskType: string;
  selectedModelId: string | null;
  providerFilter: string | null;
  prompt: string;
  params: Record<string, string | number | boolean>;
  files: FileRecord[];
  latestRun: RunRecord | null;
  setSelectedTaskType: (taskType: string) => void;
  setSelectedModelId: (modelId: string | null) => void;
  setProviderFilter: (providerId: string | null) => void;
  setPrompt: (prompt: string) => void;
  setParam: (key: string, value: string | number | boolean) => void;
  setParams: (params: Record<string, string | number | boolean>) => void;
  addFile: (file: FileRecord) => void;
  removeFile: (fileId: string) => void;
  setLatestRun: (run: RunRecord | null) => void;
  resetWorkspace: () => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedTaskType: "chat",
  selectedModelId: null,
  providerFilter: null,
  prompt: "",
  params: {},
  files: [],
  latestRun: null,
  setSelectedTaskType: (taskType) =>
    set({
      selectedTaskType: taskType,
      selectedModelId: null,
      prompt: "",
      params: {},
      latestRun: null,
    }),
  setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),
  setProviderFilter: (providerId) => set({ providerFilter: providerId, selectedModelId: null }),
  setPrompt: (prompt) => set({ prompt }),
  setParam: (key, value) => set((state) => ({ params: { ...state.params, [key]: value } })),
  setParams: (params) => set({ params }),
  addFile: (file) => set((state) => ({ files: [...state.files, file] })),
  removeFile: (fileId) =>
    set((state) => ({
      files: state.files.filter((file) => file.id !== fileId),
    })),
  setLatestRun: (run) => set({ latestRun: run }),
  resetWorkspace: () =>
    set({
      selectedTaskType: "chat",
      selectedModelId: null,
      providerFilter: null,
      prompt: "",
      params: {},
      files: [],
      latestRun: null,
    }),
}));
