import { test, expect } from "@playwright/test";

/**
 * V2 Output Tabs spec — superseded by V3.1 Chat workspace.
 * Output/Timeline/Request/Archive will return inside an Assistant Message
 * Details drawer in a later V3.1 stage; re-enable then. See
 * docs/04-开发管理/PlaygroundChat化改造分阶段计划.md §3.
 */
test.describe.skip("Workspace Output Tabs (V2 — superseded)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
    await page.route("**/api/models**", async (route) => {
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
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  test("renders Output / Timeline / Request / Archive tabs", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");

    await expect(page.getByRole("tab", { name: /Output/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("tab", { name: /Timeline/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Request/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Archive/i })).toBeVisible();
  });
});
