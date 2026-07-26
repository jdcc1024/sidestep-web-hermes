#!/usr/bin/env node
/**
 * snap — screenshot review artifacts for UI work.
 *
 * Captures every given route at 375 / 768 / 1280 wide, in light and dark
 * color schemes, into docs/review/<issueId>/ so a human can critique UX
 * without running the app. Screenshots are gitignored (local review artifacts).
 *
 * Usage:
 *   node scripts/snap.mjs <issueId> <route> [route...]
 *     e.g. node scripts/snap.mjs O-09 /portal/orders/new /portal
 *
 *   node scripts/snap.mjs --login
 *     One-time setup for authenticated pages (/portal, /admin): opens a headed
 *     browser, you sign in with your Clerk dev user, press Enter in the
 *     terminal, and the session is saved to .auth/state.json (gitignored).
 *     All later runs reuse it automatically.
 *
 *     Sign in with a Clerk EMAIL/PASSWORD (or email-code) test user — NOT
 *     "Continue with Google". Google's OAuth page detects CDP-driven browsers
 *     (the mechanism Playwright uses) and blocks sign-in on purpose; no launch
 *     flag defeats this. Clerk's own Cloudflare bot check on the email/password
 *     path IS handled here via @clerk/testing's testing-token bypass, so that
 *     path works without hitting a CAPTCHA at all.
 *
 * Env:
 *   SNAP_BASE  base URL (default http://localhost:8080, per `npm run dev`)
 *   Reads CLERK_SECRET_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from .env.local
 *   for the testing-token bypass (--login only).
 *
 * Requires: npm i -D playwright @clerk/testing && npx playwright install chromium
 * Note: dark mode is emulated via prefers-color-scheme, which next-themes
 * respects when the toggle is on "system" (the default for a fresh profile).
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.SNAP_BASE || 'http://localhost:8080';
const AUTH_STATE = path.join(ROOT, '.auth', 'state.json');
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];
const SCHEMES = ['light', 'dark'];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. Run:\n  npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

async function serverUp() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch { return false; }
}

async function ensureServer() {
  if (await serverUp()) return null;
  console.log(`[snap] No server at ${BASE} — starting \`npm run dev\`...`);
  const child = spawn('npm', ['run', 'dev'], { cwd: ROOT, shell: true, stdio: 'pipe', detached: false });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await serverUp()) { console.log('[snap] Dev server is up.'); return child; }
    await new Promise(r => setTimeout(r, 1500));
  }
  child.kill();
  console.error('[snap] Dev server did not come up within 90s.');
  process.exit(1);
}

function loadEnv() {
  for (const envFile of ['.env.local', '.env']) {
    const envPath = path.join(ROOT, envFile);
    if (fs.existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
      } catch {
        /* ignore error if file missing or invalid */
      }
    }
  }
}

