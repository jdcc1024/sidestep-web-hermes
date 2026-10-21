import { expect, test } from "./support/fixtures";
import type { Browser, Page } from "@playwright/test";
import { attachBigPng, seedOrder } from "./support/convex";

// 0004 "tap to enlarge" on desktop: the enlarged picture uses the screen
// (docs/ux/0004-public-form.md §4.6), plus a light backing on the close ✕.
// Measurements are the contract; the look is reviewed from screenshots, so
// everything here is a bounding box or a computed style with a tolerance,
// never a pixel snapshot.
//
// Build must use these accessible names / structure (all as today):
//   trigger     button /view .* full size/i on the design picture
//   frame       [data-slot="dialog-content"] (role=dialog)
//   picture     [data-testid="lightbox-image"]
//   close ✕     the dialog's own button named /close/i
//
// Stand-in pictures: the measuring script's trick. The real lightbox <img>
// gets a canvas-drawn picture of the wanted shape as a blob URL, set as a
// `w`-descriptor srcset entry so the browser sizes it from the img's own
// `sizes`, exactly as it does for a served 2048w preview. Blob URLs are not
// storage egress.

const GREEN = "#0f766e";
const DARK = "#0b0b0b";

const SHAPES = {
  landscape: [2048, 1152], // 16:9
  portrait: [1152, 2048],
  tall: [570, 2048], // 1:3.6
} as const;
type Shape = keyof typeof SHAPES;

const isoDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

// Same as public-form.0004.spec.ts: an admin makes the form and copies the link.
async function makeOrderForm(page: Page, orderId: string) {
  await page.goto(`/portal/orders/${orderId}`);
  await page.getByRole("button", { name: /make an order form/i }).click();
  await page.getByLabel(/deadline/i).fill(isoDate(14));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /make|create|start/i })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/^open$/i)).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: /copy link/i }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/run\/[a-z0-9]+$/);
  return link;
}

// A player is an anonymous browser at the size the test names.
async function openAsPlayer(
  browser: Browser,
  browserErrors: string[],
  link: string,
  size: { width: number; height: number },
  colorScheme: "light" | "dark" = "light",
) {
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: size,
    deviceScaleFactor: 1,
    colorScheme,
  });
  const player = await ctx.newPage();
  player.on("console", (m) => {
    if (
      m.type() === "error" &&
      !/React DevTools|Clerk has been loaded|Fast Refresh|HMR/.test(m.text())
    )
      browserErrors.push(`console: ${m.text()}`);
  });
  player.on("pageerror", (e) => browserErrors.push(`pageerror: ${e.message}`));
  await player.goto(link);
  await expect(player.getByLabel(/your name/i)).toBeVisible();
  return { player, close: () => ctx.close() };
}

async function openLightbox(page: Page) {
  const trigger = page.getByRole("button", { name: /full size/i }).first();
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const img = page.getByTestId("lightbox-image");
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete))
    .toBe(true);
  return { trigger, img };
}

// Swap the lightbox picture for a stand-in of `shape` (or a flat fill) and wait
// for layout to settle.
async function standIn(page: Page, shape: Shape, fill = GREEN) {
  const [w, h] = SHAPES[shape];
  await page.evaluate(
    async ({ w, h, fill }) => {
      const img = document.querySelector(
        '[data-testid="lightbox-image"]',
      ) as HTMLImageElement;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      g.fillStyle = fill;
      g.fillRect(0, 0, w, h);
      const blob = await new Promise<Blob>((r) =>
        c.toBlob((b) => r(b!), "image/png"),
      );
      const u = URL.createObjectURL(blob);
      img.removeAttribute("src");
      img.srcset = `${u} ${w}w`;
      img.src = u;
      await img.decode().catch(() => {});
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
    },
    { w, h, fill },
  );
}

async function boxes(page: Page) {
  const frame = await page.locator('[data-slot="dialog-content"]').boundingBox();
  const pic = await page.getByTestId("lightbox-image").boundingBox();
  const vp = page.viewportSize()!;
  expect(frame, "dialog frame has a box").not.toBeNull();
  expect(pic, "lightbox picture has a box").not.toBeNull();
  return { frame: frame!, pic: pic!, vp };
}

function expectInside(
  frame: { x: number; y: number; width: number; height: number },
  vp: { width: number; height: number },
) {
  expect(frame.x, "frame left edge on screen").toBeGreaterThanOrEqual(-0.5);
  expect(frame.y, "frame top edge on screen").toBeGreaterThanOrEqual(-0.5);
  expect(frame.x + frame.width, "frame right edge on screen").toBeLessThanOrEqual(
    vp.width + 0.5,
  );
  expect(
    frame.y + frame.height,
    "frame bottom edge on screen",
  ).toBeLessThanOrEqual(vp.height + 0.5);
}

