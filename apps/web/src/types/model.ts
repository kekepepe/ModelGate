export type Provider = {
  id: string;
  name: string;
  enabled: boolean;
  adapter: string;
};

export type ModelInfo = {
  id: string;
  officialModelName: string;
  displayName: string;
  providerId: string;
  runtime: string;
  capabilities: string[];
  inputTypes: string[];
  outputTypes: string[];
  taskTypes: string[];
  paramsSchemaId: string;
  enabled: boolean;
};

