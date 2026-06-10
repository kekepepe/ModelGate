import { test, expect } from "@playwright/test";

test.describe("Usage page heatmap", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
    await page.route("**/api/usage/summary**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            inputTokens: 100,
            outputTokens: 200,
            totalTokens: 300,
            estimatedCost: 0.01,
            totalRequests: 5,
            successRate: 1,
            failedRequests: 0,
            avgLatencyMs: 500,
          },
        }),
      });
    });
    await page.route("**/api/usage/daily**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
    await page.route("**/api/usage/providers**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
    await page.route("**/api/usage/models**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              model: "GPT-4o",
              modelId: "openai.gpt-4o",
              provider: "OpenAI",
              providerId: "openai",
              requests: 10,
              tokens: 5000,
              cost: 0.05,
              successRate: 1,
              avgLatencyMs: 400,
            },
            {
              model: "Claude Sonnet",
              modelId: "anthropic.claude-sonnet-4",
              provider: "Anthropic",
              providerId: "anthropic",
              requests: 7,
              tokens: 3000,
              cost: 0.03,
              successRate: 1,
              avgLatencyMs: 350,
            },
            {
              model: "GPT-4o-mini",
              modelId: "openai.gpt-4o-mini",
              provider: "OpenAI",
              providerId: "openai",
              requests: 3,
              tokens: 1000,
              cost: 0.01,
              successRate: 1,
              avgLatencyMs: 200,
            },
          ],
        }),
      });
    });
    await page.route("**/api/usage/logs**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  test("heatmap section renders with provider and model labels", async ({ page }) => {
    await page.goto("/usage");
    await expect(page.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();

    // Heatmap section should exist
    const heatmapHeader = page.getByRole("heading", { name: "Provider × Model Usage" });
    await expect(heatmapHeader).toBeVisible();

    // Find heatmap container (the box around the heading)
    const heatmapBox = heatmapHeader.locator(
      "xpath=ancestor::*[contains(@class, 'rounded-lg')][1]",
    );

    // Provider names should appear inside the heatmap (use title attribute since they're truncated)
    await expect(heatmapBox.getByTitle("OpenAI").first()).toBeVisible();
    await expect(heatmapBox.getByTitle("Anthropic").first()).toBeVisible();

    // Request counts should be rendered in heatmap cells (use title with full label)
    await expect(heatmapBox.getByTitle(/OpenAI × .*: 10 requests/).first()).toBeVisible();
    await expect(heatmapBox.getByTitle(/Anthropic × .*: 7 requests/).first()).toBeVisible();
  });
});
