import {
  expect,
  expectNoHorizontalScroll,
  test,
} from "./support/fixtures";
import type { Page } from "@playwright/test";
import { seedItems, seedOrder } from "./support/convex";

// R2-04 "Done when" 1-2 (initiative 0004, phase 1b). JCC: "take Sidestep #72,
// then add multiple order items for that roster entry (1 small, 3 medium,
// 1 XL)" — here through Paste a list, with the optional "how many" column.
// Wording is reviewed from screenshots, so locators match the key word only.
// Runs as SNAP_UID (an admin), same list and controls as a captain.
//
// Build must use these accessible names:
//   button   /paste a list/i              opens the sheet (exists today)
//   textbox  /paste your list/i           the textarea (exists today)
//   list     "Paste preview"              one listitem per pasted row; the
//                                         preview shows the grouped player
//                                         as ONE item with chips S, M×3, XL
//   button   /^add\b/i in the dialog      confirm (e.g. "Add 1 player")
//   text     /already on/i                the match note, in the preview
//   list rows: chips "M×3", "<n> jerseys" (as in the R2-02 spec)

test.use({ viewport: { width: 375, height: 812 } });

const sheet = (page: Page) => page.getByRole("dialog");
const rows = (page: Page, name: string) =>
  page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ hasText: new RegExp(name, "i") });

async function paste(page: Page, text: string) {
  await page.getByRole("button", { name: /paste a list/i }).first().click();
  await sheet(page).getByRole("textbox", { name: /paste your list/i }).fill(text);
}

test("375px: pasting three rows for Sidestep #72 previews one player with S, M×3, XL and adds one row with 5 jerseys", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);

  await paste(page, "Sidestep\t72\tS\nSidestep\t72\tM\t3\nSidestep\t72\tXL");

  // One player in the preview, not three rows.
  const preview = sheet(page).getByRole("list", { name: /paste preview/i });
  await expect(preview.getByRole("listitem")).toHaveCount(1);
  const item = preview.getByRole("listitem").first();
  await expect(item).toContainText(/sidestep/i);
  await expect(item).toContainText("S");
  await expect(item).toContainText(/M\s*×\s*3/);
  await expect(item).toContainText("XL");
  await expectNoHorizontalScroll(page);

  await sheet(page).getByRole("button", { name: /^add\b/i }).click();
  await expect(sheet(page)).toHaveCount(0);

  await expect(rows(page, "sidestep")).toHaveCount(1);
  const row = rows(page, "sidestep").first();
  await expect(row).toContainText(/M\s*×\s*3/);
  await expect(row).toContainText("XL");
  await expect(row).toContainText(/5 jerseys/i);
  await expectNoHorizontalScroll(page);
  await expect(
    page.getByRole("main").getByText(/CONVEX|ConvexError|Request ID/),
  ).toHaveCount(0);
});

test("375px: pasting 'Avery Quinn 7 L' where Avery Quinn #7 has M shows the 'already on' note and leaves one row with M and L", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  seedItems(tag, order.orderId, [
    { name: "Avery Quinn", number: "7", size: "M", qty: 1 },
  ]);
  await page.goto(`/portal/orders/${order.orderId}`);
  await expect(rows(page, "avery quinn")).toHaveCount(1);

  await paste(page, "Avery Quinn\t7\tL");
  await expect(sheet(page).getByText(/already on/i).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await sheet(page).getByRole("button", { name: /^add\b/i }).click();
  await expect(sheet(page)).toHaveCount(0);

  await expect(rows(page, "avery quinn")).toHaveCount(1);
  const row = rows(page, "avery quinn").first();
  await expect(row).toContainText("M");
  await expect(row).toContainText("L");
  await expect(row).toContainText(/2 jerseys/i);
  await expect(
    page.getByRole("main").getByText(/CONVEX|ConvexError|Request ID/),
  ).toHaveCount(0);
});
