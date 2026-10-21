import { expect, test } from "./support/fixtures";
import type { Page, Response } from "@playwright/test";
import { buildBigPng, seedOrder } from "./support/convex";
import { originalUrlFromDownload } from "./support/download";

// IMG-03 (backlog/IMG-03-stored-web-preview.md) "Done when" 1 and 2.
//
// The picture is uploaded through the real "Add files" input, because the
// preview is made by the upload path (`insertDesignAssets` schedules it). The
// upload is the shared big-PNG fixture's bytes (~3.2 MB, print-size, > 2 MB).
// It is a new blob each time, so each test pays one ~3 MB upload to Convex and
// one in-function read; the browser never pulls the original.
//
// The proof that the Next optimizer resized from the stored preview and not
// the original: the original's storage id (read from the file's Download link,
// which keeps the original URL) never shows up as the `url` of a /_next/image
// request once the preview exists.
//
// Accessible names the build must keep: the "Add files" file input, the
// "Uploaded files" list with data-testid=pool-asset tiles holding a
// "Download" link, <img alt*="main image"> on dashboard/form pictures.

const PREVIEW_WAIT_MS = 30_000;
const isoDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

const storageIdOf = (url: string) => /\/api\/storage\/([^/?#&"'\s]+)/.exec(decodeURIComponent(url))?.[1] ?? null;

/** Uploads the print-size PNG on the design page; returns the original's storage id. */
async function uploadBigPng(page: Page, designId: string) {
  await page.goto(`/portal/designs/${designId}`);
  const png = buildBigPng();
  expect(png.length, "fixture is a print-size PNG").toBeGreaterThan(2 * 1024 * 1024);
  await page.getByLabel(/add files/i).setInputFiles({
    name: "e2e-upload.png",
    mimeType: "image/png",
    buffer: png,
  });
  const tile = page.getByTestId("pool-asset").filter({ hasText: /e2e-upload\.png/i });
  await expect(tile).toBeVisible({ timeout: 30_000 });
  const href = await originalUrlFromDownload(page, tile);
  const original = storageIdOf(href);
  expect(original, "download link points at the original in storage").not.toBeNull();
  return { original: original!, tile };
}

/** Waits until the tile's picture is served from something other than the original. */
async function waitForPreview(tile: ReturnType<Page["getByTestId"]>, original: string) {
  const img = tile.locator("img").first();
  await expect
    .poll(
      async () => {
        const src = await img.evaluate((el: HTMLImageElement) => el.currentSrc || el.src);
        return storageIdOf(src);
      },
      { timeout: PREVIEW_WAIT_MS, message: "tile switches to the stored preview within a few seconds" },
    )
    .not.toBe(original);
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
}

test("a captain uploads a print-size PNG: the tile and the dashboard chip show it from the stored preview, under 1 MB, never the original", async ({
  page,
  tag,
}) => {
  test.setTimeout(180_000);
  const order = seedOrder(tag);
  const images: Response[] = [];
  page.on("response", (r) => {
    if (r.request().resourceType() === "image") images.push(r);
  });

  const { original, tile } = await uploadBigPng(page, order.designId);
  await waitForPreview(tile, original);

  // Start the count once the preview is the thing on screen.
  images.length = 0;
  await page.goto("/portal");
  await expect(page.getByText(order.teamName).first()).toBeVisible();
  const chip = page.locator('img[alt*="main image" i]').first();
  await chip.scrollIntoViewIfNeeded();
  await expect
    .poll(() => chip.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  await page.goto(`/portal/designs/${order.designId}`);
  await expect(page.getByTestId("pool-asset").first()).toBeVisible();
  await page.waitForLoadState("networkidle");

  let total = 0;
  const sources: string[] = [];
  for (const r of images) {
    const u = r.url();
    sources.push(u.includes("/_next/image") ? (new URL(u).searchParams.get("url") ?? "") : u);
    try {
      total += (await r.body()).length;
    } catch {
      // A cancelled request downloaded nothing.
    }
  }
  expect(sources.length, "pictures loaded").toBeGreaterThan(0);
  expect(
    sources.filter((s) => storageIdOf(s) === original),
    "no picture is fetched from the original's storage URL (browser or optimizer)",
  ).toEqual([]);
  expect(total, "image bytes across dashboard + design page").toBeLessThan(1024 * 1024);
});

test("375px: a player opening the order form sees the picture, and neither the page nor its image URLs contain the original's storage URL", async ({
  page,
  browser,
  tag,
}) => {
  test.setTimeout(180_000);
  const order = seedOrder(tag);
  const { original, tile } = await uploadBigPng(page, order.designId);
  await waitForPreview(tile, original);

  await page.goto(`/portal/orders/${order.orderId}`);
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

  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
  });
  const player = await ctx.newPage();
  const imageUrls: string[] = [];
  player.on("response", (r) => {
    if (r.request().resourceType() === "image") imageUrls.push(r.url());
  });
  await player.goto(link);
  await expect(player.getByLabel(/your name/i)).toBeVisible();
  const hero = player.locator('img[alt*="main image" i]').first();
  await expect(hero).toBeVisible();
  await expect
    .poll(() => hero.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  await player.waitForLoadState("networkidle");

  const html = await player.content();
  expect(html, "rendered page never names the original's storage id").not.toContain(original);
  expect(
    imageUrls.filter((u) => decodeURIComponent(u).includes(original)),
    "no image request carries the original's storage URL",
  ).toEqual([]);
  expect(imageUrls.length, "the picture loaded").toBeGreaterThan(0);
  await ctx.close();
});
