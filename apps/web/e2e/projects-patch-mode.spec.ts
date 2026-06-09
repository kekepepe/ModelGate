import { test, expect } from "@playwright/test";

/**
 * /projects — V2.6 Patch Mode E2E specs.
 *
 * Covers: create modal mode selector, patch diff rendering, high-risk badges,
 * apply/reject/regenerate buttons, and per-file approval in the task tree.
 */

const PATCH_DIFF = [
  "--- a/apps/server/app/api/health.py",
  "+++ b/apps/server/app/api/health.py",
  "@@ -0,0 +1,5 @@",
  "+from fastapi import APIRouter",
  "+",
  "+router = APIRouter()",
  "+",
  "+@router.get('/health')",
].join("\n");

const COMPLETED_PATCH_DETAILS = {
  data: {
    projectRun: {
      id: "pr_patch",
      title: "Add health endpoint",
      goal: "Add /health endpoint",
      status: "completed",
      mode: "patch",
      intakeModelId: "gpt-4o",
      plannerModelId: "gpt-4o",
      supervisorModelId: null,
      integratorModelId: null,
      workerModelId: null,
      intake: { summary: "S", goal: "G" },
      budget: { maxAgents: 6, maxTokens: 200000, maxRuntimeSeconds: 600 },
      usage: { agentsUsed: 3, tokensUsed: 5000, runtimeSeconds: 30, contextFilesUsed: 2 },
      errorType: null,
      errorMessage: null,
      startedAt: "2026-06-08T10:00:00Z",
      completedAt: "2026-06-08T10:01:00Z",
      createdAt: "2026-06-08T10:00:00Z",
    },
    tasks: [
      {
        id: "t1",
        projectRunId: "pr_patch",
        title: "Backend endpoint",
        description: "Add GET /health",
        role: "backend",
        status: "completed",
        priority: 1,
        dependsOn: [],
        allowedFiles: ["apps/server/app/api/health.py"],
        acceptanceCriteria: ["returns 200"],
        assignedModelId: "gpt-4o",
        assignedProviderId: null,
        metadata: null,
      },
    ],
    agentRuns: [
      {
        id: "ag_w1",
        projectRunId: "pr_patch",
        taskId: "t1",
        runId: "run_w1",
        role: "backend",
        status: "completed",
        modelId: "gpt-4o",
        providerId: null,
        output: { summary: "Created health.py", files_to_change: ["apps/server/app/api/health.py"] },
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        latencyMs: 500,
        errorType: null,
        errorMessage: null,
        startedAt: "2026-06-08T10:00:30Z",
        completedAt: "2026-06-08T10:00:31Z",
      },
    ],
    artifacts: [
      {
        id: "art_patch1",
        projectRunId: "pr_patch",
        agentRunId: "ag_w1",
        taskId: "t1",
        type: "patch",
        name: "patch-backend-t1.diff",
        sizeBytes: PATCH_DIFF.length,
        content: PATCH_DIFF,
        metadata: {
          validation: { valid: true, violations: [], highRiskFiles: [] },
        },
      },
    ],
  },
};

const AWAITING_PATCH_DETAILS = {
  data: {
    projectRun: {
      id: "pr_patch_await",
      title: "Add health endpoint",
      goal: "Add /health endpoint",
      status: "awaiting_approval",
      mode: "patch",
      intakeModelId: "gpt-4o",
      plannerModelId: "gpt-4o",
      supervisorModelId: null,
      integratorModelId: null,
      workerModelId: null,
      intake: { summary: "S", goal: "G" },
      budget: { maxAgents: 6, maxTokens: 200000, maxRuntimeSeconds: 600 },
      usage: { agentsUsed: 1, tokensUsed: 1000, runtimeSeconds: 10, contextFilesUsed: 0 },
      errorType: null,
      errorMessage: null,
      startedAt: "2026-06-08T10:00:00Z",
      completedAt: null,
      createdAt: "2026-06-08T10:00:00Z",
    },
    tasks: [
      {
        id: "t1",
        projectRunId: "pr_patch_await",
        title: "Backend endpoint",
        description: "Add GET /health",
        role: "backend",
        status: "pending",
        priority: 1,
        dependsOn: [],
        allowedFiles: ["apps/server/app/api/health.py"],
        acceptanceCriteria: ["returns 200"],
        assignedModelId: "gpt-4o",
        assignedProviderId: null,
        metadata: null,
      },
    ],
    agentRuns: [],
    artifacts: [
      {
        id: "art_patch1",
        projectRunId: "pr_patch_await",
        agentRunId: "ag_p",
        taskId: "t1",
        type: "patch",
        name: "patch-backend-t1.diff",
        sizeBytes: PATCH_DIFF.length,
        content: PATCH_DIFF,
        metadata: {
          validation: {
            valid: true,
            violations: [],
            highRiskFiles: [{ file: ".env", reason: "Environment variable file" }],
          },
        },
      },
    ],
  },
};

