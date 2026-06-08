export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

export class ApiError extends Error {
  type?: string;
  requestId?: string;
  status: number;

  constructor(message: string, status: number, type?: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.type = type;
    this.requestId = requestId;
  }
}

type ApiEnvelope<T> = {
  data: T;
};

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw await buildApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await buildApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await buildApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw await buildApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw await buildApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function getData<T>(path: string): Promise<T> {
  const envelope = await apiGet<ApiEnvelope<T>>(path);
  return envelope.data;
}

export async function postData<T>(path: string, body: unknown): Promise<T> {
  const envelope = await apiPost<ApiEnvelope<T>>(path, body);
  return envelope.data;
}

export async function putData<T>(path: string, body: unknown): Promise<T> {
  const envelope = await apiPut<ApiEnvelope<T>>(path, body);
  return envelope.data;
}

export async function deleteData<T>(path: string): Promise<T> {
  const envelope = await apiDelete<ApiEnvelope<T>>(path);
  return envelope.data;
}

export async function uploadData<T>(path: string, formData: FormData): Promise<T> {
  const envelope = await apiUpload<ApiEnvelope<T>>(path, formData);
  return envelope.data;
}

async function buildApiError(response: Response): Promise<Error> {
  try {
    const payload = await response.json();
    const type = payload?.error?.type ? String(payload.error.type) : undefined;
    const requestId = payload?.error?.requestId ? String(payload.error.requestId) : undefined;
    const message = payload?.error?.message ?? type;
    if (message) return new ApiError(String(message), response.status, type, requestId);
  } catch {
    // Fall through to status-only error.
  }
  return new ApiError(`API request failed: ${response.status}`, response.status);
}

// ── Project Mode V2.5 ───────────────────────────────────────────────────────

export type ProjectRunStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "budget_exceeded"
  | "cancelled"
  | "validation_failed";

export type AgentRunStatus = "running" | "completed" | "failed";

export interface ProjectTaskView {
  id: string;
  projectRunId: string;
  parentTaskId: string | null;
  title: string;
  description: string;
  role: string;
  status: string;
  priority: number | null;
  dependsOn: string[];
  allowedFiles: string[];
  acceptanceCriteria: string[];
  assignedModelId: string | null;
  assignedProviderId: string | null;
  metadata: unknown;
}

export interface AgentRunView {
  id: string;
  projectRunId: string;
  taskId: string | null;
  runId: string | null;
  role: string;
  status: AgentRunStatus | string;
  modelId: string | null;
  providerId: string | null;
  prompt: string | null;
  output: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  errorType: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ArtifactView {
  id: string;
  projectRunId: string;
  taskId: string | null;
  agentRunId: string | null;
  type: string;
  name: string;
  content: unknown;
  contentKind: "json" | "text";
  sizeBytes: number;
  truncated: boolean;
  metadata: unknown;
  createdAt: string | null;
}

export interface ProjectRunView {
  id: string;
  title: string;
  goal: string;
  status: ProjectRunStatus;
  mode: string | null;
  plannerModelId: string | null;
  supervisorModelId: string | null;
  integratorModelId: string | null;
  workerModelId: string | null;
  intake: unknown;
  budget: unknown;
  usage: { agentsUsed?: number; tokensUsed?: number; runtimeSeconds?: number; contextFilesUsed?: number } | null;
  errorType: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
}

export interface ProjectRunDetails {
  projectRun: ProjectRunView;
  tasks: ProjectTaskView[];
  agentRuns: AgentRunView[];
  artifacts: ArtifactView[];
}

export interface CreateProjectRunBody {
  goal: string;
  title?: string;
  mode?: string;
  plannerModelId?: string;
  supervisorModelId?: string;
  integratorModelId?: string;
  workerModelId?: string;
  budget?: {
    maxAgents?: number;
    maxRounds?: number;
    maxTokens?: number;
    maxRuntimeSeconds?: number;
    maxContextFiles?: number;
  };
}

export interface PatchApplyResponse {
  applied: boolean;
  files: string[];
}

export interface PatchRejectResponse {
  rejected: boolean;
  artifactId: string;
}

export const projectApi = {
  list: () => getData<ProjectRunView[]>("/projects"),
  get: (id: string) => getData<ProjectRunDetails>(`/projects/${id}`),
  create: (body: CreateProjectRunBody) => postData<ProjectRunView>("/projects", body),
  approve: (
    id: string,
    body: {
      taskIds?: string[];
      budget?: CreateProjectRunBody["budget"];
      fileApprovals?: Record<string, Record<string, "accept" | "reject">>;
    } = {},
  ) => postData<{ projectRunId: string; status: string }>(`/projects/${id}/approve`, body),
  cancel: (id: string) => postData<ProjectRunView>(`/projects/${id}/cancel`, {}),
  delete: (id: string) => deleteData<{ deleted: boolean; id: string }>(`/projects/${id}`),
  artifact: (id: string, artifactId: string) =>
    getData<ArtifactView>(`/projects/${id}/artifacts/${artifactId}`),
  // V2.6 Patch Mode
  applyPatch: (id: string, artifactId: string, body: { confirmHighRisk?: boolean } = {}) =>
    postData<PatchApplyResponse>(`/projects/${id}/patches/${artifactId}/apply`, body),
  rejectPatch: (id: string, artifactId: string) =>
    postData<PatchRejectResponse>(`/projects/${id}/patches/${artifactId}/reject`, {}),
  regeneratePatches: (id: string, body: { taskIds: string[]; budget?: CreateProjectRunBody["budget"] }) =>
    postData<{ projectRunId: string; status: string; regenerating: string[] }>(
      `/projects/${id}/patches/regenerate`,
      body,
    ),
};

