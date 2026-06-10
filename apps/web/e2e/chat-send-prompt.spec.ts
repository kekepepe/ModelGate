import { test, expect } from "@playwright/test";

/**
 * V3.6 Regression: chat send must include the user's prompt in the
 * request body sent to /api/chat/runs/stream.
 *
 * Background: TanStack Query v5's ``useMutation`` only updates the
 * observer's options via a ``useEffect`` that runs *after* commit. If the
 * user types and clicks send quickly, the dispatched ``mutationFn`` can
 * come from a stale closure whose ``prompt`` is ``""`` — the UI bubble
 * (built from the click handler's own closure) still shows the typed
 * text, but the request body is empty and the backend stores a blank
 * user message.
 *
 * The fix in chat-workspace.tsx now passes the values explicitly to
 * ``mutate(payload)`` so the ``mutationFn`` reads from the payload, not
 * from a closure that may be stale.
 *
 * This spec asserts the request body. Mocks the backend so it runs
 * without uvicorn.
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

test.describe("V3.6 Chat send carries the user's prompt", () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test("POST /api/chat/runs/stream body has the user's prompt, not empty string", async ({
    page,
  }) => {
    const captured: Array<Record<string, unknown>> = [];
    let sendCount = 0;

    await page.route("**/api/chat/runs/stream", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      captured.push(body);
      sendCount += 1;
      const runId = `run_${sendCount}`;
      const sseBody = sse([
        { type: "run", runId, status: "running" },
        { type: "delta", delta: "ack" },
        {
          type: "done",
          run: {
            id: runId,
            taskType: "chat",
            providerId: "mimo",
            modelId: "mimo.mimo_v2_5",
            input: { prompt: body.prompt, fileIds: [] },
            params: {},
            output: { type: "text", text: "ack" },
            status: "completed",
          },
        },
      ]);
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: sseBody,
      });
    });

    await page.goto("/workspace?taskType=chat");
    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });

    const composer = page.getByTestId("chat-composer-textarea");
    const userText = "explain greedy algorithm with python code";
    await composer.fill(userText);
    await page.getByTestId("chat-composer-send").click();

    // Wait for the request to land.
    await expect.poll(() => captured.length).toBe(1);
    expect(captured[0].prompt).toBe(userText);
    expect(captured[0].taskType).toBe("chat");
    expect(captured[0].modelId).toBe("mimo.mimo_v2_5");

    // Sanity: the UI bubble should also show the typed text.
    await expect(page.getByTestId("chat-message-user").first()).toContainText(userText);
  });

  test("second send after the first completes also carries its prompt", async ({ page }) => {
    const captured: Array<Record<string, unknown>> = [];
    let sendCount = 0;

    await page.route("**/api/chat/runs/stream", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      captured.push(body);
      sendCount += 1;
      const runId = `run_${sendCount}`;
      const sseBody = sse([
        { type: "run", runId, status: "running" },
        { type: "delta", delta: `reply ${sendCount}` },
        {
          type: "done",
          run: {
            id: runId,
            taskType: "chat",
            providerId: "mimo",
            modelId: "mimo.mimo_v2_5",
            input: { prompt: body.prompt, fileIds: [] },
            params: {},
            output: { type: "text", text: `reply ${sendCount}` },
            status: "completed",
          },
        },
      ]);
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: sseBody,
      });
    });

    await page.goto("/workspace?taskType=chat");
    await expect(page.getByTestId("chat-workspace")).toBeVisible({ timeout: 10_000 });

    const composer = page.getByTestId("chat-composer-textarea");
    await composer.fill("first message");
    await page.getByTestId("chat-composer-send").click();
    await expect
      .poll(() => captured.length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    expect(captured[0].prompt).toBe("first message");

    // Wait for the first run to finish so the send button is enabled again.
    await expect(page.getByTestId("chat-message-assistant-content").first()).toContainText(
      "reply 1",
      { timeout: 10_000 },
    );

    await composer.fill("second message");
    await page.getByTestId("chat-composer-send").click();
    await expect.poll(() => captured.length).toBe(2);
    expect(captured[1].prompt).toBe("second message");
  });
});
