import {
  expect,
  expectNoHorizontalScroll,
  test,
} from "./support/fixtures";
import type { Page } from "@playwright/test";
import { seedOrder } from "./support/convex";

// R3-03 "Done when" (initiative 0004): Paste a list keeps blank cells.
// JCC pastes the converted "Light" block (UX 0004 §5, pseudonyms, 4-column
// rows because R3-04 isn't built) and a tab row with an empty number cell.
// Today the coach is saved as #1 while the count still reads 19 jerseys, so
// the test looks at the coach's own row, not just the totals.
// Copy and layout are reviewed from screenshots; locators match key words.
// Runs as SNAP_UID (an admin), same list and controls as a captain.
//
// Build must keep these accessible names (all exist today):
//   button   /paste a list/i       textbox /paste your list/i
//   list     "Paste preview"       button  /^add\b/i in the dialog

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

const LIGHT = [
  "Abbott,8,M,1",
  "Brennan,15,2XL,1",
  "Carver,23,L,1",
  "Dhillon,44,2XL,1",
  "Dhillon,44,2XL,1",
  "Evans,30,2XL,1",
  "Fraser,43,3XL,1",
  "Fraser,43,2XL,1",
  "Fraser,43,2XL,1",
  "Fraser,43,XL,1",
  "Fraser,43,L,1",
  "Fraser,43,M,1",
  "Fraser,43,S,1",
  "Gill,21,2XL,1",
  "Hughes,3,2XL,1",
  "Ivanov,34,2XL,1",
  "Ivanov,34,2XL,1",
  "Jensen,24,M,1",
  "COACH R,,S,1",
].join("\n");

test("375px: the Light block previews 11 new players and 19 jerseys, COACH R has no number and S×1, and Add keeps it that way", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);

  await paste(page, LIGHT);

  const dialog = sheet(page);
  await expect(dialog.getByText(/11 new players/)).toBeVisible();
  await expect(dialog.getByText(/19 jerseys/)).toBeVisible();
  await expect(dialog.getByText(/skipped/i)).toHaveCount(0);
  await expect(dialog.getByText(/need(s)? sizes/i)).toHaveCount(0);

  const preview = dialog.getByRole("list", { name: /paste preview/i });
  await expect(preview.getByRole("listitem")).toHaveCount(11);
  const coach = preview.getByRole("listitem").filter({ hasText: /coach r/i });
  await expect(coach).toHaveCount(1);
  await expect(coach).toContainText(/S\s*×\s*1/);
  await expect(coach).not.toContainText("#");
  await expectNoHorizontalScroll(page);

  await dialog.getByRole("button", { name: /^add\b/i }).click();
  await expect(sheet(page)).toHaveCount(0);

  await expect(rows(page, "fraser")).toHaveCount(1);
  await expect(rows(page, "fraser").first()).toContainText(/7 jerseys/i);
  await expect(rows(page, "dhillon").first()).toContainText(/2 jerseys/i);
  await expect(rows(page, "abbott").first()).toContainText("#8");

  await expect(rows(page, "coach r")).toHaveCount(1);
  const row = rows(page, "coach r").first();
  await expect(row).toContainText(/S\s*×?\s*1|1 jersey/i);
  await expect(row).not.toContainText("#");
  await expectNoHorizontalScroll(page);
  await expect(
    page.getByRole("main").getByText(/CONVEX|ConvexError|Request ID/),
  ).toHaveCount(0);
});

test("375px: a tab row with an empty number cell (Name⇥⇥S⇥1) is added with no number and size S", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);

  await paste(page, "Blake Marsh\t\tS\t1");

  const item = sheet(page)
    .getByRole("list", { name: /paste preview/i })
    .getByRole("listitem");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(/blake marsh/i);
  await expect(item).toContainText(/S\s*×\s*1/);
  await expect(item).not.toContainText("#");
  await expect(sheet(page).getByText(/need(s)? sizes|skipped/i)).toHaveCount(0);

  await sheet(page).getByRole("button", { name: /^add\b/i }).click();
  await expect(sheet(page)).toHaveCount(0);

  await expect(rows(page, "blake marsh")).toHaveCount(1);
  const row = rows(page, "blake marsh").first();
  await expect(row).toContainText(/S\s*×?\s*1|1 jersey/i);
  await expect(row).not.toContainText("#");
  await expectNoHorizontalScroll(page);
});
