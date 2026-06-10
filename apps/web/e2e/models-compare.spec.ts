import { test, expect } from "@playwright/test";

test.describe("Models compare mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "openai",
              name: "OpenAI",
              enabled: true,
              configured: true,
              authType: "api_key",
              adapter: "openai",
            },
            {
              id: "anthropic",
              name: "Anthropic",
              enabled: true,
              configured: true,
              authType: "api_key",
              adapter: "anthropic",
            },
          ],
        }),
      });
    });
    await page.route("**/api/models", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "openai.gpt-4o",
              officialModelName: "gpt-4o",
              displayName: "GPT-4o",
              provider: "openai",
              category: "text",
              runtime: "chat",
              capabilities: ["text_generation", "vision"],
              inputTypes: ["text", "image"],
              outputTypes: ["text"],
              taskTypes: ["chat", "coding"],
              contextWindow: 128000,
              async: false,
              paramsSchema: "openai_chat",
              enabled: true,
            },
            {
              id: "anthropic.claude-sonnet-4",
              officialModelName: "claude-sonnet-4",
              displayName: "Claude Sonnet 4",
              provider: "anthropic",
              category: "text",
              runtime: "chat",
              capabilities: ["text_generation", "vision"],
              inputTypes: ["text", "image"],
              outputTypes: ["text"],
              taskTypes: ["chat", "coding"],
              contextWindow: 200000,
              async: false,
              paramsSchema: "anthropic_chat",
              enabled: true,
            },
          ],
        }),
      });
    });
  });

  test("compare button toggles mode and checkboxes appear", async ({ page }) => {
    await page.goto("/models");
    await expect(page.getByRole("heading", { name: "Models", exact: true })).toBeVisible();

    // Click Compare button (the one with GitCompare icon, in the header)
    await page.getByRole("button", { name: /Compare$/ }).click();

    // Checkboxes should appear
    const checkboxes = page.getByRole("checkbox");
    await expect(checkboxes).toHaveCount(2);

    // Exit compare button should be visible
    await expect(page.getByRole("button", { name: /Exit compare/i })).toBeVisible();
  });

  test("selecting 2 models shows compare bar and dialog", async ({ page }) => {
    await page.goto("/models");
    await page.getByRole("button", { name: /Compare$/ }).click();

    // Select both models
    const checkboxes = page.getByRole("checkbox");
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    // Sticky bar should appear
    await expect(page.getByText("2 models selected")).toBeVisible();

    // Click the Compare button in the sticky bar
    await page
      .locator("text=2 models selected")
      .locator("..")
      .getByRole("button", { name: "Compare" })
      .click();

    // Dialog should show with comparison table
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Model Comparison")).toBeVisible();
    await expect(dialog.getByText("GPT-4o")).toBeVisible();
    await expect(dialog.getByText("Claude Sonnet 4")).toBeVisible();

    // Check some comparison fields
    await expect(page.getByText("128K")).toBeVisible();
    await expect(page.getByText("200K")).toBeVisible();
  });
});
