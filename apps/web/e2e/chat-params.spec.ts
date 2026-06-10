import { test, expect } from "@playwright/test";

/**
 * V3.4 Param Schema & Model Capabilities spec.
 *
 * Verifies that:
 *   - ParamsPopover shows contextBudget select in Sampling group
 *   - Model details sheet shows maxOutputTokens
 *   - Param groups render correctly (Generation, Sampling, etc.)
 *
 * Mocks all backend so the spec runs without uvicorn.
 */

const providers = {
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
};

const models = {
  data: [
    {
      id: "mimo.mimo_v2_5",
      provider: "mimo",
      providerName: "Xiaomi MiMo",
      displayName: "MiMo v2.5",
      officialModelName: "mimo-v2.5",
      category: "chat",
      runtime: "chat_completion",
      capabilities: ["text", "code", "file_understanding", "streaming"],
      inputTypes: ["text", "code", "file"],
      outputTypes: ["text"],
      taskTypes: ["chat", "coding", "code_review", "document_analysis", "prompt_optimize"],
      contextWindow: 128000,
      maxOutputTokens: 16384,
      async: false,
      enabled: true,
      available: true,
      configured: true,
      paramsSchema: "chat_openai_compatible_schema",
    },
  ],
};

const paramSchemas = {
  data: [
    {
      id: "chat_openai_compatible_schema",
      name: "OpenAI Compatible Chat Parameters",
      version: 1,
      runtime: "chat_completion",
      fields: [
        {
          key: "temperature",
          type: "number",
          label: "Temperature",
          default: 1,
          required: false,
          min: 0,
          max: 2,
          step: 0.1,
        },
        {
          key: "max_completion_tokens",
          type: "number",
          label: "Max Output Tokens",
          default: 4096,
          required: false,
          min: 1,
          max: 16384,
        },
        {
          key: "contextBudget",
          type: "select",
          label: "Context Budget",
          default: "auto",
          required: false,
          options: [
            { label: "Auto (70%)", value: "auto" },
            { label: "Conservative (50%)", value: "conservative" },
            { label: "Balanced (70%)", value: "balanced" },
            { label: "Aggressive (85%)", value: "aggressive" },
          ],
        },
        {
          key: "stream",
          type: "boolean",
          label: "Streaming",
          default: true,
          required: false,
        },
      ],
    },
  ],
};

test.describe("V3.4 Param Schema & Model Capabilities", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(providers) }),
    );
    await page.route("**/api/models", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(models) }),
    );
    await page.route("**/api/models/recommend", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { availableModels: models.data, hiddenModels: [] },
        }),
      }),
    );
    await page.route("**/api/usage/models**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
    );
    await page.route("**/api/history/runs", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
    );
    await page.route("**/api/param-schemas/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: paramSchemas.data[0] }),
      }),
    );
    await page.route("**/api/conversations", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [] }),
        });
      }
      return route.fallback();
    });
  });

  test("params popover shows contextBudget select", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");
    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });

    // Open params popover
    const paramsButton = page.locator('button:has(svg.lucide-sliders-horizontal)').first();
    await paramsButton.click();

    // Verify the popover opened
    await expect(page.getByText("Parameters")).toBeVisible();

    // Verify Sampling group is visible (contains Max Output Tokens and Context Budget)
    await expect(page.getByText("Sampling")).toBeVisible();

    // Verify contextBudget select is present
    await expect(page.getByText("Context Budget")).toBeVisible();
  });

  test("params popover shows Max Output Tokens label", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");
    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });

    const paramsButton = page.locator('button:has(svg.lucide-sliders-horizontal)').first();
    await paramsButton.click();

    // Verify Max Output Tokens label (updated from "Max Tokens")
    await expect(page.getByText("Max Output Tokens")).toBeVisible();
  });

  test("model details sheet shows maxOutputTokens", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");
    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });

    // Click Details button to open model details sheet
    const detailsButton = page.getByText("Details").first();
    await detailsButton.click();

    // Verify the sheet shows Max output with token count
    await expect(page.getByText("Max output")).toBeVisible();
    await expect(page.getByText("16,384 tokens")).toBeVisible();
  });

  test("model details sheet shows context window", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");
    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });

    const detailsButton = page.getByText("Details").first();
    await detailsButton.click();

    // Verify context window is shown
    await expect(page.getByText("Context window")).toBeVisible();
    await expect(page.getByText("128,000 tokens")).toBeVisible();
  });
});
