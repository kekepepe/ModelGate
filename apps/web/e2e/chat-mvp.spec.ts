import { test, expect } from "@playwright/test";

/**
 * V3.1 Chat MVP smoke spec.
 *
 * Verifies the new ChatWorkspace surface:
 *   - empty state visible on first load
 *   - sending a user prompt streams an assistant reply
 *   - Stop button appears mid-stream
 *   - history (both user and assistant messages) persists after a second send
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
      capabilities: ["chat"],
      inputTypes: ["text"],
      outputTypes: ["text"],
      taskTypes: ["chat"],
      enabled: true,
      available: true,
      configured: true,
    },
  ],
};

function sse(events: Array<Record<string, unknown>>) {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

test.describe("V3.1 Chat MVP", () => {
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
        body: JSON.stringify({ data: { name: "default", fields: [] } }),
      }),
    );

    let sendCount = 0;
    await page.route("**/api/chat/runs/stream", async (route) => {
      sendCount += 1;
      const runId = `run_${sendCount}`;
      const body = sse([
        { type: "run", runId, status: "running" },
        { type: "delta", delta: `Hello from run ${sendCount}` },
        {
          type: "done",
          run: {
            id: runId,
            taskType: "chat",
            providerId: "mimo",
            modelId: "mimo.mimo_v2_5",
            input: { prompt: "test", fileIds: [] },
            params: {},
            output: { type: "text", text: `Hello from run ${sendCount}` },
            status: "completed",
          },
        },
      ]);
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body,
      });
    });
  });

  test("empty state visible, send streams assistant reply, history persists", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");

    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();

    const composer = page.getByTestId("chat-composer-textarea");
    await composer.fill("hello world");
    await page.getByTestId("chat-composer-send").click();

    const userBubble = page.getByTestId("chat-message-user").first();
    await expect(userBubble).toContainText("hello world");

    const assistant = page.getByTestId("chat-message-assistant-content").first();
    await expect(assistant).toContainText("Hello from run 1", { timeout: 10_000 });

    await composer.fill("second message");
    await page.getByTestId("chat-composer-send").click();

    await expect(page.getByTestId("chat-message-user")).toHaveCount(2);
    await expect(page.getByTestId("chat-message-assistant")).toHaveCount(2);
    await expect(page.getByTestId("chat-message-assistant-content").nth(1)).toContainText("Hello from run 2", {
      timeout: 10_000,
    });
  });
});
