import { expect, test, type Page } from "@playwright/test";

const provider = {
  id: "mimo",
  name: "MiMo",
  authType: "bearer",
  enabled: true,
  adapter: "openai_compatible",
  configured: true,
};

const model = {
  id: "mimo.mimo_v2_5",
  officialModelName: "MiMo-V2.5-Pro",
  displayName: "MiMo-V2.5-Pro",
  provider: "mimo",
  category: "chat",
  runtime: "chat",
  capabilities: ["chat", "coding", "file_understanding"],
  inputTypes: ["text", "file", "code"],
  outputTypes: ["text"],
  taskTypes: ["chat", "coding", "code_review", "document_analysis", "prompt_optimize"],
  contextWindow: 128000,
  async: false,
  paramsSchema: "chat_default_schema",
  enabled: true,
};

const paramSchema = {
  id: "chat_default_schema",
  name: "Chat Defaults",
  version: 1,
  runtime: "chat",
  fields: [
    {
      key: "temperature",
      type: "number",
      label: "Temperature",
      default: 0.2,
      required: false,
      min: 0,
      max: 2,
      step: 0.1,
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("home page loads Tailwind styles instead of raw HTML", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/workspace\?taskType=chat/);
  await expect(page.getByRole("heading", { name: "任务工作台" })).toBeVisible();
  await expect(page.getByText("AI Model Workspace")).toBeVisible();
  await expect(page.locator("main")).toHaveCSS("background-color", "rgb(7, 17, 31)");
  await expect(page.getByRole("button", { name: /聊天/ }).first()).toHaveCSS("border-top-width", "1px");
});

test("workspace task switching keeps URL and page state in sync", async ({ page }) => {
  await page.goto("/workspace?taskType=chat");

  await expect(page.getByRole("button", { name: /聊天/ }).first()).toBeVisible();

  await page.getByRole("button", { name: /写代码/ }).click();
  await expect(page).toHaveURL(/taskType=coding/);
  await expect(page.getByText("任务 写代码")).toBeVisible();

  await page.getByRole("button", { name: /文档分析/ }).click();
  await expect(page).toHaveURL(/taskType=document_analysis/);
  await expect(page.getByText("任务 文档分析")).toBeVisible();

  await page.getByRole("button", { name: /Prompt 优化/ }).click();
  await expect(page).toHaveURL(/taskType=prompt_optimize/);
  await expect(page.getByText("任务 Prompt 优化")).toBeVisible();
});

test("workspace core controls are visible and file upload is interactive", async ({ page }) => {
  await page.goto("/workspace?taskType=document_analysis");

  await expect(page.getByPlaceholder("输入要发送给模型的内容")).toBeVisible();
  await expect(page.getByRole("button", { name: /MiMo-V2.5-Pro/ })).toBeVisible();
  await expect(page.getByText("temperature")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "sample.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("phase9 browser e2e file"),
  });

  await expect(page.getByText("sample.txt")).toBeVisible();
  await expect(page.locator("dl").getByText("text", { exact: true })).toBeVisible();
  await expect(page.locator("dl").getByText("parsed", { exact: true })).toBeVisible();
});

test("chat run provider errors are shown with requestId", async ({ page }) => {
  await page.route("**/api/chat/runs/stream", async (route) => {
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        "data: " +
        JSON.stringify({
          type: "error",
          error: {
            type: "PROVIDER_AUTH_ERROR",
            message: "Provider authentication failed",
            requestId: "req_e2e_error",
          },
        }) +
        "\n\n",
    });
  });

  await page.goto("/workspace?taskType=chat");
  await page.getByPlaceholder("输入要发送给模型的内容").fill("hello");
  await expect(page.getByRole("button", { name: /运行/ })).toBeEnabled();
  await page.getByRole("button", { name: /运行/ }).click();

  await expect(page.getByText("Provider authentication failed")).toBeVisible();
  await expect(page.getByText("requestId: req_e2e_error")).toBeVisible();
});

async function mockApi(page: Page) {
  await page.route("**/api/providers", async (route) => {
    await route.fulfill({ json: { data: [provider] } });
  });

  await page.route("**/api/models", async (route) => {
    await route.fulfill({ json: { data: [model] } });
  });

  await page.route("**/api/models/recommend", async (route) => {
    await route.fulfill({ json: { data: { availableModels: [model], hiddenModels: [] } } });
  });

  await page.route("**/api/param-schemas/chat_default_schema", async (route) => {
    await route.fulfill({ json: { data: paramSchema } });
  });

  await page.route("**/api/history/runs", async (route) => {
    await route.fulfill({ json: { data: [] } });
  });

  await page.route("**/api/files/upload", async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: "file_e2e_sample",
          originalName: "sample.txt",
          mimeType: "text/plain",
          detectedType: "text",
          status: "parsed",
          sizeBytes: 24,
          directUsable: true,
          metadata: { preview: "phase9 browser e2e file" },
          errorMessage: null,
          previewUrl: null,
          createdAt: "2026-06-01T00:00:00Z",
        },
      },
    });
  });

  await page.route("**/api/files/file_e2e_sample", async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: "file_e2e_sample",
          originalName: "sample.txt",
          mimeType: "text/plain",
          detectedType: "text",
          status: "deleted",
          sizeBytes: 24,
          directUsable: true,
          metadata: {},
        },
      },
    });
  });

  await page.route("**/api/chat/runs/stream", async (route) => {
    const run = {
      id: "run_e2e_ok",
      taskType: "chat",
      providerId: "mimo",
      modelId: "mimo.mimo_v2_5",
      input: { prompt: "hello" },
      params: { temperature: 0.2 },
      output: { type: "text", text: "browser e2e ok" },
      status: "completed",
      createdAt: "2026-06-01T00:00:00Z",
    };
    await route.fulfill({
      contentType: "text/event-stream",
      body: [
        "data: " + JSON.stringify({ type: "run", run: { ...run, output: { type: "text", text: "" }, status: "running" } }),
        "data: " + JSON.stringify({ type: "delta", delta: "browser e2e ok" }),
        "data: " + JSON.stringify({ type: "done", run }),
        "",
      ].join("\n\n"),
    });
  });
}
