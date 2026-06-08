import { test, expect } from "@playwright/test";

/**
 * /projects/[id] (V2.5 Project Mode) — approval flow smoke spec.
 *
 * Mocks /api/projects/{id} for an awaiting_approval run. Verifies the
 * task tree renders, the approve button posts to /approve, and the
 * resulting status change is reflected.
 */

const AWAITING_DETAILS = {
  data: {
    projectRun: {
      id: "pr_test",
      title: "Test run",
      goal: "Add /health endpoint",
      status: "awaiting_approval",
      mode: "advisory",
      plannerModelId: "gpt-4o",
      intake: { summary: "S", goal: "G" },
      budget: { maxAgents: 6, maxTokens: 200000, maxRuntimeSeconds: 600 },
      usage: { agentsUsed: 2, tokensUsed: 1234, runtimeSeconds: 5, contextFilesUsed: 0 },
      errorType: null,
      errorMessage: null,
      startedAt: "2026-06-08T10:00:00Z",
      completedAt: null,
      createdAt: "2026-06-08T10:00:00Z",
    },
    tasks: [
      {
        id: "t1",
        projectRunId: "pr_test",
        title: "Backend endpoint",
        description: "Add POST /api/providers/{id}/health",
        role: "backend",
        status: "pending",
        priority: 1,
        dependsOn: [],
        allowedFiles: ["apps/server/app/api/providers.py"],
        acceptanceCriteria: ["returns 200"],
        assignedModelId: "gpt-4o",
        assignedProviderId: null,
        metadata: null,
      },
      {
        id: "t2",
        projectRunId: "pr_test",
        title: "Frontend button",
        description: "Add refresh button to dashboard",
        role: "frontend",
        status: "pending",
        priority: 1,
        dependsOn: ["t1"],
        allowedFiles: ["apps/web/src/app/dashboard/page.tsx"],
        acceptanceCriteria: ["button renders"],
        assignedModelId: "gpt-4o",
        assignedProviderId: null,
        metadata: null,
      },
    ],
    agentRuns: [
      { id: "ag_i", projectRunId: "pr_test", taskId: null, runId: null, role: "intake", status: "completed", modelId: "gpt-4o", providerId: null, output: null, inputTokens: 10, outputTokens: 20, totalTokens: 30, latencyMs: 100, errorType: null, errorMessage: null, startedAt: "2026-06-08T10:00:00Z", completedAt: "2026-06-08T10:00:01Z" },
      { id: "ag_p", projectRunId: "pr_test", taskId: null, runId: null, role: "planner", status: "completed", modelId: "gpt-4o", providerId: null, output: null, inputTokens: 10, outputTokens: 20, totalTokens: 30, latencyMs: 200, errorType: null, errorMessage: null, startedAt: "2026-06-08T10:00:02Z", completedAt: "2026-06-08T10:00:03Z" },
    ],
    artifacts: [],
  },
};

test.describe("Projects approval flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  test("renders task tree and approves", async ({ page }) => {
    let approvePayload: unknown = null;
    await page.route("**/api/projects/pr_test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AWAITING_DETAILS),
      });
    });
    await page.route("**/api/projects/pr_test/approve", async (route) => {
      approvePayload = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { projectRunId: "pr_test", status: "running" } }),
      });
    });

    await page.goto("/projects/pr_test");

    await expect(page.locator('[data-testid="task-tree-approval"]')).toBeVisible();
    await expect(page.getByText("awaiting approval")).toBeVisible();

    const taskItems = page.locator('[data-testid="task-list"] > li');
    await expect(taskItems).toHaveCount(2);

    await page.locator('[data-testid="approve-button"]').click();

    expect(approvePayload).toBeTruthy();
    const taskIds = (approvePayload as { taskIds: string[] }).taskIds;
    expect(taskIds).toEqual(["t1", "t2"]);
  });

  test("can deselect a task before approving", async ({ page }) => {
    let approvePayload: unknown = null;
    await page.route("**/api/projects/pr_test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AWAITING_DETAILS),
      });
    });
    await page.route("**/api/projects/pr_test/approve", async (route) => {
      approvePayload = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { projectRunId: "pr_test", status: "running" } }),
      });
    });

    await page.goto("/projects/pr_test");
    await page.locator('[data-testid="task-checkbox-t1"]').uncheck();
    await page.locator('[data-testid="approve-button"]').click();

    const taskIds = (approvePayload as { taskIds: string[] }).taskIds;
    expect(taskIds).toEqual(["t2"]);
  });

  test("delete button is visible in awaiting_approval state", async ({ page }) => {
    await page.route("**/api/projects/pr_test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AWAITING_DETAILS),
      });
    });

    await page.goto("/projects/pr_test");
    await expect(page.locator('[data-testid="delete-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="cancel-button"]')).toBeVisible();
  });

  test("confirming delete sends DELETE request", async ({ page }) => {
    let deletedMethod: string | null = null;
    const deleteRequest = page.waitForRequest(
      (req) => req.url().endsWith("/api/projects/pr_test") && req.method() === "DELETE",
    );
    await page.route("**/api/projects/pr_test", async (route) => {
      if (route.request().method() === "DELETE") {
        deletedMethod = "DELETE";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { deleted: true, id: "pr_test" } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AWAITING_DETAILS),
      });
    });

    await page.goto("/projects/pr_test");
    await page.locator('[data-testid="delete-button"]').click();
    await expect(page.locator('[data-testid="delete-confirm-dialog"]')).toBeVisible();
    await page.locator('[data-testid="delete-confirm"]').click();

    await deleteRequest;
    expect(deletedMethod).toBe("DELETE");
  });
});
