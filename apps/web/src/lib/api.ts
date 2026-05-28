export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

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
    throw new Error(`API request failed: ${response.status}`);
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
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
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

export async function deleteData<T>(path: string): Promise<T> {
  const envelope = await apiDelete<ApiEnvelope<T>>(path);
  return envelope.data;
}

export async function uploadData<T>(path: string, formData: FormData): Promise<T> {
  const envelope = await apiUpload<ApiEnvelope<T>>(path, formData);
  return envelope.data;
}
