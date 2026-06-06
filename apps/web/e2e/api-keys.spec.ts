import { test, expect } from "@playwright/test";

/**
 * /api-keys (P0-4 + P0-6) smoke spec.
 *
 * Verifies the page renders the migrated provider key UI and that the
 * Test Connection button issues `POST /api/providers/{id}/test` (mocked
 * here to keep the spec hermetic — no real provider needed).
 */
test.describe("API Keys page", () => {
  test("renders providers list and runs a mocked test", async ({ page }) => {
    // Mock provider list
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

    // Mock test endpoint
    await page.route("**/api/providers/mimo/test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            providerId: "mimo",
            status: "ok",
            message: "Connected",
            modelId: "mimo.mimo_v2_5",
          },
        }),
      });
    });

    await page.goto("/api-keys");

    await expect(
      page.getByRole("heading", { name: "API Keys", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("main").getByText("Xiaomi MiMo")).toBeVisible();

    await page.getByRole("button", { name: /^Test$/ }).first().click();

    await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 5000 });
  });
});
