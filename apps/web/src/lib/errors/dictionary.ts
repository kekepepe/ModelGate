/**
 * Error code dictionary — single source of truth for user-facing error
 * messages, StatusPill tones, and recommended actions.
 *
 * Designed from `docs/05-前端设计/前端V2界面与功能优化方案.md` §19.
 *
 * Usage:
 *   import { lookupError } from "@/lib/errors/dictionary";
 *   const entry = lookupError(errorType);
 */

import type { StatusTone } from "@/components/ui/status-pill";

// ── Action types ──────────────────────────────────────────

export type ErrorAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "button"; label: string; onClick: string }; // onClick id for caller dispatch

// ── Dictionary entry ──────────────────────────────────────

export type ErrorEntry = {
  tone: StatusTone;
  message: string;
  actions: ErrorAction[];
};

// ── Full dictionary ───────────────────────────────────────

export const errorDictionary: Record<string, ErrorEntry> = {
  // Provider auth / key errors
  PROVIDER_AUTH_MISSING: {
    tone: "warn",
    message: "No API key configured for this provider.",
    actions: [{ kind: "link", label: "Configure key", href: "/api-keys?provider={providerId}" }],
  },
  PROVIDER_AUTH_FAILED: {
    tone: "failed",
    message: "API key rejected by provider.",
    actions: [{ kind: "link", label: "Edit API key", href: "/api-keys?provider={providerId}" }],
  },
  PROVIDER_FORBIDDEN: {
    tone: "failed",
    message: "Provider denied access (region, plan, or model not allowed).",
    actions: [],
  },
  PROVIDER_RATE_LIMITED: {
    tone: "warn",
    message: "Provider rate limit hit. Try again later or switch model.",
    actions: [{ kind: "button", label: "Retry", onClick: "retry" }],
  },
  PROVIDER_TIMEOUT: {
    tone: "warn",
    message: "Provider did not respond in time.",
    actions: [
      { kind: "button", label: "Retry", onClick: "retry" },
      { kind: "link", label: "Open log", href: "/activity?runId={runId}" },
    ],
  },
  PROVIDER_CONNECT_ERROR: {
    tone: "failed",
    message: "Cannot reach provider endpoint.",
    actions: [{ kind: "button", label: "Retry", onClick: "retry" }],
  },
  PROVIDER_BAD_REQUEST: {
    tone: "failed",
    message: "Provider rejected the request.",
    actions: [{ kind: "link", label: "Open log", href: "/activity?runId={runId}" }],
  },
  PROVIDER_SERVER_ERROR: {
    tone: "failed",
    message: "Provider returned a server error.",
    actions: [
      { kind: "button", label: "Retry", onClick: "retry" },
      { kind: "link", label: "Open log", href: "/activity?runId={runId}" },
    ],
  },
  PROVIDER_REQUEST_ERROR: {
    tone: "failed",
    message: "Request to provider failed.",
    actions: [{ kind: "link", label: "Open log", href: "/activity?runId={runId}" }],
  },
  PROVIDER_KEY_UNSUPPORTED: {
    tone: "warn",
    message: "Provider rejected the key format.",
    actions: [{ kind: "link", label: "Edit API key", href: "/api-keys?provider={providerId}" }],
  },
  PROVIDER_KEY_INVALID: {
    tone: "warn",
    message: "Stored key cannot be decrypted (data corrupted).",
    actions: [{ kind: "link", label: "Re-enter key", href: "/api-keys?provider={providerId}" }],
  },
  PROVIDER_PROTOCOL_UNSUPPORTED: {
    tone: "failed",
    message: "Provider protocol is not supported.",
    actions: [],
  },
  PROVIDER_BASE_URL_FORBIDDEN: {
    tone: "failed",
    message: "Provider base URL is not allowed.",
    actions: [{ kind: "link", label: "Edit API key", href: "/api-keys?provider={providerId}" }],
  },
  PROVIDER_GENERATION_UNSUPPORTED: {
    tone: "muted",
    message: "This provider does not support generation tasks.",
    actions: [],
  },
  PROVIDER_GENERATION_DISABLED: {
    tone: "muted",
    message: "Generation is disabled for this provider.",
    actions: [],
  },
  PROVIDER_DISABLED: {
    tone: "muted",
    message: "This provider is disabled.",
    actions: [{ kind: "link", label: "Enable provider", href: "/api-keys?provider={providerId}" }],
  },
  PROVIDER_STATUS_MISSING: {
    tone: "failed",
    message: "Provider status response is missing required fields.",
    actions: [{ kind: "link", label: "Open log", href: "/activity?runId={runId}" }],
  },
  PROVIDER_STATUS_UNSUPPORTED: {
    tone: "failed",
    message: "Provider returned an unsupported status.",
    actions: [{ kind: "link", label: "Open log", href: "/activity?runId={runId}" }],
  },
  PROVIDER_INVALID_RESPONSE: {
    tone: "failed",
    message: "Provider response could not be parsed.",
    actions: [{ kind: "link", label: "Open log", href: "/activity?runId={runId}" }],
  },
  PROVIDER_TASK_ID_MISSING: {
    tone: "failed",
    message: "Provider did not return a task id.",
    actions: [{ kind: "button", label: "Retry", onClick: "retry" }],
  },
  PROVIDER_GENERATION_FAILED: {
    tone: "failed",
    message: "Generation task failed.",
    actions: [{ kind: "link", label: "Open log", href: "/activity?runId={runId}" }],
  },

  // Runtime errors
  RUN_NOT_FOUND: {
    tone: "failed",
    message: "Run record not found.",
    actions: [],
  },
  RUN_CANCELLED: {
    tone: "warn",
    message: "Run was cancelled.",
    actions: [{ kind: "button", label: "Retry", onClick: "retry" }],
  },
  CHAT_RUNTIME_ERROR: {
    tone: "failed",
    message: "Chat runtime error.",
    actions: [{ kind: "link", label: "Open log", href: "/activity?runId={runId}" }],
  },
  GENERATION_RUNTIME_ERROR: {
    tone: "failed",
    message: "Generation runtime error.",
    actions: [{ kind: "link", label: "Open log", href: "/activity?runId={runId}" }],
  },
  GENERATION_POLL_ERROR: {
    tone: "failed",
    message: "Failed to poll generation task status.",
    actions: [{ kind: "link", label: "Open log", href: "/activity?runId={runId}" }],
  },
  GENERATION_TASK_NOT_FOUND: {
    tone: "failed",
    message: "Generation task not found.",
    actions: [],
  },

  // Model errors
  MODEL_DISABLED: {
    tone: "muted",
    message: "This model is disabled.",
    actions: [],
  },
  MODEL_TASK_UNSUPPORTED: {
    tone: "muted",
    message: "This model does not support the selected task type.",
    actions: [],
  },
  GENERATION_MODEL_REQUIRED: {
    tone: "warn",
    message: "A model is required for generation tasks.",
    actions: [],
  },

  // File errors
  FILE_NOT_FOUND: {
    tone: "failed",
    message: "File not found.",
    actions: [],
  },
  FILE_PREVIEW_NOT_FOUND: {
    tone: "failed",
    message: "File preview not found.",
    actions: [],
  },
  FILE_NOT_READY: {
    tone: "warn",
    message: "File is still being processed. Please wait.",
    actions: [],
  },
  FILE_NOT_USABLE: {
    tone: "failed",
    message: "File cannot be used with this task.",
    actions: [],
  },
  FILE_EMPTY: {
    tone: "failed",
    message: "File is empty.",
    actions: [],
  },
  FILE_BINARY_REJECTED: {
    tone: "failed",
    message: "Binary files are not supported for this task.",
    actions: [],
  },
  FILE_TEXT_DECODE_FAILED: {
    tone: "failed",
    message: "File text could not be decoded.",
    actions: [],
  },

  // History
  HISTORY_RECORD_NOT_FOUND: {
    tone: "failed",
    message: "History record not found.",
    actions: [],
  },

  // Generic
  INTERNAL_ERROR: {
    tone: "failed",
    message: "Internal error. See log for details.",
    actions: [{ kind: "link", label: "Open log", href: "/activity?runId={runId}" }],
  },
};

// ── Lookup function ───────────────────────────────────────

const fallbackEntry: ErrorEntry = {
  tone: "failed",
  message: "Something went wrong.",
  actions: [{ kind: "link", label: "Open log", href: "/activity?runId={runId}" }],
};

/**
 * Look up an error type in the dictionary. Returns a fallback entry
 * for unknown error types.
 */
export function lookupError(errorType: string | undefined | null): ErrorEntry {
  if (!errorType) return fallbackEntry;
  return errorDictionary[errorType] ?? fallbackEntry;
}

/**
 * Resolve `{providerId}` / `{runId}` placeholders in action hrefs.
 */
export function resolveActionHref(
  action: ErrorAction,
  vars: { providerId?: string; runId?: string },
): string {
  if (action.kind !== "link") return "";
  let href = action.href;
  if (vars.providerId) href = href.replace("{providerId}", vars.providerId);
  if (vars.runId) href = href.replace("{runId}", vars.runId);
  return href;
}
