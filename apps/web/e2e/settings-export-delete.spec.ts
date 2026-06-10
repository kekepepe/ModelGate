import { test, expect } from "@playwright/test";

test.describe("Settings Export & Delete modals", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  test("export modal opens from settings page", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    // Click Export Data button
    await page.getByRole("button", { name: /Export Data/i }).click();

    // Modal should open
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Export Data").first()).toBeVisible();

    // Should have scope buttons
    await expect(page.getByRole("button", { name: "Usage Logs" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Runs" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request Logs" })).toBeVisible();
  });

  test("delete modal opens and requires confirmation", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    // Click Delete Local Data button
    await page.getByRole("button", { name: /Delete Local Data/i }).click();

    // Modal should open
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Delete Local Data").first()).toBeVisible();

    // Should show confirmation instruction
    await expect(page.getByText("Type")).toBeVisible();

    // Fill the confirmation input (Radix uses div[role="dialog"] not dialog element)
    const dialog = page.getByRole("dialog");
    const deleteInput = dialog.getByPlaceholder("DELETE");
    await deleteInput.fill("DELETE");

    // Delete Data button should become enabled
    await expect(page.getByRole("button", { name: "Delete Data" })).toBeEnabled();
  });
});
