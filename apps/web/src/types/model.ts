export type Provider = {
  id: string;
  name: string;
  baseUrl?: string;
  authType: string;
  envKey?: string | null;
  enabled: boolean;
  adapter: string;
  configured?: boolean;
  metadata?: Record<string, unknown>;
};

export type ModelInfo = {
  id: string;
  officialModelName: string;
  displayName: string;
  provider: string;
  category: string;
  runtime: string;
  capabilities: string[];
  inputTypes: string[];
  outputTypes: string[];
  taskTypes: string[];
  contextWindow: number | null;
  async: boolean;
  paramsSchema: string;
  enabled: boolean;
  adapterConfig?: Record<string, unknown>;
};

export type TaskType = {
  id: string;
  name: string;
  input: string;
  output: string;
  requiredInputTypes: string[];
};

export type ParamField = {
  key: string;
  type: "number" | "string" | "boolean" | "select";
  label: string;
  default?: string | number | boolean;
  required: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
};

export type ParamSchema = {
  id: string;
  name: string;
  version: number;
  runtime: string;
  fields: ParamField[];
};

export type FileRecord = {
  id: string;
  originalName: string;
  mimeType: string;
  detectedType: string;
  status: string;
  sizeBytes: number;
  directUsable: boolean;
  metadata: Record<string, unknown>;
  errorMessage?: string | null;
  previewUrl?: string | null;
  createdAt?: string | null;
};

export type RecommendResult = {
  availableModels: ModelInfo[];
  hiddenModels: {
    id: string;
    officialModelName: string;
    displayName: string;
    reasons: string[];
  }[];
};

export type RunRecord = {
  id: string;
  taskType: string;
  providerId: string;
  modelId: string;
  input: Record<string, unknown>;
  params: Record<string, unknown>;
  output?: {
    type?: string;
    text?: string;
    imageUrl?: string;
    videoUrl?: string;
    fileUrl?: string;
    fileName?: string;
  } | null;
  status: string;
  errorType?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
};

export type RequestLog = {
  id: string;
  recordType: string;
  recordId: string;
  providerId: string;
  modelId?: string | null;
  statusCode?: number | null;
  latencyMs?: number | null;
  errorType?: string | null;
  createdAt?: string | null;
};

export type ApiErrorInfo = {
  type?: string;
  message: string;
  requestId?: string;
};
