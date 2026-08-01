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
 * Four animations are covered, one per mechanism:
 *   1. The pricing tier spotlight (`layoutId`), sampled by viewport x.
 *   2. A landing section reveal (`whileInView`), sampled by transform translateY
 *      — scroll-independent, unlike a viewport position. The reveal also gets an
 *      assertion the spotlight does not need: under `reduce` the section must
 *      still end up at **opacity 1**. Suppressing a reveal must mean "show it
 *      immediately", never "leave it invisible".
 *   3. A staggered card inside a revealed section (`whileInView` + `variants`),
 *      sampled the same way. Its own trigger is a scroll like the reveal's, but
 *      the label reaches it through variant propagation rather than being set on
 *      the element — a second path that has to be suppressed too, and the one
 *      that fails silently if `MotionConfig` ever stops covering children.
 *   4. The hero's staggered load entrance (`variants`), sampled the same way but
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
/**
 * The last of the three process step cards — the one furthest into the stagger,
 * so if any turn of the sequence escapes suppression it is the likeliest to.
 */
const STAGGERED_CARD = '#process li:last-child h3';
/** The hero's headline — last-but-four in the entrance stagger, and the LCP. */
const HERO_ELEMENT = '#top h1';
/**
 * The marketing nav's mobile menu — a `components/ui/*` sheet, and the only
 * such primitive on a route that needs no session. Every one of them (dialog,
 * sheet, popover, select, dropdown, tooltip) composes its enter/exit from the
 * same tw-animate-css custom properties, so this one case exercises the
 * mechanism that suppresses the set. The trigger only exists below the `sm`
 * breakpoint, hence the narrow viewport this sampler uses.
 */
const SHEET_TRIGGER = 'Open menu';
const SHEET_PANEL = '[data-slot="sheet-content"]';
const SHEET_VIEWPORT = { width: 375, height: 812 };
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
 * Scrolls a below-the-fold element into view and returns the translateY and
 * opacity its nearest `[data-reveal]` box held on every frame on the way.
 *
 * translateY rather than viewport position because the trigger for this
 * animation *is* a scroll — a viewport-relative sample could not tell the
 * reveal apart from the scrolling that caused it.
 *
 * `selector` is a landmark inside the animated box rather than the box itself:
 * a section reveal and a staggered card both wear `data-reveal`, so pointing at
 * stable page content and walking up covers both without this sampler needing
 * to know which is which.
 */