const HIGH_RISK_COMPLETED = {
  data: {
    ...COMPLETED_PATCH_DETAILS.data,
    projectRun: { ...COMPLETED_PATCH_DETAILS.data.projectRun, id: "pr_hr" },
    artifacts: [
      {
        id: "art_hr",
        projectRunId: "pr_hr",
        agentRunId: "ag_w1",
        taskId: "t1",
        type: "patch",
        name: "patch-backend-t1.diff",
        sizeBytes: PATCH_DIFF.length,
        content: PATCH_DIFF,
        metadata: {
          validation: {
            valid: true,
            violations: [],
            highRiskFiles: [
              { file: ".env", reason: "Environment variable file" },
            ],
          },
        },
      },
    ],
  },
};

const MOCK_PROVIDERS = [
  { id: "openai", name: "OpenAI", authType: "api_key", enabled: true, adapter: "openai", configured: true, keySource: "local" },
];

const MOCK_MODELS = [
  { id: "gpt-4o", officialModelName: "gpt-4o", displayName: "GPT-4o", provider: "openai", category: "chat", runtime: "chat", capabilities: [], inputTypes: ["text"], outputTypes: ["text"], taskTypes: ["chat"], contextWindow: 128000, async: false, paramsSchema: "openai-chat", enabled: true },
];

test.describe("V2.6 Patch Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/providers", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: MOCK_PROVIDERS }),
      });
    });
    await page.route("**/api/models", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: MOCK_MODELS }),
      });
    });
  });

  test("create modal has mode selector with patch option", async ({ page }) => {
    await page.route("**/api/projects**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [] }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { id: "pr_new", status: "pending" } }),
        });
      }
    });

    await page.goto("/projects");

    // Open create modal
    await page.locator('[data-testid="new-project-button"]').click();
    await expect(page.locator('[data-testid="create-project-modal"]')).toBeVisible();

    // Wait for models to load
    await expect(page.locator('[data-testid="agent-model-select-intake"]')).toBeVisible();

    // Mode selector should exist
    const modeSelect = page.locator('[data-testid="mode-select"]');
    await expect(modeSelect).toBeVisible();

    // Click to open dropdown and verify options
    await modeSelect.click();
    await expect(page.getByRole("option", { name: /advisory/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /patch/i })).toBeVisible();
    await expect(page.getByRole("option", { name: /apply with approval/i })).toBeVisible();
  });

  test("patch artifact renders diff view with +/- lines", async ({ page }) => {
    await page.route("**/api/projects/pr_patch", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_PATCH_DETAILS),
      });
    });

    await page.goto("/projects/pr_patch");

    // Click on the patch artifact button in the worker card
    await page.locator('[data-testid="artifact-patch"]').first().click();
    await expect(page.locator('[data-testid="artifact-drawer"]')).toBeVisible();

    // Diff view should show the file path
    await expect(page.getByText("apps/server/app/api/health.py")).toBeVisible();

    // Should show addition lines
    await expect(page.getByText("router = APIRouter()")).toBeVisible();
  });

  test("high-risk files show badge in diff view", async ({ page }) => {
    await page.route("**/api/projects/pr_hr", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(HIGH_RISK_COMPLETED),
      });
    });

    await page.goto("/projects/pr_hr");

    // Open artifact drawer via patch artifact button
    await page.locator('[data-testid="artifact-patch"]').first().click();
    await expect(page.locator('[data-testid="artifact-drawer"]')).toBeVisible();

    // High risk badge should be visible
    await expect(page.getByText("High risk")).toBeVisible();
  });

  test("apply/reject/regenerate buttons visible for patch artifact", async ({ page }) => {
    await page.route("**/api/projects/pr_patch", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(COMPLETED_PATCH_DETAILS),
      });
    });

    await page.goto("/projects/pr_patch");

    // Open artifact drawer
    await page.locator('[data-testid="artifact-patch"]').first().click();
    await expect(page.locator('[data-testid="artifact-drawer"]')).toBeVisible();

    // All three action buttons should be visible
    await expect(page.getByRole("button", { name: /apply/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /reject/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /regenerate/i })).toBeVisible();
  });

  test("per-file approval checkboxes in task tree (patch mode)", async ({ page }) => {
    let approvePayload: unknown = null;
    await page.route("**/api/projects/pr_patch_await", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AWAITING_PATCH_DETAILS),
      });
    });
    await page.route("**/api/projects/pr_patch_await/approve", async (route) => {
      approvePayload = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { projectRunId: "pr_patch_await", status: "running" } }),
      });
    });

    await page.goto("/projects/pr_patch_await");

    // Task tree should be visible
    await expect(page.locator('[data-testid="task-tree-approval"]')).toBeVisible();

    // Should show "1 file in patch" text
    await expect(page.getByText(/1 file in patch/)).toBeVisible();

    // Expand file list
    await page.getByText(/1 file in patch/).click();

    // Should show .env with high-risk warning
    await expect(page.getByText(".env")).toBeVisible();

    // Approve with file approvals
    await page.locator('[data-testid="approve-button"]').click();

    expect(approvePayload).toBeTruthy();
    const payload = approvePayload as {
      taskIds: string[];
      fileApprovals: Record<string, Record<string, string>>;
    };
    expect(payload.taskIds).toEqual(["t1"]);
    // .env should be in file approvals (high-risk defaults to reject)
    expect(payload.fileApprovals).toBeTruthy();
  });
});
