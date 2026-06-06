import { test, expect } from "@playwright/test";

/**
 * /workspace (P0-1) Playground V2 model selector smoke spec.
 *
 * Verifies that the ModelSelectorRow renders with provider/model picker
 * and badges. Mocks API endpoints so backend isn't required.
 */
test.describe("Playground V2 model selector", () => {
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  test("renders workspace shell with model selector", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");
    await expect(page.getByText(/MiMo v2.5|mimo/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
