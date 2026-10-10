import { readFileSync } from "node:fs";
import {
  expect,
  expectNoHorizontalScroll,
  test,
} from "./support/fixtures";
import type { Page } from "@playwright/test";
import { seedOrder } from "./support/convex";

// R3-04 "Done when" (initiative 0004): Paste a list reads an optional
// 5th column, "Ordered by". Pseudonyms only. Runs as SNAP_UID (an admin).
// Copy and layout are reviewed from screenshots; locators match key words.
//
// Build must keep / use these accessible names:
//   button   /paste a list/i       textbox /paste your list/i
//   list     "Paste preview"       button  /^add\b/i in the dialog
//   preview  each player's listitem contains the text "Ordered by <names>"
//            (none for a player without owners)
//   row      button /^edit fraser/i  -> dialog region "Sizes added by"
//   admin    /admin/orders/<id>: button /export csv/i

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

const previewItem = (page: Page, name: string) =>
  sheet(page)
    .getByRole("list", { name: /paste preview/i })
    .getByRole("listitem")
    .filter({ hasText: new RegExp(name, "i") });

// The §5 Light block with the 5th column (UX 0004 §5). 11 players, 19 jerseys,
// every row has an owner. Fraser's owner is Rob on all 7 lines.
const LIGHT_5 = [
  "Abbott,8,M,1,Kai",
  "Brennan,15,2XL,1,Kai",
  "Carver,23,L,1,Kai",
  "Dhillon,44,2XL,1,Sam",
  "Dhillon,44,2XL,1,Sam",
  "Evans,30,2XL,1,Sam",
  "Fraser,43,3XL,1,Rob",
  "Fraser,43,2XL,1,Rob",
  "Fraser,43,2XL,1,Rob",
  "Fraser,43,XL,1,Rob",
  "Fraser,43,L,1,Rob",
  "Fraser,43,M,1,Rob",
  "Fraser,43,S,1,Rob",
  "Gill,21,2XL,1,Jo",
  "Hughes,3,2XL,1,Jo",
  "Ivanov,34,2XL,1,Jo",
  "Ivanov,34,2XL,1,Jo",
  "Jensen,24,M,1,Jo",
  "COACH R,,S,1,Rob",
].join("\n");

test("375px: the Light block with an Ordered by column previews every player's owner, and Sizes added by lists the owner 'from a pasted list'", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);

  await paste(page, LIGHT_5);

  const dialog = sheet(page);
  await expect(dialog.getByText(/11 new players/)).toBeVisible();
  await expect(dialog.getByText(/19 jerseys/)).toBeVisible();
  await expect(dialog.getByText(/skipped/i)).toHaveCount(0);

  const items = dialog
    .getByRole("list", { name: /paste preview/i })
    .getByRole("listitem");
  await expect(items).toHaveCount(11);
  // Every preview player shows who ordered, and the owner is the right one.
  await expect(items.filter({ hasText: /ordered by/i })).toHaveCount(11);
  await expect(previewItem(page, "fraser")).toContainText(/ordered by\s*rob/i);
  await expect(previewItem(page, "dhillon")).toContainText(/ordered by\s*sam/i);
  await expect(previewItem(page, "abbott")).toContainText(/ordered by\s*kai/i);
  await expect(previewItem(page, "ivanov")).toContainText(/ordered by\s*jo/i);
  await expectNoHorizontalScroll(page);

  await dialog.getByRole("button", { name: /^add\b/i }).click();
  await expect(sheet(page)).toHaveCount(0);

  await page.getByRole("button", { name: /^edit fraser/i }).click();
  const added = sheet(page).getByRole("region", { name: /sizes added by/i });
  await expect(added).toBeVisible();
  await expect(added).toContainText(/rob/i);
  for (const chip of ["S×1", "M×1", "L×1", "XL×1", "2XL×2", "3XL×1"])
    await expect(added).toContainText(chip);
  await expect(added).toContainText(/from a pasted list/i);
  await expect(added).not.toContainText(/through the order form/i);
  await expectNoHorizontalScroll(page);
});

const MIXED = [
  "Fraser,43,2XL,1,Rob",
  "Fraser,43,S,1,Rob",
  "Dhillon,44,2XL,1,Sam",
  "Gill,21,M,1",
].join("\n");

test("375px: a paste mixing 4- and 5-column rows is accepted in full; owners only where given", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);

  await paste(page, MIXED);

  const dialog = sheet(page);
  await expect(dialog.getByText(/3 new players/)).toBeVisible();
  await expect(dialog.getByText(/4 jerseys/)).toBeVisible();
  await expect(dialog.getByText(/skipped|invalid/i)).toHaveCount(0);
  await expect(
    dialog.getByRole("list", { name: /paste preview/i }).getByRole("listitem"),
  ).toHaveCount(3);
  await expect(previewItem(page, "fraser")).toContainText(/ordered by\s*rob/i);
  await expect(previewItem(page, "dhillon")).toContainText(/ordered by\s*sam/i);
  await expect(previewItem(page, "gill")).not.toContainText(/ordered by/i);
  await expectNoHorizontalScroll(page);

  await dialog.getByRole("button", { name: /^add\b/i }).click();
  await expect(sheet(page)).toHaveCount(0);

  await expect(rows(page, "gill")).toHaveCount(1);
  await expect(rows(page, "gill").first()).toContainText("#21");

  // Fraser's sheet reads Rob; Gill's has no named owner (the captain's "You").
  await page.getByRole("button", { name: /^edit fraser/i }).click();
  const fraser = sheet(page).getByRole("region", { name: /sizes added by/i });
  await expect(fraser).toContainText(/rob/i);
  await expect(fraser).toContainText(/from a pasted list/i);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);

  await page.getByRole("button", { name: /^edit gill/i }).click();
  const gill = sheet(page).getByRole("region", { name: /sizes added by/i });
  await expect(gill).toContainText(/you/i);
  await expect(gill).not.toContainText(/from a pasted list/i);
  await expect(gill).not.toContainText(/rob|sam/i);
});

// Minimal CSV reader (quoted fields, doubled quotes).
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(cell), (cell = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) (row.push(cell), out.push(row));
  return out.filter((r) => r.some((x) => x !== ""));
}

test("the admin order export's submitter name column holds the pasted owner, and is empty for a 4-column row", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);
  await paste(page, MIXED);
  await sheet(page).getByRole("button", { name: /^add\b/i }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(rows(page, "gill")).toHaveCount(1);

  await page.goto(`/admin/orders/${order.orderId}`);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /export csv/i }).click(),
  ]);
  const table = parseCsv(readFileSync(await download.path(), "utf8"));
  const header = table[0];
  const col = (label: RegExp) => header.findIndex((h) => label.test(h));
  const nameCol = col(/^name on jersey/i);
  const byCol = col(/^submitted by/i);
  const emailCol = col(/^email/i);
  expect(nameCol, "a name-on-jersey column").toBeGreaterThanOrEqual(0);
  expect(byCol, "a submitted-by column").toBeGreaterThanOrEqual(0);

  const of = (name: string) =>
    table.slice(1).filter((r) => new RegExp(name, "i").test(r[nameCol]));
  const fraser = of("fraser");
  expect(fraser).toHaveLength(2);
  for (const r of fraser) expect(r[byCol]).toBe("Rob");
  expect(of("dhillon").map((r) => r[byCol])).toEqual(["Sam"]);
  expect(of("gill").map((r) => r[byCol])).toEqual([""]);
  // A pasted owner is a name only: never an email.
  if (emailCol >= 0)
    for (const r of [...fraser, ...of("dhillon")])
      expect(r[emailCol]).toBe("");
});
