import { test, expect } from "@playwright/test";

/**
 * Output Tabs (P0-2) smoke spec.
 *
 * Verifies the Output / Timeline / Request / Archive tabs are present in
 * the workspace shell. The tab triggers should be visible on initial
 * load even before a run is executed.
 */
test.describe("Workspace Output Tabs", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
    });
    await page.route("**/api/models**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
    });
    await page.route("**/api/usage/models**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
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
