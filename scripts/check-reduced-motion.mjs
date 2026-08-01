#!/usr/bin/env node
/**
 * check-reduced-motion — proves the a11y guarantee instead of assuming it.
 *
 * `<MotionConfig reducedMotion="user">` is supposed to suppress transform and
 * layout animations for anyone with the OS preference set. That is a promise
 * made in one place on behalf of every animation on the site, so it gets an
 * automated check rather than a code review.
 *
 * Method: drive an animation in two browser contexts —
 * `reducedMotion: "no-preference"` and `"reduce"` — while a requestAnimationFrame
 * recorder samples the moving element. Positions that are neither the start nor
 * the end are, by definition, the animation in flight. There must be some under
 * no-preference and none under reduce.
 *
 * Three animations are covered, one per mechanism:
 *   1. The pricing tier spotlight (`layoutId`), sampled by viewport x.
 *   2. A landing section reveal (`whileInView`), sampled by transform translateY
 *      — scroll-independent, unlike a viewport position. The reveal also gets an
 *      assertion the spotlight does not need: under `reduce` the section must
 *      still end up at **opacity 1**. Suppressing a reveal must mean "show it
 *      immediately", never "leave it invisible".
 *   3. The hero's staggered load entrance (`variants`), sampled the same way but
 *      recorded from document start, because its trigger is mount rather than
 *      anything this script can perform.
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
/** A section far enough down the landing page to be reliably below the fold. */
const REVEALED_SECTION = '#faq';
/** The hero's headline — last-but-four in the entrance stagger, and the LCP. */
const HERO_ELEMENT = '#top h1';
/** Long enough to cover the spring's whole settle, short enough to stay quick. */
const SAMPLE_MS = 900;
/** Sub-pixel jitter that should not count as movement. */
const EPSILON = 0.5;

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
  const near = (a, b) => Math.abs(a - b) < EPSILON;
  return samples.filter(x => !near(x, start) && !near(x, end));
}

/**
 * Scrolls a below-the-fold section into view and returns the translateY and
 * opacity it held on every frame on the way.
 *
 * translateY rather than viewport position because the trigger for this
 * animation *is* a scroll — a viewport-relative sample could not tell the
 * reveal apart from the scrolling that caused it.
 */
async function sampleRevealMotion(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion,
  });
  // <Reveal> settles instantly for `navigator.webdriver` renderers, because a
  // fullPage screenshot never scrolls and would otherwise capture blank
  // sections. This check is the one automated caller that wants the human path,
  // so it says it is human. Without this the reveal would arrive already at
  // rest and the assertions below would be measuring nothing.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await context.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(REVEALED_SECTION, { timeout: 15_000 });
    // Hydration has to have run before Motion is holding anything back.
    await page.waitForTimeout(1000);

    await page.evaluate(sel => {
      const el = document.querySelector(sel).closest('[data-reveal]');
      if (!el) throw new Error(`${sel} is not inside a [data-reveal] wrapper`);
      window.__revealSamples = [];
      const tick = () => {
        const style = getComputedStyle(el);
        const matrix = new DOMMatrixReadOnly(
          style.transform === 'none' ? '' : style.transform,
        );
        window.__revealSamples.push({ y: matrix.m42, opacity: Number(style.opacity) });
        window.__revealRaf = requestAnimationFrame(tick);
      };
      tick();
    }, REVEALED_SECTION);

    await page.evaluate(
      sel => document.querySelector(sel).scrollIntoView({ block: 'center' }),
      REVEALED_SECTION,
    );

    await page.waitForTimeout(SAMPLE_MS);
    return await page.evaluate(() => {
      cancelAnimationFrame(window.__revealRaf);
      return window.__revealSamples;
    });
  } finally {
    await context.close();
  }
}

/**
 * Records the hero headline's translateY and opacity across its load entrance.
 *
 * The other two samplers can arm a recorder and *then* trigger the animation.
 * This one cannot: the trigger is mount, so by the time `page.goto` resolves the
 * entrance is already underway. The recorder therefore goes in via
 * `addInitScript`, which runs before any page script, and polls for the element
 * — the armed `translateY` is in the server HTML, so it is being sampled from
 * the first frame the headline exists.
 */
