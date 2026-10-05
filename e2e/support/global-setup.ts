import { chromium, type Browser, type FullConfig } from "@playwright/test";
import {
  clerk,
  clerkSetup,
  setupClerkTestingToken,
} from "@clerk/testing/playwright";
import { mkdirSync } from "node:fs";
import { captainConfigured, sweepStale } from "./convex";

// Signs in once per test account and saves each session:
//  - SNAP_UID / SNAP_PWD (an admin) → .auth/e2e-state.json, the default.
//  - E2E_CAPTAIN_UID / E2E_CAPTAIN_PWD (a non-admin, optional) →
//    .auth/e2e-captain.json, for checks of what a plain captain can't do.
// Then sweeps E2E rows left behind by a run that crashed before cleanup.
async function signIn(
  browser: Browser,
  baseURL: string,
  uid: string,
  pwd: string,
  file: string,
) {
  const context = await browser.newContext();
  await setupClerkTestingToken({ context });
  const page = await context.newPage();
  await page.goto(baseURL);
  await clerk.signIn({
    page,
    signInParams: { strategy: "password", identifier: uid, password: pwd },
  });
  // Opening the portal creates the users row on first sign-in.
  await page.goto(`${baseURL}/portal`);
  await page.waitForURL(/\/portal/);
  await page.waitForLoadState("networkidle");
  await context.storageState({ path: file });
  await context.close();
}

export default async function globalSetup(config: FullConfig) {
  const uid = process.env.SNAP_UID;
  const pwd = process.env.SNAP_PWD;
  if (!uid || !pwd)
    throw new Error("SNAP_UID and SNAP_PWD must be set in .env.local");

  await clerkSetup();
  const baseURL = config.projects[0].use.baseURL!;
  mkdirSync(".auth", { recursive: true });
  const browser = await chromium.launch();
  await signIn(browser, baseURL, uid, pwd, ".auth/e2e-state.json");
  if (captainConfigured()) {
    await signIn(
      browser,
      baseURL,
      process.env.E2E_CAPTAIN_UID!,
      process.env.E2E_CAPTAIN_PWD!,
      ".auth/e2e-captain.json",
    );
  }
  await browser.close();

  sweepStale();
}