// The form behind the lightbox is a long page, so "no scrollbars" means: the
// page doesn't scroll sideways, and the frame itself has nothing to scroll.
async function expectNoScrollbars(page: Page) {
  const o = await page.evaluate(() => {
    const e = document.scrollingElement!;
    const f = document.querySelector('[data-slot="dialog-content"]')!;
    return {
      x: e.scrollWidth - e.clientWidth,
      fx: f.scrollWidth - f.clientWidth,
      fy: f.scrollHeight - f.clientHeight,
    };
  });
  expect(o.x, "page scrolls horizontally").toBeLessThanOrEqual(0);
  expect(o.fx, "frame scrolls horizontally").toBeLessThanOrEqual(0);
  expect(o.fy, "frame scrolls vertically").toBeLessThanOrEqual(0);
}

function expectRatio(
  pic: { width: number; height: number },
  shape: Shape,
) {
  const [w, h] = SHAPES[shape];
  const want = w / h;
  const got = pic.width / pic.height;
  expect(
    Math.abs(got - want) / want,
    `picture ratio ${got.toFixed(3)} vs ${want.toFixed(3)} (not stretched)`,
  ).toBeLessThanOrEqual(0.01);
}

// One seeded order with a real PNG main picture and an order form, then a
// player at `size` with the lightbox open.
async function setup(
  { page, browser, tag, browserErrors }: {
    page: Page;
    browser: Browser;
    tag: string;
    browserErrors: string[];
  },
  size: { width: number; height: number },
  colorScheme: "light" | "dark" = "light",
) {
  const order = seedOrder(tag);
  await attachBigPng(order.designId, true, { withPreview: true });
  const link = await makeOrderForm(page, order.orderId);
  const { player, close } = await openAsPlayer(
    browser,
    browserErrors,
    link,
    size,
    colorScheme,
  );
  return { player, close };
}

