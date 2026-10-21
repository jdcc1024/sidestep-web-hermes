import { expect, test } from "./support/fixtures";
import type { Browser, Page } from "@playwright/test";
import { attachBigPng, seedOrder } from "./support/convex";

// 0004 "tap to enlarge" on the public order form: a player opens a design's
// picture, sees it, and closes it. Two workflows; both fail on any browser
// console error or Next.js error overlay.
//
// Pixel geometry (frame/picture sizes at 375, 768, 1280, 1920; portrait and
// tall pictures; centring; the close ✕ backing in light and dark) used to be
// 8 more tests measuring one CSS rule at different sizes. It is reviewed by eye
// from screenshots (docs/ux/0004-public-form.md §4.6). The "which width does
// the browser fetch" rule is a .ts test: lib/images.lightbox.test.ts.
//
// Build must use these accessible names / structure (all as today):
//   trigger     button /view .* full size/i on the design picture
//   frame       role=dialog
//   picture     [data-testid="lightbox-image"]
//   close ✕     the dialog's own button named /close/i

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

// A player is an anonymous browser at 1280x800.
async function openAsPlayer(
  browser: Browser,
  browserErrors: string[],
  link: string,
) {
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
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

// The picture really arrived: decoded, with a size, from the image optimizer.
async function expectPictureShown(page: Page) {
  const shown = await page
    .getByTestId("lightbox-image")
    .evaluate((el: HTMLImageElement) => ({
      w: el.naturalWidth,
      h: el.naturalHeight,
      src: el.currentSrc,
    }));
  expect(shown.w, `picture decoded (${shown.src})`).toBeGreaterThan(0);
  expect(shown.h).toBeGreaterThan(0);
  expect(shown.src, "lightbox <img> comes through the optimizer").toContain(
    "/_next/image",
  );
}

// Next's dev error overlay: <nextjs-portal> is always mounted, but its error
// dialog (data-nextjs-dialog-content / -error-overlay-nav) exists only when
// there is an error to show. Checked non-vacuous with a thrown rejection.
async function expectNoNextErrorOverlay(page: Page) {
  await expect(
    page.locator(
      "[data-nextjs-dialog-content], [data-nextjs-error-overlay-nav]",
    ),
  ).toHaveCount(0);
}

async function setup({
  page,
  browser,
  tag,
  browserErrors,
}: {
  page: Page;
  browser: Browser;
  tag: string;
  browserErrors: string[];
}) {
  const order = seedOrder(tag);
  await attachBigPng(order.designId, true, { withPreview: true });
  const link = await makeOrderForm(page, order.orderId);
  return openAsPlayer(browser, browserErrors, link);
}

test.describe("0004 lightbox", () => {
  // Sets its own viewport; one run on the desktop project is enough.
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "sets its own viewport; runs once on the desktop project",
    );
  });

  test("a player opens a design's picture, sees it, and closes it with the ✕", async ({
    page,
    browser,
    tag,
    browserErrors,
  }) => {
    const { player, close } = await setup({ page, browser, tag, browserErrors });
    const { trigger } = await openLightbox(player);
    await expectPictureShown(player);
    await expectNoNextErrorOverlay(player);

    await player
      .getByRole("dialog")
      .getByRole("button", { name: /close/i })
      .click();
    await expect(player.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeVisible();
    await expectNoNextErrorOverlay(player);
    await close();
  });

  test("Esc closes the lightbox, focus returns to the picture button, and it opens again", async ({
    page,
    browser,
    tag,
    browserErrors,
  }) => {
    const { player, close } = await setup({ page, browser, tag, browserErrors });
    const { trigger } = await openLightbox(player);
    await player.keyboard.press("Escape");
    await expect(player.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // The first close left nothing stuck.
    await openLightbox(player);
    await expectPictureShown(player);
    await expectNoNextErrorOverlay(player);
    await close();
  });
});
