import { create } from "zustand";

import type { FileRecord, RunRecord } from "@/types/model";

const DRAFT_STORAGE_KEY = "modelgate.workspace.draft.v1";

export type ChatMessageStatus = "pending" | "streaming" | "completed" | "failed" | "cancelled";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: ChatMessageStatus;
  modelId?: string;
  providerId?: string;
  runId?: string;
  errorType?: string;
  errorMessage?: string;
  createdAt: string;
  attachments?: { fileId: string; name: string }[];
};

type PersistedDraft = {
  selectedTaskType: string;
  selectedModelId: string | null;
  providerFilter: string | null;
  prompt: string;
  params: Record<string, string | number | boolean>;
};

type WorkspaceState = {
  selectedTaskType: string;
  selectedModelId: string | null;
  providerFilter: string | null;
  prompt: string;
  params: Record<string, string | number | boolean>;
  files: FileRecord[];
  latestRun: RunRecord | null;
  messages: ChatMessage[];
  setSelectedTaskType: (taskType: string) => void;
  setSelectedModelId: (modelId: string | null) => void;
  setProviderFilter: (providerId: string | null) => void;
  setPrompt: (prompt: string) => void;
  setParam: (key: string, value: string | number | boolean) => void;
  setParams: (params: Record<string, string | number | boolean>) => void;
  addFile: (file: FileRecord) => void;
  removeFile: (fileId: string) => void;
  setLatestRun: (run: RunRecord | null) => void;
  appendMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearMessages: () => void;
  resetWorkspace: () => void;
};

function loadDraftFromStorage(): Partial<WorkspaceState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      selectedTaskType: typeof parsed.selectedTaskType === "string" ? parsed.selectedTaskType : "chat",
      selectedModelId: typeof parsed.selectedModelId === "string" ? parsed.selectedModelId : null,
      providerFilter: typeof parsed.providerFilter === "string" ? parsed.providerFilter : null,
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
      params: parsed.params && typeof parsed.params === "object" ? parsed.params : {},
    };
  } catch {
    return null;
  }
}

function saveDraftToStorage(state: WorkspaceState) {
  if (typeof window === "undefined") return;
  const draft: PersistedDraft = {
    selectedTaskType: state.selectedTaskType,
    selectedModelId: state.selectedModelId,
    providerFilter: state.providerFilter,
    prompt: state.prompt,
    params: state.params,
  };
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // localStorage may be unavailable (private mode, quota) — the draft is
    // best-effort and the UI continues to work without persistence.
  }
}

function clearDraftFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function initialState(): Pick<WorkspaceState, "selectedTaskType" | "selectedModelId" | "providerFilter" | "prompt" | "params" | "files" | "latestRun" | "messages"> {
  const draft = loadDraftFromStorage();
  return {
    selectedTaskType: draft?.selectedTaskType ?? "chat",
    selectedModelId: draft?.selectedModelId ?? null,
    providerFilter: draft?.providerFilter ?? null,
    prompt: draft?.prompt ?? "",
    params: draft?.params ?? {},
    files: [],
    latestRun: null,
    messages: [],
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set) => {
  const initial = initialState();
  return {
    ...initial,
    setSelectedTaskType: (taskType) =>
      set((state) => {
        if (state.selectedTaskType === taskType) return state;
        const next = {
          selectedTaskType: taskType,
          selectedModelId: null,
          prompt: "",
          params: {},
          latestRun: null,
        };
        saveDraftToStorage({ ...state, ...next });
        return next;
      }),
    setSelectedModelId: (modelId) =>
      set((state) => {
        const next = { selectedModelId: modelId };
        saveDraftToStorage({ ...state, ...next });
        return next;
      }),
    setProviderFilter: (providerId) =>
      set((state) => {
        const next = { providerFilter: providerId, selectedModelId: null };
        saveDraftToStorage({ ...state, ...next });
        return next;
      }),
    setPrompt: (prompt) =>
      set((state) => {
        const next = { prompt };
        saveDraftToStorage({ ...state, ...next });
        return next;
      }),
    setParam: (key, value) =>
      set((state) => {
        const next = { params: { ...state.params, [key]: value } };
        saveDraftToStorage({ ...state, ...next });
        return next;
      }),
    setParams: (params) =>
      set((state) => {
        const next = { params };
        saveDraftToStorage({ ...state, ...next });
        return next;
      }),
    addFile: (file) => set((state) => ({ files: [...state.files, file] })),
    removeFile: (fileId) =>
      set((state) => ({
        files: state.files.filter((file) => file.id !== fileId),
      })),
    setLatestRun: (run) => set({ latestRun: run }),
    appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
    updateMessage: (id, patch) =>
      set((state) => ({
        messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      })),
    clearMessages: () => set({ messages: [] }),
    resetWorkspace: () => {
      clearDraftFromStorage();
      set({
        selectedTaskType: "chat",
        selectedModelId: null,
        providerFilter: null,
        prompt: "",
        params: {},
        files: [],
        latestRun: null,
        messages: [],
      });
    },
  };
});