function waitForEnter() {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

async function login() {
  fs.mkdirSync(path.dirname(AUTH_STATE), { recursive: true });
  loadEnv();

  const snapUid = process.env.SNAP_UID;
  const snapPwd = process.env.SNAP_PWD;

  const { clerkSetup, setupClerkTestingToken, clerk } = await import('@clerk/testing/playwright');
  await clerkSetup(); // fetches a testing token from the Clerk Backend API using CLERK_SECRET_KEY

  const server = await ensureServer();
  const userDataDir = path.join(ROOT, '.auth', 'chrome-profile');
  
  const launchOptions = {
    headless: Boolean(snapUid),
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  };

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
      channel: 'chrome',
    });
  } catch {
    context = await chromium.launchPersistentContext(userDataDir, launchOptions);
  }

  await setupClerkTestingToken({ context }); // bypasses Clerk's Cloudflare bot check for this session
  const page = await context.newPage();

  if (snapUid) {
    console.log(`[snap] Programmatically signing in as ${snapUid}...`);
    let loggedIn = false;

    // Primary strategy: @clerk/testing helper
    try {
      await page.goto(BASE);
      if (snapPwd) {
        await clerk.signIn({
          page,
          signInParams: {
            strategy: 'password',
            identifier: snapUid,
            password: snapPwd,
          },
        });
      } else {
        await clerk.signIn({
          page,
          emailAddress: snapUid,
        });
      }
      loggedIn = true;
      console.log('[snap] Programmatic login via @clerk/testing succeeded.');
    } catch (err) {
      console.warn(`[snap] @clerk/testing sign-in error: ${err.message}. Trying UI automation fallback...`);
    }

    // Secondary strategy: Playwright UI automation fallback
    if (!loggedIn) {
      try {
        await page.goto(BASE + '/sign-in');
        const identifierInput = page.locator('input[name="identifier"], input[type="email"], input[name="username"]').first();
        await identifierInput.waitFor({ state: 'visible', timeout: 10000 });
        await identifierInput.fill(snapUid);

        const submitBtn = page.locator('button[type="submit"], button.cl-formButtonPrimary').first();
        await submitBtn.click();

        if (snapPwd) {
          const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
          await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
          await passwordInput.fill(snapPwd);

          const submitPwdBtn = page.locator('button[type="submit"], button.cl-formButtonPrimary').first();
          await submitPwdBtn.click();
        }

        await page.waitForFunction(() => window.Clerk?.user !== null || !window.location.pathname.startsWith('/sign-in'), { timeout: 15000 });
        loggedIn = true;
        console.log('[snap] Programmatic login via UI automation succeeded.');
      } catch (err) {
        console.error(`[snap] Programmatic UI automation failed: ${err.message}`);
      }
    }

    if (!loggedIn) {
      console.error('[snap] Automatic login failed. Falling back to manual intervention...');
      await waitForEnter();
    }
  } else {
    await page.goto(BASE);
    console.log('\n[snap] Sign in with a Clerk EMAIL/PASSWORD (or email-code) test user.');
    console.log('[snap] Do NOT use "Continue with Google" — Google blocks automated browsers at the OAuth step no matter what.');
    console.log('[snap] Then press Enter here to save the session...');
    await waitForEnter();
  }

  await context.storageState({ path: AUTH_STATE });
  await context.close();
  server?.kill();
  console.log(`[snap] Session saved to ${path.relative(ROOT, AUTH_STATE)} — authenticated snaps will now work.`);
}

async function snap(issueId, routes) {
  loadEnv();
  const outDir = path.join(ROOT, 'docs', 'review', issueId);
  fs.mkdirSync(outDir, { recursive: true });
  let hasAuth = fs.existsSync(AUTH_STATE);
  if (!hasAuth && routes.some(r => r.startsWith('/portal') || r.startsWith('/admin'))) {
    if (process.env.SNAP_UID) {
      console.log('[snap] No .auth/state.json found, but SNAP_UID is set in env. Performing automatic login...');
      await login();
      hasAuth = fs.existsSync(AUTH_STATE);
    } else {
      console.warn('[snap] WARNING: no .auth/state.json — authed routes will show the sign-in page. Run `node scripts/snap.mjs --login` once (human task).');
    }
  }

  const server = await ensureServer();
  const browser = await chromium.launch();
  const shots = [];
  try {
    for (const scheme of SCHEMES) {
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: vp,
          colorScheme: scheme,
          ...(hasAuth ? { storageState: AUTH_STATE } : {}),
        });
        const page = await context.newPage();
        for (const route of routes) {
          const slug = route.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '-') || 'home';
          const file = path.join(outDir, `${slug}-w${vp.width}-${scheme}.png`);
          try {
            await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            await page.waitForTimeout(1000); // settle animations/fonts
            await page.screenshot({ path: file, fullPage: true });
            shots.push(path.relative(ROOT, file));
            console.log(`[snap] ${route} @ ${vp.width}px ${scheme} → ${path.relative(ROOT, file)}`);
          } catch (e) {
            console.error(`[snap] FAILED ${route} @ ${vp.width}px ${scheme}: ${e.message.split('\n')[0]}`);
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server?.kill();
  }

  console.log(`\n[snap] ${shots.length}/${routes.length * VIEWPORTS.length * SCHEMES.length} screenshots in ${path.relative(ROOT, outDir)}`);
  if (shots.length < routes.length * VIEWPORTS.length * SCHEMES.length) process.exit(1);
}

// --- main ---
const args = process.argv.slice(2);
if (args[0] === '--login') {
  await login();
} else if (args.length >= 2) {
  await snap(args[0], args.slice(1));
} else {
  console.log('Usage:\n  node scripts/snap.mjs <issueId> <route> [route...]\n  node scripts/snap.mjs --login');
  process.exit(1);
}

