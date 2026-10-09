import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import type { Page, Response } from "@playwright/test";
import { attachBigPng, seedOrder } from "./support/convex";

// 0004 R3-02 big design pictures on the public form, resized by next/image
// (backlog/R3-02-design-picture-web-preview.md "Done when" 1;
// docs/architecture/0004-image-previews.md).
//
// JCC (mini gate, 2026-10-09): "Tap to enlarge" loads the screen-sized
// `lightbox` preset (<= 2048w), never the print file. The print file's storage
// URL being reachable through /_next/image is accepted, so it isn't tested.
//
// Same accessible names as e2e/public-form.0004.spec.ts: the picture is
// <img alt="<title> main image">; the zoomable one is a button /full size/i
// that opens a dialog holding the picture again.

const isoDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

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

test("375px: a print-size PNG main picture shows on the form, the page downloads under 300 KB of images, and tap-to-enlarge never fetches the print file", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  const order = seedOrder(tag);
  const { bytes } = await attachBigPng(order.designId);
  expect(bytes, "fixture is a print-size PNG").toBeGreaterThan(2 * 1024 * 1024);
  const link = await makeOrderForm(page, order.orderId);

  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
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
  const images: Response[] = [];
  player.on("response", (r) => {
    if (r.request().resourceType() === "image") images.push(r);
  });

  await player.goto(link);
  await expect(player.getByLabel(/your name/i)).toBeVisible();

  // The picture shows (a real decoded image, not the placeholder or a broken <img>).
  const hero = player.locator('img[alt*="main image" i]').first();
  await expect(hero).toBeVisible();
  await expect
    .poll(() => hero.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);

  // Tap to enlarge: the dialog shows the picture, decoded, and fits the screen.
  await player.getByRole("button", { name: /full size/i }).click();
  const dialog = player.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const big = dialog.locator('img[alt*="main image" i]');
  await expect(big).toBeVisible();
  await expect
    .poll(() => big.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  const lightboxSrc = await big.evaluate(
    (el: HTMLImageElement) => el.currentSrc || el.src,
  );
  await expectNoHorizontalScroll(player);

  // Let the network settle, then add up every image the page downloaded.
  await player.waitForLoadState("networkidle");
  let total = 0;
  const urls: string[] = [];
  for (const r of images) {
    urls.push(r.url());
    try {
      total += (await r.body()).length;
    } catch {
      // A response whose body is gone (cancelled request) downloaded nothing.
    }
  }

  expect(
    total,
    `image bytes on the page (${urls.length} responses)`,
  ).toBeLessThan(300 * 1024);

  // Resized by the optimizer: the browser asked Next, never storage directly,
  // for the hero or for the lightbox.
  expect(
    lightboxSrc,
    "lightbox picture is served by the optimizer, not the original",
  ).toContain("/_next/image");
  expect(
    urls.filter(
      (u) => /\/api\/storage\//.test(u) && !u.includes("/_next/image"),
    ),
    "no direct download of the stored print file",
  ).toEqual([]);
  expect(
    urls.some((u) => u.includes("/_next/image")),
    "at least one picture came through /_next/image",
  ).toBe(true);

  // The lightbox preset is screen-sized, capped at 2048w.
  const widths = urls
    .map((u) => Number(new URL(u).searchParams.get("w")))
    .filter(Boolean);
  expect(Math.max(...widths)).toBeLessThanOrEqual(2048);

  await ctx.close();
});