async function sampleHeroEntrance(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion,
  });
  // Same reasoning as the reveal sampler: the hero settles instantly for
  // `navigator.webdriver` renderers so that screenshots are not a race against
  // it. This check is the one automated caller that wants the animation to play.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await context.addInitScript(sel => {
    window.__heroSamples = [];
    const tick = () => {
      const el = document.querySelector(sel);
      if (el) {
        const style = getComputedStyle(el);
        const matrix = new DOMMatrixReadOnly(
          style.transform === 'none' ? '' : style.transform,
        );
        window.__heroSamples.push({ y: matrix.m42, opacity: Number(style.opacity) });
      }
      window.__heroRaf = requestAnimationFrame(tick);
    };
    tick();
  }, HERO_ELEMENT);

  const page = await context.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(HERO_ELEMENT, { timeout: 15_000 });
    // Long enough to cover hydration plus the whole stagger, which is budgeted
    // to be at rest inside 0.8s of paint.
    await page.waitForTimeout(2000);
    return await page.evaluate(() => {
      cancelAnimationFrame(window.__heroRaf);
      return window.__heroSamples;
    });
  } finally {
    await context.close();
  }
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

  const revealing = await sampleRevealMotion(browser, 'no-preference');
  const revealStill = await sampleRevealMotion(browser, 'reduce');

  // Recording starts before the scroll, so the opening frames legitimately sit
  // at the armed offset under both preferences — that is a resting start state,
  // not movement. What separates the two is whether the element is ever caught
  // *between* the offset and rest.
  const revealMids = {};
  for (const [label, samples] of [['no-preference', revealing], ['reduce', revealStill]]) {
    const settled = samples.at(-1);
    const mid = intermediates({ start: samples[0].y, end: 0, samples: samples.map(s => s.y) });
    revealMids[label] = mid;
    console.log(`[reduced-motion] reveal ${label.padEnd(13)} ${samples.length} samples, ${mid.length} in flight, y ${samples[0].y.toFixed(0)} → ${settled.y.toFixed(0)}, settles at opacity ${settled.opacity.toFixed(2)}`);

    // The assertion that outranks every other one here: whatever the motion
    // preference, the section is readable when the dust settles.
    if (settled.opacity < 0.99) {
      failures.push(`reveal/${label}: the section settled at opacity ${settled.opacity.toFixed(2)} — revealed content must never be left invisible.`);
    }
    if (Math.abs(settled.y) > EPSILON) {
      failures.push(`reveal/${label}: the section settled at translateY ${settled.y.toFixed(1)}px instead of its resting position — the reveal did not complete.`);
    }
    if (Math.abs(samples[0].y) < EPSILON) {
      failures.push(`reveal/${label}: the section was already at rest before it scrolled into view — the reveal never armed, so this check proves nothing.`);
    }
  }

  if (revealMids['no-preference'].length === 0) {
    failures.push('reveal/no-preference: the section snapped from its offset to rest — the reveal is not animating at all.');
  }
  if (revealMids['reduce'].length > 0) {
    failures.push(`reveal/reduce: the section animated through ${revealMids['reduce'].length} intermediate positions — reducedMotion="user" is not suppressing the reveal's movement.`);
  }

  const heroMoving = await sampleHeroEntrance(browser, 'no-preference');
  const heroStill = await sampleHeroEntrance(browser, 'reduce');

  const heroMids = {};
  for (const [label, samples] of [['no-preference', heroMoving], ['reduce', heroStill]]) {
    if (samples.length === 0) {
      failures.push(`hero/${label}: no samples — the recorder never found ${HERO_ELEMENT}.`);
      heroMids[label] = [];
      continue;
    }
    const settled = samples.at(-1);
    const mid = intermediates({ start: samples[0].y, end: 0, samples: samples.map(s => s.y) });
    heroMids[label] = mid;
    console.log(`[reduced-motion] hero   ${label.padEnd(13)} ${samples.length} samples, ${mid.length} in flight, y ${samples[0].y.toFixed(0)} → ${settled.y.toFixed(0)}, settles at opacity ${settled.opacity.toFixed(2)}`);

    if (settled.opacity < 0.99) {
      failures.push(`hero/${label}: the headline settled at opacity ${settled.opacity.toFixed(2)} — the hero must never be left invisible.`);
    }
    if (Math.abs(settled.y) > EPSILON) {
      failures.push(`hero/${label}: the headline settled at translateY ${settled.y.toFixed(1)}px instead of its resting position — the entrance did not complete.`);
    }
    if (Math.abs(samples[0].y) < EPSILON) {
      failures.push(`hero/${label}: the headline was already at rest in the server HTML — the entrance never armed, so this check proves nothing.`);
    }
  }

  if (heroMids['no-preference'].length === 0) {
    failures.push('hero/no-preference: the headline snapped from its offset to rest — the load entrance is not animating at all.');
  }
  if (heroMids['reduce'].length > 0) {
    failures.push(`hero/reduce: the headline animated through ${heroMids['reduce'].length} intermediate positions — reducedMotion="user" is not suppressing the load entrance.`);
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
