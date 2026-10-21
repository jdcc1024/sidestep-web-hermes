import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import type { Page, Response } from "@playwright/test";
import { attachBigPng, seedOrder } from "./support/convex";

// IMG-01: captain and admin pages show stored pictures through StoredImage
// presets, never the print file (backlog/IMG-01-captain-pictures-use-presets.md
// "Done when" 1 and 2; docs/architecture/0007-image-egress.md).
//
// Data is E2E-seeded (a design with a big PNG main picture); nothing here
// depends on the dev demo designs. Locators are loose on purpose: the picture
// is <img alt="<title> main image"> on summaries, the pool tile is
// <img alt="e2e-big.png">, and the gallery tile opens from a button
// /view .* full size/i.

const FILENAME = "e2e-big.png";

function collectImages(page: Page) {
  const images: Response[] = [];
  page.on("response", (r) => {
    if (r.request().resourceType() === "image") images.push(r);
  });
  return images;
}

async function tally(images: Response[]) {
  let total = 0;
  const urls: string[] = [];
  for (const r of images) {
    urls.push(r.url());
    try {
      total += (await r.body()).length;
    } catch {
      // A cancelled request has no body: it downloaded nothing.
    }
  }
  return { total, urls };
}

const direct = (urls: string[]) =>
  urls.filter((u) => /\/api\/storage\//.test(u) && !u.includes("/_next/image"));

/** Every <img> in `scope` has scrolled into view and decoded. */
async function expectAllPicturesDecoded(page: Page, scope = "main") {
  const imgs = page.locator(`${scope} img`);
  const n = await imgs.count();
  expect(n, "the page shows pictures").toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const img = imgs.nth(i);
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), {
        message: `picture ${i} decoded`,
      })
      .toBeGreaterThan(0);
  }
}

test("a captain opening the dashboard and then a design with a print-size PNG sees every picture and downloads under 1 MB of images, none straight from storage", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  const { bytes } = await attachBigPng(order.designId, true, {
    withPreview: true,
  });
  expect(bytes, "fixture is a print-size PNG").toBeGreaterThan(2 * 1024 * 1024);

  const images = collectImages(page);

  await page.goto("/portal");
  await expect(page.getByText(order.teamName).first()).toBeVisible();
  const chip = page.locator('img[alt*="main image" i]').first();
  await chip.scrollIntoViewIfNeeded();
  await expect
    .poll(() => chip.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  await expectAllPicturesDecoded(page);

  await page.goto(`/portal/designs/${order.designId}`);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByTestId("pool-asset").first()).toBeVisible();
  await expectAllPicturesDecoded(page);

  await page.waitForLoadState("networkidle");
  const { total, urls } = await tally(images);

  expect(
    direct(urls),
    "no direct download of the stored print file",
  ).toEqual([]);
  expect(
    urls.some((u) => u.includes("/_next/image")),
    "pictures came through /_next/image",
  ).toBe(true);
  expect(
    total,
    `image bytes across dashboard + design page (${urls.length} responses)`,
  ).toBeLessThan(1024 * 1024);
});

test("375px: on the design page a gallery picture opens full size (<= 2048w) and the file's download link still gives the original", async ({
  page,
  tag,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const order = seedOrder(tag);
  const { bytes } = await attachBigPng(order.designId, true, {
    withPreview: true,
  });
  const images = collectImages(page);

  await page.goto(`/portal/designs/${order.designId}`);
  await expect(page.getByTestId("pool-asset").first()).toBeVisible();

  // Put the picture in a gallery, so there is a gallery tile to tap.
  await page.getByRole("button", { name: /add gallery/i }).click();
  await page.getByRole("checkbox", { name: new RegExp(FILENAME, "i") }).check();
  await page.getByRole("button", { name: /save gallery/i }).click();

  const tile = page.getByRole("button", { name: /view .* full size/i });
  await expect(tile).toBeVisible();
  await tile.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const big = dialog.locator("img").first();
  await expect
    .poll(() => big.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  const src = await big.evaluate(
    (el: HTMLImageElement) => el.currentSrc || el.src,
  );
  expect(src, "full-size view is served by the optimizer").toContain(
    "/_next/image",
  );
  await expectNoHorizontalScroll(page);
  await page.keyboard.press("Escape");

  await page.waitForLoadState("networkidle");
  const { urls } = await tally(images);
  expect(
    direct(urls),
    "no direct download of the stored print file",
  ).toEqual([]);
  const widths = urls
    .filter((u) => u.includes("/_next/image"))
    .map((u) => Number(new URL(u).searchParams.get("w")))
    .filter(Boolean);
  expect(widths.length).toBeGreaterThan(0);
  expect(Math.max(...widths)).toBeLessThanOrEqual(2048);

  // The download link is still the original file, not an optimizer URL.
  const download = page
    .getByTestId("pool-asset")
    .first()
    .getByRole("link", { name: /download/i });
  const href = await download.getAttribute("href");
  expect(href).toMatch(/\/api\/storage\//);
  expect(href).not.toContain("/_next/image");
  const original = await page.request.get(href!);
  expect(original.ok()).toBe(true);
  expect((await original.body()).length, "the original bytes").toBe(bytes);
});
