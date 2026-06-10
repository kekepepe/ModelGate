import { test, expect } from "@playwright/test";

/**
 * /projects/[id] (V2.5 Project Mode) — Agent Board + artifact drawer.
 *
 * Mocks a completed run with all 5 agent roles and 4 artifact types.
 * Verifies the board renders all role cards and the artifact drawer
 * opens on click.
 */

const COMPLETED_DETAILS = {
  data: {
    projectRun: {
      id: "pr_done",
      title: "Done run",
      goal: "Test the agent board",
      status: "completed",
      mode: "advisory",
      plannerModelId: "gpt-4o",
      intake: null,
      budget: { maxAgents: 6, maxTokens: 200000, maxRuntimeSeconds: 600 },
      usage: { agentsUsed: 5, tokensUsed: 6789, runtimeSeconds: 42, contextFilesUsed: 0 },
      errorType: null,
      errorMessage: null,
      startedAt: "2026-06-08T10:00:00Z",
      completedAt: "2026-06-08T10:00:50Z",
      createdAt: "2026-06-08T10:00:00Z",
    },
    tasks: [
      {
        id: "t1",
        projectRunId: "pr_done",
        title: "Backend",
        description: "x",
        role: "backend",
        status: "completed",
        priority: 1,
        dependsOn: [],
        allowedFiles: [],
        acceptanceCriteria: [],
        assignedModelId: null,
        assignedProviderId: null,
        metadata: null,
      },
      {
        id: "t2",
        projectRunId: "pr_done",
        title: "Frontend",
        description: "x",
        role: "frontend",
        status: "completed",
        priority: 1,
        dependsOn: [],
        allowedFiles: [],
        acceptanceCriteria: [],
        assignedModelId: null,
        assignedProviderId: null,
        metadata: null,
      },
    ],
    agentRuns: [
      {
        id: "ag_i",
        projectRunId: "pr_done",
        taskId: null,
        runId: null,
        role: "intake",
        status: "completed",
        modelId: "gpt-4o",
        providerId: null,
        output: null,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        latencyMs: 100,
        errorType: null,
        errorMessage: null,
        startedAt: "2026-06-08T10:00:00Z",
        completedAt: "2026-06-08T10:00:01Z",
      },
      {
        id: "ag_p",
        projectRunId: "pr_done",
        taskId: null,
        runId: null,
        role: "planner",
        status: "completed",
        modelId: "gpt-4o",
        providerId: null,
        output: null,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        latencyMs: 200,
        errorType: null,
        errorMessage: null,
        startedAt: "2026-06-08T10:00:02Z",
        completedAt: "2026-06-08T10:00:03Z",
      },
      {
        id: "ag_w1",
        projectRunId: "pr_done",
        taskId: "t1",
        runId: null,
        role: "backend",
        status: "completed",
        modelId: "gpt-4o",
        providerId: null,
        output: null,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        latencyMs: 300,
        errorType: null,
        errorMessage: null,
        startedAt: "2026-06-08T10:00:04Z",
        completedAt: "2026-06-08T10:00:07Z",
      },
      {
        id: "ag_w2",
        projectRunId: "pr_done",
        taskId: "t2",
        runId: null,
        role: "frontend",
        status: "completed",
        modelId: "gpt-4o",
        providerId: null,
        output: null,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        latencyMs: 300,
        errorType: null,
        errorMessage: null,
        startedAt: "2026-06-08T10:00:04Z",
        completedAt: "2026-06-08T10:00:07Z",
      },
      {
        id: "ag_s",
        projectRunId: "pr_done",
        taskId: null,
        runId: null,
        role: "supervisor",
        status: "completed",
        modelId: "gpt-4o",
        providerId: null,
        output: null,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        latencyMs: 300,
        errorType: null,
        errorMessage: null,
        startedAt: "2026-06-08T10:00:08Z",
        completedAt: "2026-06-08T10:00:09Z",
      },
      {
        id: "ag_in",
        projectRunId: "pr_done",
        taskId: null,
        runId: null,
        role: "integrator",
        status: "completed",
        modelId: "gpt-4o",
        providerId: null,
        output: null,
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        latencyMs: 300,
        errorType: null,
        errorMessage: null,
        startedAt: "2026-06-08T10:00:10Z",
        completedAt: "2026-06-08T10:00:11Z",
      },
    ],
    artifacts: [
      {
        id: "art_plan",
        projectRunId: "pr_done",
        taskId: null,
        agentRunId: "ag_p",
        type: "plan",
        name: "plan.json",
        content: { tasks: [] },
        contentKind: "json",
        sizeBytes: 1024,
        truncated: false,
        metadata: null,
        createdAt: "2026-06-08T10:00:03Z",
      },
      {
        id: "art_w1",
        projectRunId: "pr_done",
        taskId: "t1",
        agentRunId: "ag_w1",
        type: "worker",
        name: "worker-backend-t1.json",
        content: { ok: true },
        contentKind: "json",
        sizeBytes: 2048,
        truncated: false,
        metadata: null,
        createdAt: "2026-06-08T10:00:07Z",
      },
      {
        id: "art_rev",
        projectRunId: "pr_done",
        taskId: null,
        agentRunId: "ag_s",
        type: "review",
        name: "review.md",
        content: '{"pass": true}',
        contentKind: "json",
        sizeBytes: 256,
        truncated: false,
        metadata: null,
        createdAt: "2026-06-08T10:00:09Z",
      },
      {
        id: "art_final",
        projectRunId: "pr_done",
        taskId: null,
        agentRunId: "ag_in",
        type: "final_plan",
        name: "final-plan.md",
        content: "# Plan",
        contentKind: "text",
        sizeBytes: 512,
        truncated: false,
        metadata: null,
        createdAt: "2026-06-08T10:00:11Z",
      },
    ],
  },
};

