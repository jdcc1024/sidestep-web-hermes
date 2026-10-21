import { expect, test } from "./support/fixtures";
import type { Page } from "@playwright/test";
import { attachBigPng, seedOrder } from "./support/convex";
import { originalUrlFromDownload } from "./support/download";

// IMG-04 (backlog/IMG-04-pictures-only-from-preview.md) "Done when" 1 and 2:
// no picture on screen is ever the original print file. JCC (Gate 1,
// 2026-10-20): no fallback to the original; a picture with no preview yet
// shows the placeholder.
//
// The IMG-02 egress guard stays on (support/fixtures.ts): any bytes pulled
// straight from /api/storage/ fail the test too.
//
// Accessible names the build must keep: the "Add files" file input, the
// "Uploaded files" tiles data-testid=pool-asset holding a "Download" link and
// the tile's <img>; <img alt*="main image"> on form/dashboard pictures; the
// order-form flow ("Make an order form", "Deadline", "Copy link").

const PREVIEW_WAIT_MS = 30_000;
const isoDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

const STORAGE_ID = /\/api\/storage\/([^/?#&"'\s\\]+)/;
const storageIdOf = (url: string) =>
  STORAGE_ID.exec(decodeURIComponent(url))?.[1] ?? null;

// A 4000x1000 vector picture: bigger than the 2048 box, so the preview is a
// real rasterisation and not the file itself.
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="1000" viewBox="0 0 4000 1000">' +
    '<rect width="4000" height="1000" fill="#c82828"/>' +
    '<circle cx="2000" cy="500" r="400" fill="#f5f5f5"/></svg>',
);

/** Every picture source on the page: <img> src/currentSrc/srcset, decoded. */
async function pictureSources(page: Page): Promise<string[]> {
  const raw = await page.evaluate(() =>
    Array.from(document.images).flatMap((img) => [
      img.currentSrc,
      img.src,
      ...img.srcset.split(",").map((s) => s.trim().split(/\s+/)[0] ?? ""),
    ]),
  );
  return raw.filter(Boolean).map((u) => decodeURIComponent(u));
}

test("a captain uploads an SVG: within 30 s the pool tile shows the picture, and no image on the page is the uploaded file's own storage URL", async ({
  page,
  tag,
}) => {
  test.setTimeout(120_000);
  const order = seedOrder(tag);
  await page.goto(`/portal/designs/${order.designId}`);

  await page.getByLabel(/add files/i).setInputFiles({
    name: "e2e-logo.svg",
    mimeType: "image/svg+xml",
    buffer: SVG,
  });
  const tile = page
    .getByTestId("pool-asset")
    .filter({ hasText: /e2e-logo\.svg/i });
  await expect(tile).toBeVisible({ timeout: 30_000 });
  const href = await originalUrlFromDownload(page, tile);
  const original = storageIdOf(href);
  expect(original, "download link points at the original in storage").not.toBeNull();

  // The picture appears (reactively, no reload) once the preview exists.
  const img = tile.locator("img").first();
  await expect(img, "tile shows a picture").toBeVisible({
    timeout: PREVIEW_WAIT_MS,
  });
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), {
      timeout: PREVIEW_WAIT_MS,
      message: "the picture decodes",
    })
    .toBeGreaterThan(0);
  await page.waitForLoadState("networkidle");

  const sources = await pictureSources(page);
  expect(sources.length, "pictures on the page").toBeGreaterThan(0);
  expect(
    sources.filter((s) => storageIdOf(s) === original),
    "no <img> or /_next/image source is the original's storage URL",
  ).toEqual([]);
  // A vector file is rasterised and served as WebP through the optimizer.
  expect(
    sources.some((s) => s.includes("/_next/image")),
    "the SVG tile goes through /_next/image",
  ).toBe(true);
});

test("375px: a player opens an order form whose main picture has no preview yet and sees the placeholder, and nothing on the page names the original's storage URL", async ({
  page,
  browser,
  tag,
}) => {
  test.setTimeout(180_000);
  const order = seedOrder(tag);
  // insertAsset schedules no preview: a main picture with none.
  const { storageId: original } = await attachBigPng(order.designId, true);

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
  expect(link).toMatch(/\/run\/[a-z0-9]+$/);

  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
  });
  const player = await ctx.newPage();
  const requestUrls: string[] = [];
  const bodies: Promise<string>[] = [];
  const frames: string[] = [];
  player.on("request", (r) => requestUrls.push(decodeURIComponent(r.url())));
  player.on("response", (r) => {
    const type = r.headers()["content-type"] ?? "";
    if (/json|text|javascript/.test(type))
      bodies.push(r.text().catch(() => ""));
  });
  player.on("websocket", (ws) =>
    ws.on("framereceived", (f) => frames.push(String(f.payload))),
  );

  await player.goto(link);
  await expect(player.getByLabel(/your name/i)).toBeVisible();
  await player.waitForLoadState("networkidle");

  // The placeholder, not a picture of the design.
  await expect(
    player.locator('img[alt*="main image" i]'),
    "no main picture while there is no preview",
  ).toHaveCount(0);

  const html = await player.content();
  expect(html, "rendered page never names the original").not.toContain(
    original,
  );
  expect(
    requestUrls.filter((u) => u.includes(original)),
    "no request carries the original's storage URL",
  ).toEqual([]);
  expect(
    frames.filter((f) => f.includes(original)),
    "no Convex websocket frame carries the original's storage URL",
  ).toEqual([]);
  const resolved = await Promise.all(bodies);
  expect(
    resolved.filter((b) => b.includes(original)),
    "no HTTP response body carries the original's storage URL",
  ).toEqual([]);
  await ctx.close();
});
