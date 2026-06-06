import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for ModelGate V2 frontend smoke specs.
 *
 * The dev servers (Next.js on :3000, FastAPI on :8000) must be running
 * before invoking `npx playwright test`. We deliberately do NOT use
 * `webServer` to spawn them — backend startup needs Postgres+Redis and
 * is the user's responsibility.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