test.describe("Projects agent board", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });
  });

  test("renders agent board with all role cards", async ({ page }) => {
    await page.route("**/api/projects/pr_done", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_DETAILS),
      });
    });

    await page.goto("/projects/pr_done");

    const board = page.locator('[data-testid="agent-board"]');
    await expect(board).toBeVisible();

    // Should show Intake, Planner, Worker (backend + frontend), Supervisor, Integrator
    await expect(page.getByText("Intake", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Planner", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Worker · backend").first()).toBeVisible();
    await expect(page.getByText("Worker · frontend").first()).toBeVisible();
    await expect(page.getByText("Supervisor", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Integrator", { exact: true }).first()).toBeVisible();
  });

  test("budget meter shows usage", async ({ page }) => {
    await page.route("**/api/projects/pr_done", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_DETAILS),
      });
    });

    await page.goto("/projects/pr_done");
    await expect(page.locator('[data-testid="budget-meter"]')).toBeVisible();
    await expect(page.locator('[data-testid="budget-tokens"]')).toContainText("6789");
  });

  test("opens artifact drawer on click", async ({ page }) => {
    await page.route("**/api/projects/pr_done", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_DETAILS),
      });
    });

    await page.goto("/projects/pr_done");
    await expect(page.locator('[data-testid="agent-board"]')).toBeVisible();
    // Click artifact button — use evaluate to bypass ReactFlow pane interception.
    await page.evaluate(() => {
      (document.querySelector('[data-testid="artifact-final_plan"]') as HTMLElement)?.click();
    });
    await expect(page.locator('[data-testid="artifact-drawer"]')).toBeVisible();
    await expect(page.locator('[data-testid="artifact-content"]')).toContainText("# Plan");
  });

  test("completed status shows no cancel button", async ({ page }) => {
    await page.route("**/api/projects/pr_done", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_DETAILS),
      });
    });

    await page.goto("/projects/pr_done");
    await expect(page.locator('[data-testid="cancel-button"]')).toHaveCount(0);
  });

  test("always renders the 5 role cards even with no agent runs", async ({ page }) => {
    const emptyDetails = {
      data: {
        projectRun: {
          id: "pr_empty",
          title: "Empty run",
          goal: "g",
          status: "pending",
          mode: "advisory",
          plannerModelId: null,
          intake: null,
          budget: null,
          usage: { agentsUsed: 0, tokensUsed: 0, runtimeSeconds: 0, contextFilesUsed: 0 },
          errorType: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          createdAt: "2026-06-08T10:00:00Z",
        },
        tasks: [],
        agentRuns: [],
        artifacts: [],
      },
    };

    await page.route("**/api/projects/pr_empty", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyDetails),
      });
    });

    await page.goto("/projects/pr_empty");
    const board = page.locator('[data-testid="agent-board"]');
    await expect(board).toBeVisible();

    // The 4 fixed-role cards should always be visible (intake / planner / supervisor / integrator).
    await expect(page.locator('[data-testid="agent-card-intake"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-card-planner"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-card-supervisor"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-card-integrator"]')).toBeVisible();

    // No worker cards should appear (no tasks yet).
    await expect(page.locator('[data-testid^="agent-card-worker-"]')).toHaveCount(0);
  });

  test("clicking the planner card shows inspector panel with stats", async ({ page }) => {
    await page.route("**/api/projects/pr_done", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_DETAILS),
      });
    });

    await page.goto("/projects/pr_done");
    await expect(page.locator('[data-testid="agent-board"]')).toBeVisible();

    // Click the planner card header — use evaluate to bypass ReactFlow pane interception.
    await page.evaluate(() => {
      (document.querySelector('[data-testid="agent-card-planner-header"]') as HTMLElement)?.click();
    });

    const inspector = page.locator('[data-testid="agent-run-inspector"]');
    await expect(inspector).toBeVisible();

    // Stats grid renders model + tokens.
    await expect(page.locator('[data-testid="agent-run-inspector-stats"]')).toContainText("gpt-4o");
    await expect(page.locator('[data-testid="agent-run-inspector-stats"]')).toContainText("10");
    await expect(page.locator('[data-testid="agent-run-inspector-stats"]')).toContainText("20");

    // Prompt and output sections render (collapsed by default, click to expand).
    const promptToggle = inspector.locator("button", { hasText: "Prompt" });
    await expect(promptToggle).toBeVisible();
    await promptToggle.click();
    await expect(page.locator('[data-testid="agent-run-inspector-prompt"]')).toBeVisible();
  });

  test("renders the agent board as a layered DAG (Intake→Planner→Workers→Supervisor→Integrator)", async ({
    page,
  }) => {
    await page.route("**/api/projects/pr_done", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_DETAILS),
      });
    });

    await page.goto("/projects/pr_done");

    // ReactFlow mounted with the agent board container.
    const board = page.locator('[data-testid="agent-board"]');
    await expect(board).toBeVisible();

    // ReactFlow renders a viewport and nodes inside the container.
    await expect(board.locator(".react-flow__viewport")).toBeVisible();

    // All 6 role cards are present as ReactFlow nodes.
    await expect(board.locator('[data-testid="agent-card-intake"]')).toBeVisible();
    await expect(board.locator('[data-testid="agent-card-planner"]')).toBeVisible();
    await expect(board.locator('[data-testid="agent-card-worker-t1"]')).toBeVisible();
    await expect(board.locator('[data-testid="agent-card-worker-t2"]')).toBeVisible();
    await expect(board.locator('[data-testid="agent-card-supervisor"]')).toBeVisible();
    await expect(board.locator('[data-testid="agent-card-integrator"]')).toBeVisible();

    // Edges (SVG paths) are drawn between nodes.
    const edgeCount = await board.locator(".react-flow__edge").count();
    expect(edgeCount).toBeGreaterThanOrEqual(5); // intake→planner + planner→w1/w2 + w1/w2→supervisor + supervisor→integrator

    // Completed status drives the green border on intake/planner/supervisor/integrator.
    await expect(board.locator('[data-testid="agent-card-intake"]')).toHaveClass(
      /border-emerald-400/,
    );
    await expect(board.locator('[data-testid="agent-card-integrator"]')).toHaveClass(
      /border-emerald-400/,
    );
  });

  test("renders the debug table view with all agent rows", async ({ page }) => {
    await page.route("**/api/projects/pr_done", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_DETAILS),
      });
    });

    await page.goto("/projects/pr_done");

    const table = page.locator('[data-testid="agent-run-table"]');
    await expect(table).toBeVisible();

    // Should have rows for each agent run (6 total: intake, planner, 2 workers, supervisor, integrator)
    await expect(table.locator("tbody tr")).toHaveCount(6);
  });

  test("table row click selects agent and highlights in inspector", async ({ page }) => {
    await page.route("**/api/projects/pr_done", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_DETAILS),
      });
    });

    await page.goto("/projects/pr_done");

    // Click the planner row in the table
    const plannerRow = page.locator('[data-testid="agent-run-table-row-planner"]');
    await plannerRow.click();

    // Inspector should show planner details
    const inspector = page.locator('[data-testid="agent-run-inspector"]');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("Planner");
  });
});
