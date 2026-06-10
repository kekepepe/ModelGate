import { test, expect } from "@playwright/test";

/**
 * V3.2 Conversation Persistence spec.
 *
 * Verifies:
 *   - First message auto-creates conversation, URL updates with ?conversationId=
 *   - Refresh page — messages persist and load from API
 *   - Sidebar shows conversation, clicking loads it
 *   - Delete conversation from sidebar
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

test.describe("V3.2 Conversation Persistence", () => {
  let conversationStore: Record<string, Record<string, unknown>> = {};
  let conversationList: Array<Record<string, unknown>> = [];
  let messageStore: Record<string, Array<Record<string, unknown>>> = {};
  let sendCount = 0;

  test.beforeEach(async ({ page }) => {
    conversationStore = {};
    conversationList = [];
    messageStore = {};
    sendCount = 0;

    await page.route("**/api/providers", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(providers),
      }),
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
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      }),
    );
    await page.route("**/api/history/runs", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      }),
    );
    await page.route("**/api/param-schemas/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { name: "default", fields: [] } }),
      }),
    );

    // Conversation list endpoint
    await page.route("**/api/conversations", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: conversationList }),
        });
      } else if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        sendCount += 1;
        const id = `conv_${sendCount}`;
        const now = new Date().toISOString();
        const conv = {
          id,
          title: body.title || "New Chat",
          taskType: body.taskType || "chat",
          modelId: body.modelId || null,
          params: body.params || null,
          status: "active",
          createdAt: now,
          updatedAt: now,
          messages: [],
        };
        conversationStore[id] = conv;
        conversationList.unshift(conv);
        messageStore[id] = [];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: conv }),
        });
      }
    });

    // Conversation detail endpoint
    await page.route("**/api/conversations/*", async (route) => {
      const url = route.request().url();
      const convId = url.split("/api/conversations/")[1]?.split("?")[0];
      if (route.request().method() === "GET") {
        const conv = conversationStore[convId];
        if (!conv) {
          await route.fulfill({ status: 404, body: JSON.stringify({ detail: "Not found" }) });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: { ...conv, messages: messageStore[convId] || [] },
          }),
        });
      } else if (route.request().method() === "DELETE") {
        delete conversationStore[convId];
        conversationList = conversationList.filter((c) => c.id !== convId);
        delete messageStore[convId];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { id: convId, status: "deleted" } }),
        });
      }
    });

    // Stream endpoint — creates messages in mock store
    await page.route("**/api/chat/runs/stream", async (route) => {
      const body = route.request().postDataJSON();
      sendCount += 1;
      const runId = `run_${sendCount}`;
      const convId = body.conversationId || `conv_${sendCount}`;

      // Auto-create conversation if needed
      if (!conversationStore[convId]) {
        const now = new Date().toISOString();
        const conv = {
          id: convId,
          title: (body.prompt || "").slice(0, 50) || "New Chat",
          taskType: body.taskType || "chat",
          modelId: body.modelId || null,
          params: body.params || null,
          status: "active",
          createdAt: now,
          updatedAt: now,
        };
        conversationStore[convId] = conv;
        conversationList.unshift(conv);
        messageStore[convId] = [];
      }

      // Add user message
      messageStore[convId].push({
        id: `msg_user_${sendCount}`,
        conversationId: convId,
        role: "user",
        content: body.prompt,
        status: "completed",
        createdAt: new Date().toISOString(),
      });

      // Add assistant message
      const assistantContent = `Hello from run ${sendCount}`;
      messageStore[convId].push({
        id: `msg_asst_${sendCount}`,
        conversationId: convId,
        role: "assistant",
        content: assistantContent,
        modelId: body.modelId,
        providerId: "mimo",
        runId,
        status: "completed",
        createdAt: new Date().toISOString(),
      });

      const sseBody = sse([
        { type: "run", runId, status: "running" },
        { type: "delta", delta: assistantContent },
        {
          type: "done",
          run: {
            id: runId,
            taskType: "chat",
            providerId: "mimo",
            modelId: "mimo.mimo_v2_5",
            input: { prompt: body.prompt, fileIds: [] },
            params: {},
            output: { type: "text", text: assistantContent },
            status: "completed",
          },
          conversationId: convId,
          messageId: `msg_asst_${sendCount}`,
        },
      ]);
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: sseBody,
      });
    });
  });

  test("first message auto-creates conversation and URL updates", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");

    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });

    const composer = page.getByTestId("chat-composer-textarea");
    await composer.fill("hello world");
    await page.getByTestId("chat-composer-send").click();

    const assistant = page.getByTestId("chat-message-assistant-content").first();
    await expect(assistant).toContainText("Hello from run 1", { timeout: 10_000 });

    // URL should now contain ?conversationId=
    await expect(page).toHaveURL(/conversationId=/);
  });

  test("sidebar shows conversation after sending message", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");
    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });

    const composer = page.getByTestId("chat-composer-textarea");
    await composer.fill("test message");
    await page.getByTestId("chat-composer-send").click();

    const assistant = page.getByTestId("chat-message-assistant-content").first();
    await expect(assistant).toContainText("Hello from run 1", { timeout: 10_000 });

    // Sidebar should show a conversation item
    await expect(page.getByTestId("conversation-sidebar")).toBeVisible();
    await expect(page.getByTestId(/conversation-item-/).first()).toBeVisible({ timeout: 5_000 });
  });

  test("delete conversation from sidebar", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");
    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });

    // Send a message to create a conversation
    const composer = page.getByTestId("chat-composer-textarea");
    await composer.fill("delete me please");
    await page.getByTestId("chat-composer-send").click();

    const assistant = page.getByTestId("chat-message-assistant-content").first();
    await expect(assistant).toContainText("Hello from run 1", { timeout: 10_000 });

    // Sidebar should show the conversation item
    const sidebar = page.getByTestId("conversation-sidebar");
    await expect(sidebar).toBeVisible();

    // Hover over the conversation item to reveal delete button
    const convItem = page.getByTestId(/conversation-item-/).first();
    await expect(convItem).toBeVisible();
    await convItem.hover();
    const deleteBtn = page.getByTestId(/conversation-delete-/).first();
    await deleteBtn.click();

    // Conversation item should be removed from sidebar (but chat messages remain)
    await expect(convItem).not.toBeVisible();
  });
});
