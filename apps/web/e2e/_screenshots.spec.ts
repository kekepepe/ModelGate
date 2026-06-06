import { test } from "@playwright/test";

/**
 * Visual proof — screenshot each V2 page into test-results/v2-*.png.
 * Mocks API calls so the screenshots are deterministic.
 */
test.describe("V2 screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "mimo",
              name: "Xiaomi MiMo",
              authType: "bearer",
              envKey: "MIMO_API_KEY",
              adapter: "openai_compatible",
              enabled: true,
              configured: true,
              keySource: "local",
              metadata: { protocols: ["openai_compatible"] },
            },
          ],
        }),
      });
    });
    await page.route("**/api/models**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "mimo.mimo_v2_5",
              provider: "mimo",
              providerName: "Xiaomi MiMo",
              displayName: "MiMo v2.5",
              officialModelName: "mimo-v2.5",
              category: "chat",
              runtime: "chat_completion",
              capabilities: ["chat"],
              inputTypes: ["text"],
              outputTypes: ["text"],
              taskTypes: ["chat"],
              enabled: true,
              available: true,
              configured: true,
            },
          ],
        }),
      });
    });
    await page.route("**/api/usage/models**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
    });
    await page.route("**/api/history/runs**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "run_1",
              taskType: "chat",
              providerId: "mimo",
              modelId: "mimo.mimo_v2_5",
              status: "completed",
              input: { prompt: "hi" },
              output: { text: "hello" },
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              latencyMs: 412,
              usage: { inputTokens: 12, outputTokens: 24, totalTokens: 36, cost: 0.000123 },
              requestId: "req_abc",
            },
          ],
        }),
      });
    });
    await page.route("**/api/logs/requests**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
    });
    await page.route("**/api/providers/mimo/test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { providerId: "mimo", status: "ok", message: "Connected", modelId: "mimo.mimo_v2_5" },
        }),
      });
    });
  });

  test("screenshot /api-keys", async ({ page }) => {
    await page.goto("/api-keys");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/v2-api-keys.png", fullPage: true });
  });

  test("screenshot /activity", async ({ page }) => {
    await page.goto("/activity");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/v2-activity.png", fullPage: true });
  });

  test("screenshot /workspace", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/v2-workspace.png", fullPage: true });
  });
});
