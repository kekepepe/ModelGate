// Client-side cost estimation for agent runs.
// Pricing per 1M tokens (USD). Update as provider pricing changes.

interface ModelPricing {
  input: number;
  output: number;
}

const PRICING: Record<string, ModelPricing> = {
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  o1: { input: 15, output: 60 },
  "o1-mini": { input: 3, output: 12 },
  "o3-mini": { input: 1.1, output: 4.4 },
  // Anthropic
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-haiku-4-20250514": { input: 0.8, output: 4 },
  // Google
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  // MiniMax
  "minimax-m3": { input: 1, output: 4 },
  // DeepSeek
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
};

/**
 * Estimate cost in USD for a single agent run.
 * Returns null if model pricing is unknown or tokens are missing.
 */
export function estimateCost(
  modelId: string | null,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | null {
  if (!modelId || inputTokens == null || outputTokens == null) return null;
  const prices = PRICING[modelId];
  if (!prices) return null;
  return (inputTokens / 1_000_000) * prices.input + (outputTokens / 1_000_000) * prices.output;
}

/** Format a cost value for display. */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}
