import { chromium, type FullConfig } from "@playwright/test";
import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { mkdirSync } from "node:fs";
import { sweepStale } from "./convex";

// Signs in once as the snap test user (SNAP_UID / SNAP_PWD in .env.local) and
// saves the session for every test. Also sweeps E2E rows left behind by a run
// that crashed before its own cleanup.
export default async function globalSetup(config: FullConfig) {
  const uid = process.env.SNAP_UID;
  const pwd = process.env.SNAP_PWD;
  if (!uid || !pwd) throw new Error("SNAP_UID and SNAP_PWD must be set in .env.local");

  sweepStale();

  await clerkSetup();
  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await setupClerkTestingToken({ context });
  const page = await context.newPage();
  await page.goto(baseURL);
  await clerk.signIn({
    page,
    signInParams: { strategy: "password", identifier: uid, password: pwd },
  });
  await page.goto(`${baseURL}/portal`);
  await page.waitForURL(/\/portal/);
  mkdirSync(".auth", { recursive: true });
  await context.storageState({ path: ".auth/e2e-state.json" });
  await browser.close();
}