async function sampleRevealMotion(browser, reducedMotion, selector) {
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
    await page.waitForSelector(selector, { timeout: 15_000 });
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
    }, selector);

    await page.evaluate(
      sel => document.querySelector(sel).scrollIntoView({ block: 'center' }),
      selector,
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

/**
 * Opens and then closes the marketing nav's mobile menu, returning the
 * translateX its panel held on every frame of both transitions.
 *
 * This is the CSS half of the site's motion story, and it is suppressed by a
 * different mechanism from the other three cases: `MotionConfig` cannot reach
 * an `animate-in`/`animate-out` keyframe, so `app/globals.css` zeroes
 * tw-animate-css's transform inputs under `prefers-reduced-motion` instead.
 * Two independent mechanisms making the same promise is exactly the situation
 * where one silently stops holding, hence a case here.
 *
 * The close half matters as much as the open half: Base UI keeps the panel
 * mounted for the length of its exit animation, so a slide-out is real movement
 * on screen even though React has already been told the sheet is closed.
 */
async function sampleSheetMotion(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: SHEET_VIEWPORT,
    reducedMotion,
  });
  const page = await context.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByRole('button', { name: SHEET_TRIGGER }).waitFor({ timeout: 15_000 });
    // Hydration has to have run before the trigger opens anything.
    await page.waitForTimeout(1000);

    // Re-queries every frame: the panel does not exist before the click and is
    // gone once the exit finishes, so a held reference would be null or stale
    // for most of the recording. Frames where it is absent are simply not
    // sampled — they are not evidence either way.
    await page.evaluate(sel => {
      // `translate`, not `transform`: Tailwind v4 emits `translate-x-*` as the
      // standalone `translate` property, so this panel's computed `transform`
      // reads "none" for the whole slide and a transform sampler would quietly
      // conclude nothing ever moved.
      const offset = style =>
        style.translate === 'none' ? 0 : parseFloat(style.translate) || 0;
      window.__sheetSamples = [];
      const tick = () => {
        const el = document.querySelector(sel);
        if (el) {
          const style = getComputedStyle(el);
          window.__sheetSamples.push({ x: offset(style), opacity: Number(style.opacity) });
        }
        window.__sheetRaf = requestAnimationFrame(tick);
      };
      tick();
    }, SHEET_PANEL);

    await page.getByRole('button', { name: SHEET_TRIGGER }).click();
    await page.waitForSelector(SHEET_PANEL, { timeout: 5_000 });
    await page.waitForTimeout(SAMPLE_MS);

    // Where the open transition came to rest, before the close muddies it.
    const settled = await page.evaluate(sel => {
      const style = getComputedStyle(document.querySelector(sel));
      return {
        x: style.translate === 'none' ? 0 : parseFloat(style.translate) || 0,
        opacity: Number(style.opacity),
      };
    }, SHEET_PANEL);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(SAMPLE_MS);

    const samples = await page.evaluate(() => {
      cancelAnimationFrame(window.__sheetRaf);
      return window.__sheetSamples;
    });
    return { samples, settled };
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

  // Both scroll-triggered entrances get the identical treatment: the section
  // reveal sets the variant on the element, the step card inherits it from a
  // parent's stagger. Same assertions, because the promise to the visitor is
  // the same one and only the propagation path differs.
  for (const [name, selector, noun] of [
    ['reveal', REVEALED_SECTION, 'section'],
    ['card  ', STAGGERED_CARD, 'step card'],
  ]) {
    const revealing = await sampleRevealMotion(browser, 'no-preference', selector);
    const revealStill = await sampleRevealMotion(browser, 'reduce', selector);

    // Recording starts before the scroll, so the opening frames legitimately sit
    // at the armed offset under both preferences — that is a resting start state,
    // not movement. What separates the two is whether the element is ever caught
    // *between* the offset and rest.
    const revealMids = {};
    for (const [label, samples] of [['no-preference', revealing], ['reduce', revealStill]]) {
      const settled = samples.at(-1);
      const mid = intermediates({ start: samples[0].y, end: 0, samples: samples.map(s => s.y) });
      revealMids[label] = mid;
      console.log(`[reduced-motion] ${name} ${label.padEnd(13)} ${samples.length} samples, ${mid.length} in flight, y ${samples[0].y.toFixed(0)} → ${settled.y.toFixed(0)}, settles at opacity ${settled.opacity.toFixed(2)}`);

      // The assertion that outranks every other one here: whatever the motion
      // preference, the content is readable when the dust settles.
      if (settled.opacity < 0.99) {
        failures.push(`${name.trim()}/${label}: the ${noun} settled at opacity ${settled.opacity.toFixed(2)} — revealed content must never be left invisible.`);
      }
      if (Math.abs(settled.y) > EPSILON) {
        failures.push(`${name.trim()}/${label}: the ${noun} settled at translateY ${settled.y.toFixed(1)}px instead of its resting position — the entrance did not complete.`);
      }
      if (Math.abs(samples[0].y) < EPSILON) {
        failures.push(`${name.trim()}/${label}: the ${noun} was already at rest before it scrolled into view — the entrance never armed, so this check proves nothing.`);
      }
    }

    if (revealMids['no-preference'].length === 0) {
      failures.push(`${name.trim()}/no-preference: the ${noun} snapped from its offset to rest — the entrance is not animating at all.`);
    }
    if (revealMids['reduce'].length > 0) {
      failures.push(`${name.trim()}/reduce: the ${noun} animated through ${revealMids['reduce'].length} intermediate positions — reducedMotion="user" is not suppressing the movement.`);
    }
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

  const sheetMoving = await sampleSheetMotion(browser, 'no-preference');
  const sheetStill = await sampleSheetMotion(browser, 'reduce');

  const sheetMids = {};
  for (const [label, result] of [['no-preference', sheetMoving], ['reduce', sheetStill]]) {
    const { samples, settled } = result;
    if (samples.length === 0) {
      failures.push(`sheet/${label}: no samples — the panel never appeared, so this check proves nothing.`);
      sheetMids[label] = [];
      continue;
    }
    // Rest for this element is translateX 0. Anything else is the slide in
    // flight, on the way in or on the way out.
    const mid = samples.filter(s => Math.abs(s.x) > EPSILON);
    sheetMids[label] = mid;
    console.log(`[reduced-motion] sheet  ${label.padEnd(13)} ${samples.length} samples, ${mid.length} in flight, opens to x ${settled.x.toFixed(1)} at opacity ${settled.opacity.toFixed(2)}`);

    // The same rule the reveal gets: suppressing motion must never mean
    // leaving the content unreadable or parked off-screen.
    if (Math.abs(settled.x) > EPSILON) {
      failures.push(`sheet/${label}: the panel settled at translateX ${settled.x.toFixed(1)}px instead of 0 — the entrance did not complete.`);
    }
    if (settled.opacity < 0.99) {
      failures.push(`sheet/${label}: the panel settled at opacity ${settled.opacity.toFixed(2)} — an opened menu must never be left transparent.`);
    }
  }

  if (sheetMids['no-preference'].length === 0) {
    failures.push('sheet/no-preference: the panel never left its resting position — the slide is not running at all, so the suppression below is untested.');
  }
  if (sheetMids['reduce'].length > 0) {
    failures.push(`sheet/reduce: the panel animated through ${sheetMids['reduce'].length} intermediate positions — prefers-reduced-motion is not suppressing the tw-animate-css slide.`);
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
