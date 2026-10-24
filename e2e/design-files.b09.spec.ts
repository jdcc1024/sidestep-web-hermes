import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { originalUrlFromDownload } from "./support/download";
import { attachFile, deleteOriginal, seedOrder } from "./support/convex";

// B-09 (backlog/B-09-design-files-unavailable.md) "Done when" 1-3. The missing-file
// label's wording is JCC's call, so tests match "missing" loosely and never pin it.
//
// Accessible names the build must use:
//  - pool tile (data-testid=pool-asset): BUTTON "Download"; BUTTON "Set <filename> as main
//    image"; BUTTON "Remove <filename>" (all exist today).
//  - a missing file: visible text matching /missing/i in the tile / gallery card, and no
//    "Download" control there. The word "Unavailable" must be gone from the page.
//  - gallery picking (as in the img01 spec): "Add gallery", checkbox named by filename,
//    "Save gallery".
// New fixture, added with these tests (the build must keep it):
//  deleteOriginal(assetId) in e2e/support/convex.ts -> internal `_e2e:deleteOriginal`.
//
// Download is read through originalUrlFromDownload (it aborts the fetch), so no @original-download tag.

// The dev-tools "N" badge is also a <nextjs-portal>, so look for the error dialog inside it.
const noOverlay = async (page: Page) => {
  await expect(
    page.locator("nextjs-portal [data-nextjs-dialog], nextjs-portal [data-nextjs-dialog-overlay]"),
  ).toHaveCount(0);
};

test(
  "an admin opens a design whose files are all in storage: every tile has Download, and it opens the original in a new tab",
  async ({ page, tag }) => {
    test.setTimeout(120_000);
    const order = seedOrder(tag);
    attachFile(order.designId, "png", true, { withPreview: true });
    attachFile(order.designId, "pdf", false);

    await page.goto(`/portal/designs/${order.designId}`);
    const tiles = page.getByTestId("pool-asset");
    await expect(tiles).toHaveCount(2);
    for (const tile of await tiles.all()) {
      await expect(tile.getByRole("button", { name: /download/i })).toBeVisible();
      await expect(tile.getByText(/missing|unavailable/i)).toHaveCount(0);
    }
    await page.waitForLoadState("networkidle");

    const url = await originalUrlFromDownload(
      page,
      tiles.filter({ hasText: /e2e-print\.pdf/i }),
    );
    expect(url, "Download opened the original in storage").toMatch(
      /\/api\/storage\//,
    );
    await noOverlay(page);
  },
);

test(
  "an admin opens a design with one file whose original is missing: that tile shows the missing label with no Download and no Set as main; Remove takes it off the page and the other file keeps its Download",
  async ({ page, tag }) => {
    test.setTimeout(120_000);
    const order = seedOrder(tag);
    attachFile(order.designId, "png", true, { withPreview: true });
    const gone = attachFile(order.designId, "png", false, { withPreview: true });
    deleteOriginal(gone.assetId);

    await page.goto(`/portal/designs/${order.designId}`);
    const tiles = page.getByTestId("pool-asset");
    await expect(tiles).toHaveCount(2);
    // Both files are named e2e-main.png; the missing one is the tile with the label.
    const missing = tiles.filter({ hasText: /missing/i });
    await expect(missing).toHaveCount(1);
    await expect(missing.getByRole("button", { name: /download/i })).toHaveCount(0);
    await expect(missing.getByRole("link", { name: /download/i })).toHaveCount(0);
    await expect(
      missing.getByRole("button", { name: /as main image/i }),
    ).toHaveCount(0);
    await expect(page.getByText(/unavailable/i)).toHaveCount(0);
    const present = tiles.filter({ hasNotText: /missing/i });
    await expect(present.getByRole("button", { name: /download/i })).toBeVisible();
    await noOverlay(page);

    await missing.getByRole("button", { name: /remove/i }).click();
    await expect(tiles).toHaveCount(1);
    await expect(page.getByText(/missing/i)).toHaveCount(0);
    await expect(
      tiles.first().getByRole("button", { name: /download/i }),
    ).toBeVisible();
    await noOverlay(page);
  },
);

test("a gallery holds a non-picture file whose original is missing: its card shows the missing label and no Download", async ({
  page,
  tag,
}) => {
  test.setTimeout(120_000);
  const order = seedOrder(tag);
  attachFile(order.designId, "png", true, { withPreview: true });
  const pdf = attachFile(order.designId, "pdf", false);

  await page.goto(`/portal/designs/${order.designId}`);
  await expect(page.getByTestId("pool-asset")).toHaveCount(2);
  await page.getByRole("button", { name: /add gallery/i }).click();
  await page.getByRole("checkbox", { name: /e2e-print\.pdf/i }).check();
  await page.getByRole("button", { name: /save gallery/i }).click();
  await expect(page.getByRole("button", { name: /save gallery/i })).toHaveCount(0);

  deleteOriginal(pdf.assetId);
  await page.reload();
  await expect(page.getByTestId("pool-asset")).toHaveCount(2);

  // The gallery sits above the file pool, so the first e2e-print.pdf is the gallery card.
  const card = page
    .getByRole("main")
    .getByText("e2e-print.pdf", { exact: true })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await expect(card.getByText(/missing/i)).toBeVisible();
  await expect(card.getByRole("button", { name: /download/i })).toHaveCount(0);
  await expect(card.getByRole("link", { name: /download/i })).toHaveCount(0);
  await noOverlay(page);
});
