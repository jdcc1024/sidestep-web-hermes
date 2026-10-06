import { readFileSync } from "node:fs";
import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import { seedItems, seedOrder } from "./support/convex";

// (Player is "Zephyr", not "Sidestep": the site logo says Sidestep.)
// R2-01 "Done when" 1: a captain opens an order seeded before this change
// (flat items, no roster entries) and sees the same list, counts and CSV as
// before. R2-01 is server-only, so this is a regression guard: it passes on
// today's main and must still pass after the build (schema widened, new
// module, migration not yet run on this order). Wording is reviewed from
// screenshots, so locators match key words only. Uses SNAP_UID (an admin) on
// the captain page, which shows the same list; no non-admin account needed.

test("an order seeded with flat items shows the same list, counts and CSV after the roster tables arrive", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  seedItems(tag, order.orderId, [
    { name: "Zephyr", number: "72", size: "M" },
    { name: "Riley Park", number: "7", size: "L", qty: 2 },
    { name: "Jordan Lee", number: "4" }, // needs a size
  ]);

  await page.goto(`/portal/orders/${order.orderId}`);

  // The list: every player is there.
  await expect(page.getByText("Zephyr").first()).toBeVisible();
  await expect(page.getByText("Riley Park").first()).toBeVisible();
  await expect(page.getByText("Jordan Lee").first()).toBeVisible();

  // The counts: 3 sized jerseys (1 + 2), one row still needing a size.
  await expect(page.getByText(/\b3 (items?|jerseys?)\b/i).first()).toBeVisible();
  await expect(page.getByText(/\b1 needs\b/i).first()).toBeVisible();

  // The controls still work: editing is offered on this order.
  await expect(page.getByRole("button", { name: /add item/i })).toBeVisible();

  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  // The CSV: one row per jersey (Riley ×2 expands), players and sizes intact.
  await page
    .getByRole("button", { name: /download csv/i })
    .first()
    .click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /by name/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  const path = await download.path();
  const csv = readFileSync(path, "utf8");
  expect((csv.match(/Riley Park/g) ?? []).length).toBe(2);
  expect((csv.match(/Zephyr/g) ?? []).length).toBe(1);
  expect(csv).toMatch(/Jordan Lee/);
});
