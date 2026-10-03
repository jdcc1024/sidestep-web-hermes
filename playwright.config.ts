import { defineConfig, devices } from "@playwright/test";

// E2E layer (JCC, 2026-10-02): customer workflows in a real browser against the
// dev Convex deployment. Every step asserts no console errors and no
// horizontal scroll at 375px (see e2e/support/fixtures.ts). Not part of
// `npm run verify`; ss-sdet runs `npm run e2e` at review.
process.loadEnvFile?.(".env.local");

const BASE = process.env.E2E_BASE ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0, // a flaky test is a bug: no silent retries
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./e2e/support/global-setup.ts",
  use: {
    baseURL: BASE,
    storageState: ".auth/e2e-state.json",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: false } },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
