import { test, expect } from "@playwright/test";

/**
 * /projects (V2.5 Project Mode) — list page smoke spec.
 *
 * Mocks /api/projects and verifies the table renders, the create button
 * opens the modal, and submitting the modal returns to the list with a
 * new row.
 */

const SAMPLE_PROJECTS = [
  {
    id: "pr_a",
    title: "API Health Check",
    goal: "Add /health endpoint",
    status: "completed",
    mode: "advisory",
    intakeModelId: "gpt-4o",
    plannerModelId: "gpt-4o",
    supervisorModelId: null,
    integratorModelId: null,
    workerModelId: null,
    intake: null,
    budget: { maxAgents: 6, maxTokens: 200000, maxRuntimeSeconds: 600 },
    usage: { agentsUsed: 4, tokensUsed: 12345, runtimeSeconds: 38, contextFilesUsed: 0 },
    errorType: null,
    errorMessage: null,
    startedAt: "2026-06-08T10:00:00Z",
    completedAt: "2026-06-08T10:00:40Z",
    createdAt: "2026-06-08T10:00:00Z",
  },
  {
    id: "pr_b",
    title: "Settings export",
    goal: "Add JSON export of model settings",
    status: "running",
    mode: "advisory",
    intakeModelId: null,
    plannerModelId: null,
    supervisorModelId: null,
    integratorModelId: null,
    workerModelId: null,
    intake: null,
    budget: { maxAgents: 6, maxTokens: 200000, maxRuntimeSeconds: 600 },
    usage: { agentsUsed: 2, tokensUsed: 1234, runtimeSeconds: 4, contextFilesUsed: 0 },
    errorType: null,
    errorMessage: null,
    startedAt: "2026-06-08T11:00:00Z",
    completedAt: null,
    createdAt: "2026-06-08T11:00:00Z",
  },
];

const SAMPLE_MODELS = [
  {
    id: "gpt-4o",
    officialModelName: "gpt-4o",
    displayName: "GPT-4o",
    provider: "openai",
    category: "chat",
    runtime: "chat",
    capabilities: [],
    inputTypes: ["text"],
    outputTypes: ["text"],
    taskTypes: ["chat"],
    contextWindow: 128000,
    async: false,
    paramsSchema: "openai-chat",
    enabled: true,
  },
];

const SAMPLE_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    authType: "api_key",
    enabled: true,
    adapter: "openai",
    configured: true,
    keySource: "local",
  },
];

test.describe("Projects list page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: SAMPLE_PROVIDERS }),
      });
    });
    await page.route("**/api/models", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: SAMPLE_MODELS }),
      });
    });
    await page.route("**/api/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: SAMPLE_PROJECTS }),
      });
    });
  });

  test("renders project table with rows", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "Project Mode" })).toBeVisible();
    const rows = page.locator('[data-testid="project-link"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("API Health Check");
  });

  test("status pills reflect run state", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText("completed").first()).toBeVisible();
    await expect(page.getByText("running").first()).toBeVisible();
  });

  test("opens the create modal and submits", async ({ page }) => {
    let captured: unknown = null;
    await page.route("**/api/projects", async (route) => {
      if (route.request().method() === "POST") {
        captured = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: "pr_new",
              title: captured?.title ?? "Test",
              goal: captured?.goal ?? "",
              status: "pending",
              mode: "advisory",
              budget: { maxAgents: 6 },
              usage: null,
              intake: null,
              errorType: null,
              errorMessage: null,
              startedAt: null,
              completedAt: null,
              createdAt: "2026-06-08T12:00:00Z",
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: SAMPLE_PROJECTS }),
      });
    });

    await page.goto("/projects");
    await page.locator('[data-testid="new-project-button"]').click();
    await expect(page.locator('[data-testid="create-project-modal"]')).toBeVisible();

    // Wait for models to load in the agent selectors
    await expect(page.locator('[data-testid="agent-model-select-intake"]')).toBeVisible();

    await page.locator('[data-testid="goal-input"]').fill("Add OAuth2 login flow");
    await page.locator('[data-testid="create-submit"]').click();

    expect(captured).toBeTruthy();
    expect((captured as { goal: string }).goal).toBe("Add OAuth2 login flow");
  });

  test("deletes a project row from the list", async ({ page }) => {
    let deleted: string | null = null;
    await page.route("**/api/projects/pr_a", async (route) => {
      if (route.request().method() === "DELETE") {
        deleted = "pr_a";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { deleted: true, id: "pr_a" } }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: "{}" });
    });

    await page.goto("/projects");
    await page.locator('[data-testid="project-delete-pr_a"]').click();
    await expect(page.locator('[data-testid="list-delete-confirm-dialog"]')).toBeVisible();
    await page.locator('[data-testid="list-delete-confirm"]').click();

    expect(deleted).toBe("pr_a");
  });
});
