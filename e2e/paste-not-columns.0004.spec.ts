import {
  expect,
  expectNoHorizontalScroll,
  test,
} from "./support/fixtures";
import type { Page } from "@playwright/test";
import { seedOrder } from "./support/convex";

// R3-05 "Done when" (initiative 0004): a paste that isn't columns is flagged.
// 1. The customer's raw message (UX 0004 §5 "Customer sent" column,
//    pseudonyms, heading + 20 lines) shows the amber notice and Add stays
//    enabled.
// 2. The converted Light block shows no notice.
// Exact copy and amber look are reviewed from screenshots; the locator
// matches the key words only. Runs as SNAP_UID (an admin), same sheet as a
// captain.
//
// Build must keep these accessible names (all exist today):
//   button /paste a list/i   textbox /paste your list/i
//   list "Paste preview"     button /^add\b/i in the dialog
// New: visible text matching /number or a size/i above the preview.

test.use({ viewport: { width: 375, height: 812 } });

const sheet = (page: Page) => page.getByRole("dialog");

async function paste(page: Page, text: string) {
  await page.getByRole("button", { name: /paste a list/i }).first().click();
  await sheet(page).getByRole("textbox", { name: /paste your list/i }).fill(text);
}

const RAW = [
  "[Light Jersey Order]",
  "Kai - [Abbott - 8 - M]",
  "Lee - [Brennan - 15 - 2XL]",
  "Max - [Carver - 23 - L]",
  "Sam - [Dhillon - 44 - 2XL]",
  "Sam - [Dhillon - 44 - 2XL]",
  "Jo - [Evans - 30 - 2XL]",
  "Rob - [Fraser - 43 - 3XL]",
  "Rob - [Fraser - 43 - 2XL]",
  "Rob - [Fraser - 43 - 2XL]",
  "Rob - [Fraser - 43 - XL]",
  "Rob - [Fraser - 43 - L]",
  "Rob - [Fraser - 43 - M]",
  "Rob - [Fraser - 43 - S]",
  "Tess - [Gill - 21 - 2XL]",
  "Ash - [Hughes - 3 - 2XL]",
  "Ash - [Hughes - 3 - 2XL] (sleeveless)",
  "Mo - [Ivanov - 34 - 2XL]",
  "Mo - [Ivanov - 34 - 2XL]",
  "Pat - [Jensen - 24 - M]",
  "Robin - [COACH R - S ] (no number)",
].join("\n");

const LIGHT = [
  "Abbott,8,M,1,Kai",
  "Brennan,15,2XL,1,Lee",
  "Carver,23,L,1,Max",
  "Dhillon,44,2XL,1,Sam",
  "Dhillon,44,2XL,1,Sam",
  "Evans,30,2XL,1,Jo",
  "Fraser,43,3XL,1,Rob",
  "Fraser,43,2XL,1,Rob",
  "Fraser,43,2XL,1,Rob",
  "Fraser,43,XL,1,Rob",
  "Fraser,43,L,1,Rob",
  "Fraser,43,M,1,Rob",
  "Fraser,43,S,1,Rob",
  "Gill,21,2XL,1,Tess",
  "Hughes,3,2XL,1,Ash",
  "Ivanov,34,2XL,1,Mo",
  "Ivanov,34,2XL,1,Mo",
  "Jensen,24,M,1,Pat",
  "COACH R,,S,1,Robin",
].join("\n");

test("375px: pasting the raw customer message shows the not-columns notice and Add stays enabled", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);

  await paste(page, RAW);

  const dialog = sheet(page);
  await expect(dialog.getByRole("list", { name: /paste preview/i })).toBeVisible();
  await expect(dialog.getByText(/number or a size/i)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^add\b/i })).toBeEnabled();
  await expectNoHorizontalScroll(page);
});

test("375px: pasting the converted Light block shows no not-columns notice, and Add is enabled", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);

  await paste(page, LIGHT);

  const dialog = sheet(page);
  // Wait for the preview so "no notice" isn't checked before it rendered.
  await expect(dialog.getByText(/11 new players/)).toBeVisible();
  await expect(dialog.getByText(/number or a size/i)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /^add\b/i })).toBeEnabled();
  await expectNoHorizontalScroll(page);
});
