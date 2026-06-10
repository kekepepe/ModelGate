import { test, expect } from "@playwright/test";

/**
 * /activity (P0-3) smoke spec.
 *
 * Activity merges runs + request_logs into one timeline. We mock both
 * endpoints so the spec is hermetic.
 */
test.describe("Activity page", () => {
  test.beforeEach(async ({ page }) => {
    // Mock providers endpoint (needed by topbar/sidebar)
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
    // Mock runs endpoint
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
    // Mock request logs endpoint
    await page.route("**/api/logs/requests**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  test("renders activity table with merged log", async ({ page }) => {
    await page.goto("/activity");
    await expect(page.getByRole("heading", { name: /Activity/i })).toBeVisible();
    await expect(page.getByText("mimo.mimo_v2_5")).toBeVisible();
    await expect(page.getByText("run_1")).toBeVisible();
  });

  test("legacy /history redirects to /activity", async ({ page }) => {
    await page.goto("/history");
    await expect(page).toHaveURL(/\/activity/);
  });

  test("legacy /logs redirects to /activity", async ({ page }) => {
    await page.goto("/logs");
    await expect(page).toHaveURL(/\/activity/);
  });
});