test.describe("0004 desktop lightbox", () => {
  // The 375 guard (6) is the one test that runs in the mobile project too;
  // everything else sets its own viewport and needs one run.
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile" && !/^375px/.test(testInfo.title),
      "sets its own viewport; runs once on the desktop project",
    );
  });

  // ── Done when 1 ───────────────────────────────────────────────────────────
  test("1280x800: a 16:9 picture opens wider than 1100px (about 1128), the frame is on screen and nothing scrolls", async ({
    page,
    browser,
    tag,
    browserErrors,
  }) => {
    const { player, close } = await setup(
      { page, browser, tag, browserErrors },
      { width: 1280, height: 800 },
    );
    await openLightbox(player);
    await standIn(player, "landscape");
    const { frame, pic, vp } = await boxes(player);
    expect(pic.width).toBeGreaterThan(1100);
    expect(Math.abs(pic.width - 1128)).toBeLessThanOrEqual(2);
    expectInside(frame, vp);
    await expectNoScrollbars(player);
    await close();
  });

  // ── Done when 2 ───────────────────────────────────────────────────────────
  test("1280x800: a portrait picture opens 720px tall (90vh) with its ratio kept", async ({
    page,
    browser,
    tag,
    browserErrors,
  }) => {
    const { player, close } = await setup(
      { page, browser, tag, browserErrors },
      { width: 1280, height: 800 },
    );
    await openLightbox(player);
    await standIn(player, "portrait");
    const { frame, pic, vp } = await boxes(player);
    expect(Math.abs(pic.height - 720)).toBeLessThanOrEqual(2);
    expectRatio(pic, "portrait");
    expectInside(frame, vp);
    await close();
  });

  // ── Done when 3 ───────────────────────────────────────────────────────────
  test("1920x1080: a 16:9 picture opens 1704px wide and the frame is on screen", async ({
    page,
    browser,
    tag,
    browserErrors,
  }) => {
    const { player, close } = await setup(
      { page, browser, tag, browserErrors },
      { width: 1920, height: 1080 },
    );
    await openLightbox(player);
    await standIn(player, "landscape");
    const { frame, pic, vp } = await boxes(player);
    expect(Math.abs(pic.width - 1704)).toBeLessThanOrEqual(2);
    expectInside(frame, vp);
    await expectNoScrollbars(player);
    await close();
  });

  // ── Done when 4 ───────────────────────────────────────────────────────────
  test("1280x800: a 1:3.6 tall picture opens 720px tall and is not stretched", async ({
    page,
    browser,
    tag,
    browserErrors,
  }) => {
    const { player, close } = await setup(
      { page, browser, tag, browserErrors },
      { width: 1280, height: 800 },
    );
    await openLightbox(player);
    await standIn(player, "tall");
    const { frame, pic, vp } = await boxes(player);
    expect(Math.abs(pic.height - 720)).toBeLessThanOrEqual(2);
    expectRatio(pic, "tall");
    expectInside(frame, vp);
    await close();
  });

  // ── Done when 5 ───────────────────────────────────────────────────────────
  test("the frame is centred: left and right gaps differ by at most 1px at 768, 1280 and 1920", async ({
    page,
    browser,
    tag,
    browserErrors,
  }) => {
    const { player, close } = await setup(
      { page, browser, tag, browserErrors },
      { width: 1280, height: 800 },
    );
    await openLightbox(player);
    await standIn(player, "landscape");
    for (const [width, height] of [
      [768, 1024],
      [1280, 800],
      [1920, 1080],
    ]) {
      await player.setViewportSize({ width, height });
      // `sizes` is viewport-dependent; give layout two frames to settle.
      await player.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      const { frame, vp } = await boxes(player);
      const left = frame.x;
      const right = vp.width - (frame.x + frame.width);
      expect(
        Math.abs(left - right),
        `${width}px: gaps left ${left.toFixed(1)} / right ${right.toFixed(1)}`,
      ).toBeLessThanOrEqual(1);
    }
    await close();
  });

  // ── Done when 6 (guard: passes on main today) ─────────────────────────────
  test("375px: the frame is 359 wide, the picture 343 wide and a tall picture is capped at 80vh", async ({
    page,
    browser,
    tag,
    browserErrors,
  }) => {
    const { player, close } = await setup(
      { page, browser, tag, browserErrors },
      { width: 375, height: 812 },
    );
    await openLightbox(player);
    await standIn(player, "landscape");
    let m = await boxes(player);
    expect(Math.abs(m.frame.width - 359)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.pic.width - 343)).toBeLessThanOrEqual(1);
    await standIn(player, "tall");
    m = await boxes(player);
    expect(m.pic.height).toBeLessThanOrEqual(0.8 * 812 + 1);
    expect(m.pic.height).toBeGreaterThan(0.8 * 812 - 3);
    // No ratio check: at 375 the <img> box is w-full and the picture letterboxes
    // inside it with object-contain, so the box ratio is not the picture's.
    await expectNoScrollbars(player);
    await close();
  });

  // ── Done when 7 ───────────────────────────────────────────────────────────
  test("1280x800 at 1x: the lightbox picture loads from /_next/image at 1080 wide or more", async ({
    page,
    browser,
    tag,
    browserErrors,
  }) => {
    const { player, close } = await setup(
      { page, browser, tag, browserErrors },
      { width: 1280, height: 800 },
    );
    await openLightbox(player);
    const src = await player
      .getByTestId("lightbox-image")
      .evaluate((el: HTMLImageElement) => el.currentSrc);
    expect(src, "lightbox <img> comes through the optimizer").toContain(
      "/_next/image",
    );
    const w = Number(new URL(src).searchParams.get("w"));
    expect(w, `w in ${src}`).toBeGreaterThanOrEqual(1080);
    await close();
  });

  // ── Done when 8 (guard: passes on main today) ─────────────────────────────
  test("Esc closes the lightbox and focus returns to the picture button", async ({
    page,
    browser,
    tag,
    browserErrors,
  }) => {
    const { player, close } = await setup(
      { page, browser, tag, browserErrors },
      { width: 1280, height: 800 },
    );
    const { trigger } = await openLightbox(player);
    await player.keyboard.press("Escape");
    await expect(player.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await close();
  });

  // ── Done when 9 ───────────────────────────────────────────────────────────
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme} theme: the close ✕ has a visible backing over a dark picture`, async ({
      page,
      browser,
      tag,
      browserErrors,
    }) => {
      const { player, close } = await setup(
        { page, browser, tag, browserErrors },
        { width: 1280, height: 800 },
        scheme,
      );
      await openLightbox(player);
      await standIn(player, "landscape", DARK);
      const x = player
        .getByRole("dialog")
        .getByRole("button", { name: /close/i });
      await expect(x).toBeVisible();
      // Resolve whatever colour syntax the browser returns (rgb, oklab...)
      // to sRGBA through a canvas pixel.
      const rgba = await x.evaluate((el) => {
        const bg = getComputedStyle(el).backgroundColor;
        const c = document.createElement("canvas");
        c.width = c.height = 1;
        const g = c.getContext("2d", { willReadFrequently: true })!;
        g.clearRect(0, 0, 1, 1);
        g.fillStyle = bg;
        g.fillRect(0, 0, 1, 1);
        const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
        return { bg, r, g: gr, b, a: a / 255 };
      });
      expect(
        rgba.a,
        `close button background ${rgba.bg} should be mostly opaque, not transparent`,
      ).toBeGreaterThanOrEqual(0.5);
      await close();
    });
  }
});
