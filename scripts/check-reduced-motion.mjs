#!/usr/bin/env node
/**
 * check-reduced-motion — proves the a11y guarantee instead of assuming it.
 *
 * `<MotionConfig reducedMotion="user">` is supposed to suppress transform and
 * layout animations for anyone with the OS preference set. That is a promise
 * made in one place on behalf of every animation on the site, so it gets an
 * automated check rather than a code review.
 *
 * Method: drive the pricing tier spotlight from one card to another in two
 * browser contexts — `reducedMotion: "no-preference"` and `"reduce"` — while a
 * requestAnimationFrame recorder samples the frame's viewport x. Positions that
 * are neither the start nor the end are, by definition, the animation in
 * flight. There must be some under no-preference and none under reduce.
 *
 * Usage:
 *   node scripts/check-reduced-motion.mjs
 *
 * Env:
 *   SNAP_BASE  base URL (default http://localhost:8080, per `npm run dev`)
 *
 * Requires: npm i -D playwright && npx playwright install chromium
 */

import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.SNAP_BASE || 'http://localhost:8080';
const SPOTLIGHT = '[data-testid="tier-spotlight"]';
/** Long enough to cover the spring's whole settle, short enough to stay quick. */
const SAMPLE_MS = 900;

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
  console.log(`[reduced-motion] No server at ${BASE} — starting \`npm run dev\`...`);
  const child = spawn('npm', ['run', 'dev'], { cwd: ROOT, shell: true, stdio: 'pipe', detached: false });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await serverUp()) { console.log('[reduced-motion] Dev server is up.'); return child; }
    await new Promise(r => setTimeout(r, 1500));
  }
  child.kill();
  console.error('[reduced-motion] Dev server did not come up within 90s.');
  process.exit(1);
}

/**
 * Moves the spotlight from the default tier to the top tier and returns every
 * x position the frame occupied on the way.
 */
async function sampleSpotlightMotion(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/#pricing`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(SPOTLIGHT, { timeout: 15_000 });
    // Hydration has to have run before the input drives anything.
    await page.waitForTimeout(1000);

    const start = await page.evaluate(
      sel => document.querySelector(sel).getBoundingClientRect().x,
      SPOTLIGHT,
    );

    // The recorder re-queries every frame on purpose: the frame is a different
    // DOM node in each card, so a held reference would go stale mid-flight.
    await page.evaluate(sel => {
      window.__spotlightSamples = [];
      const tick = () => {
        const el = document.querySelector(sel);
        if (el) window.__spotlightSamples.push(el.getBoundingClientRect().x);
        window.__spotlightRaf = requestAnimationFrame(tick);
      };
      tick();
    }, SPOTLIGHT);

    const input = page.getByLabel('Number of jerseys');
    await input.fill('100');

    await page.waitForTimeout(SAMPLE_MS);
    const samples = await page.evaluate(() => {
      cancelAnimationFrame(window.__spotlightRaf);
      return window.__spotlightSamples;
    });

    const end = await page.evaluate(
      sel => document.querySelector(sel).getBoundingClientRect().x,
      SPOTLIGHT,
    );
    return { start, end, samples };
  } finally {
    await context.close();
  }
}

/** Samples that are neither where it started nor where it ended = animation. */
function intermediates({ start, end, samples }) {
  const near = (a, b) => Math.abs(a - b) < 0.5;
  return samples.filter(x => !near(x, start) && !near(x, end));
}

const server = await ensureServer();
const browser = await chromium.launch();
const failures = [];
try {
  const moving = await sampleSpotlightMotion(browser, 'no-preference');
  const still = await sampleSpotlightMotion(browser, 'reduce');

  for (const [label, result] of [['no-preference', moving], ['reduce', still]]) {
    if (Math.abs(result.end - result.start) < 1) {
      failures.push(`${label}: the spotlight never reached the new tier (x stayed at ${result.start}) — the check itself is broken, not the a11y behaviour.`);
    }
  }

  const movingMid = intermediates(moving);
  const stillMid = intermediates(still);

  console.log(`[reduced-motion] no-preference: ${moving.samples.length} samples, ${movingMid.length} in flight, x ${moving.start.toFixed(0)} → ${moving.end.toFixed(0)}`);
  console.log(`[reduced-motion] reduce:        ${still.samples.length} samples, ${stillMid.length} in flight, x ${still.start.toFixed(0)} → ${still.end.toFixed(0)}`);

  if (movingMid.length === 0) {
    failures.push('no-preference: the spotlight snapped between cards — the layout animation is not running at all.');
  }
  if (stillMid.length > 0) {
    failures.push(`reduce: the spotlight animated through ${stillMid.length} intermediate positions — reducedMotion="user" is not suppressing the layout animation.`);
  }
} finally {
  await browser.close();
  server?.kill();
}

if (failures.length) {
  console.error('\n[reduced-motion] FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[reduced-motion] PASS — movement under no-preference, none under reduce.');
