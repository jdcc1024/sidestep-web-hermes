import { expect, test } from "./support/fixtures";
import type { Page } from "@playwright/test";
import { attachFile, captainConfigured, seedOrder } from "./support/convex";

// IMG-05 (backlog/IMG-05-original-url-only-on-download.md) "Done when" 1 and 2:
// the original print file's URL leaves Convex only when the design's owner or an
// admin clicks Download. Done-when 3 (a different captain is refused) is a
// logic test, convex/designs.originalUrl.img05.test.ts: the refusal is a
// server check on the query, and an E2E needs a second signed-in account
// (E2E_CAPTAIN_*) that most environments don't have.
//
// Both tests are tagged @original-download: clicking Download really does fetch
// the original (IMG-02's egress guard opt-out).
//
// Accessible names the build must use:
//  - design page (captain): a BUTTON named "Download" inside each
//    data-testid=pool-asset tile (it is a link today; IMG-05 makes it a button).
//  - admin order page: a BUTTON whose name is the file's name (e2e-main.png),
//    where the badge link is today.
//  - On click the original opens in a new tab (popup) at /api/storage/<id>.

const STORAGE_ID = /\/api\/storage\/([^/?#&"'\s\\]+)/;
const storageIdOf = (url: string) =>
  STORAGE_ID.exec(decodeURIComponent(url))?.[1] ?? null;

/** Every Convex websocket frame the page receives, from before it loads. */
function collectFrames(page: Page) {
  const frames: string[] = [];
  page.on("websocket", (ws) =>
    ws.on("framereceived", (f) => frames.push(String(f.payload))),
  );
  return frames;
}

test(
  "a captain clicks Download on a file on their design page and the original opens in a new tab; no Convex frame carried its URL before the click",
  { tag: "@original-download" },
  async ({ page, tag }) => {
    test.setTimeout(120_000);
    const order = seedOrder(tag);
    // A picture with a preview, so the tile is a normal one.
    attachFile(order.designId, "png", true, { withPreview: true });

    const frames = collectFrames(page);
    await page.goto(`/portal/designs/${order.designId}`);
    const tile = page
      .getByTestId("pool-asset")
      .filter({ hasText: /e2e-main\.png/i });
    await expect(tile).toBeVisible();
    await expect(tile.locator("img").first()).toBeVisible();
    await page.waitForLoadState("networkidle");

    // The control is a button, not a link to the file.
    const download = tile.getByRole("button", { name: /download/i });
    await expect(download).toBeVisible();
    await expect(tile.getByRole("link", { name: /download/i })).toHaveCount(0);
    expect(
      await page.locator('a[href*="/api/storage/"]').count(),
      "no link on the page points at storage",
    ).toBe(0);

    const before = frames.length;

    const popupPromise = page.waitForEvent("popup");
    await download.click();
    const popup = await popupPromise;
    await popup.waitForURL(STORAGE_ID, { timeout: 30_000 });
    const original = storageIdOf(popup.url());
    expect(original, "the new tab opened the original in storage").not.toBeNull();

    // The id comes from the tab the click opened; the frames before the click
    // must not have carried it.
    expect(
      frames.slice(0, before).filter((f) => f.includes(original!)),
      "no Convex frame before the click carries the original's storage id",
    ).toEqual([]);
    expect(
      (await page.content()).includes(original!),
      "the rendered page never names the original",
    ).toBe(false);
  },
);

test(
  "staff open an order in admin, click a linked design's file, and get the original (a design the admin doesn't own)",
  { tag: "@original-download" },
  async ({ page, tag }) => {
    test.skip(
      !captainConfigured(),
      "needs E2E_CAPTAIN_UID/_PWD so the design is owned by someone other than the admin",
    );
    test.setTimeout(120_000);
    // Owned by the plain captain, viewed by SNAP_UID (an admin): isAdmin branch.
    const order = seedOrder(tag, "captain");
    attachFile(order.designId, "png", true, { withPreview: true });

    const frames = collectFrames(page);
    await page.goto(`/admin/orders/${order.orderId}`);
    const file = page.getByRole("button", { name: /e2e-main\.png/i });
    await expect(file).toBeVisible();
    await page.waitForLoadState("networkidle");
    const before = frames.length;

    const popupPromise = page.waitForEvent("popup");
    await file.click();
    const popup = await popupPromise;
    await popup.waitForURL(STORAGE_ID, { timeout: 30_000 });
    const original = storageIdOf(popup.url());
    expect(original, "the new tab opened the original in storage").not.toBeNull();
    expect(
      frames.slice(0, before).filter((f) => f.includes(original!)),
      "no Convex frame before the click carries the original's storage id",
    ).toEqual([]);
  },
);
