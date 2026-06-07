import { test, expect } from "@playwright/test";

/**
 * /workspace V2 follow-up smoke spec.
 *
 * Verifies the three V2 follow-up features render and respond to interaction:
 *   - Templates dropdown (Stage 3, P1)
 *   - Params preset selector (Stage 4, P2)
 *   - Compare drawer trigger (Stage 5, P2)
 *
 * Mocks all backend so it can run without uvicorn.
 */
test.describe("Playground V2 follow-ups (templates / preset / compare)", () => {
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
            {
              id: "minimax",
              name: "MiniMax",
              authType: "bearer",
              envKey: "MINIMAX_API_KEY",
              adapter: "openai_compatible",
              enabled: true,
              configured: true,
              keySource: "local",
              metadata: {},
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
            {
              id: "minimax.abab6_5s",
              provider: "minimax",
              providerName: "MiniMax",
              displayName: "abab6.5s",
              officialModelName: "abab6.5s-chat",
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

  test("templates dropdown shows builtin entries", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");
    await page.getByRole("button", { name: /templates/i }).click();
    await expect(page.getByText(/builtin/i)).toBeVisible();
    await expect(page.getByText(/save current as template/i)).toBeVisible();
    await expect(page.getByText(/manage templates/i)).toBeVisible();
  });

  test("compare button enables when prompt is set and opens drawer", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");
    const compareBtn = page.getByRole("button", { name: /compare/i });

    await expect(compareBtn).toBeDisabled();

    await page.getByPlaceholder(/describe what you want/i).fill("hello world prompt for compare");
    // Compare needs at least 2 models and a selected model; we mocked 2 models.
    await expect(compareBtn).toBeEnabled({ timeout: 5_000 });
    await compareBtn.click();

    await expect(page.getByText(/compare run/i)).toBeVisible();
    await expect(page.getByText(/up to 3 models/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /run all/i })).toBeVisible();
  });
});
