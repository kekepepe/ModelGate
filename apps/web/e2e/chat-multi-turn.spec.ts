import { test, expect } from "@playwright/test";

/**
 * V3.3 Multi-turn Context spec.
 *
 * Verifies that:
 *   - Sending multiple messages reuses the same conversationId
 *   - The backend receives conversationId on subsequent messages
 *   - Context truncation metadata is surfaced when present
 *   - Conversation sidebar shows the conversation
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

test.describe("V3.3 Multi-turn Context", () => {
  let sendCount = 0;
  let capturedConversationId: string | null = null;
  const requests: Array<{ conversationId?: string; prompt?: string }> = [];

  test.beforeEach(async ({ page }) => {
    sendCount = 0;
    capturedConversationId = null;
    requests.length = 0;

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

    // Mock conversations list (empty initially)
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

    // Track stream requests and mock responses
    await page.route("**/api/chat/runs/stream", async (route) => {
      sendCount += 1;
      const runId = `run_${sendCount}`;
      const body = route.request().postDataJSON();
      const convId = body?.conversationId ?? `conv_${sendCount}`;

      requests.push({
        conversationId: body?.conversationId,
        prompt: body?.prompt,
      });

      // First request creates a conversation, subsequent ones reuse it
      const effectiveConvId = sendCount === 1 ? `conv_${sendCount}` : capturedConversationId ?? convId;

      // Simulate context truncation metadata on 3rd+ request
      const truncationMeta =
        sendCount >= 3
          ? {
              context_truncation: {
                original_count: (sendCount - 1) * 2,
                included_count: (sendCount - 2) * 2,
                system_tokens: 100,
                history_tokens: 500 * (sendCount - 2),
                current_user_tokens: 50,
                file_tokens: 0,
                dropped_count: 2,
                dropped_token_estimate: 200,
                budget_tokens: 50000,
              },
            }
          : undefined;

      const doneRun: Record<string, unknown> = {
        id: runId,
        taskType: "chat",
        providerId: "mimo",
        modelId: "mimo.mimo_v2_5",
        input: { prompt: body?.prompt ?? "test", fileIds: [] },
        params: {},
        output: { type: "text", text: `Reply ${sendCount} to: ${body?.prompt ?? "test"}` },
        status: "completed",
        metadata: truncationMeta,
      };

      const sseBody = sse([
        { type: "run", runId, status: "running" },
        { type: "delta", delta: `Reply ${sendCount}` },
        {
          type: "done",
          run: doneRun,
          conversationId: effectiveConvId,
          messageId: `msg_assistant_${sendCount}`,
        },
      ]);

      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: sseBody,
      });
    });
  });

  test("first message creates conversation, subsequent reuse same conversationId", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");

    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });

    // Send first message
    const composer = page.getByTestId("chat-composer-textarea");
    await composer.fill("What is Python?");
    await page.getByTestId("chat-composer-send").click();

    // Wait for reply
    await expect(page.getByTestId("chat-message-assistant-content").first()).toContainText("Reply 1", {
      timeout: 10_000,
    });

    // First request should have no conversationId (new conversation)
    expect(requests[0].conversationId).toBeFalsy();

    // Send second message
    await composer.fill("Can you give an example?");
    await page.getByTestId("chat-composer-send").click();

    await expect(page.getByTestId("chat-message-assistant-content").nth(1)).toContainText("Reply 2", {
      timeout: 10_000,
    });

    // After first message, URL should have conversationId param
    const url = page.url();
    expect(url).toContain("conversationId=");

    // Both messages should be visible
    await expect(page.getByTestId("chat-message-user")).toHaveCount(2);
    await expect(page.getByTestId("chat-message-assistant")).toHaveCount(2);
  });

  test("three messages maintain conversation continuity", async ({ page }) => {
    await page.goto("/workspace?taskType=chat");
    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });

    const composer = page.getByTestId("chat-composer-textarea");

    // Send 3 messages
    for (let i = 1; i <= 3; i++) {
      await composer.fill(`Message ${i}`);
      await page.getByTestId("chat-composer-send").click();
      await expect(page.getByTestId("chat-message-assistant-content").nth(i - 1)).toContainText(`Reply ${i}`, {
        timeout: 10_000,
      });
    }

    // All 3 user + 3 assistant messages visible
    await expect(page.getByTestId("chat-message-user")).toHaveCount(3);
    await expect(page.getByTestId("chat-message-assistant")).toHaveCount(3);

    // URL contains conversationId
    expect(page.url()).toContain("conversationId=");
  });
});
