import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import type { Browser, Page } from "@playwright/test";
import { seedOrder } from "./support/convex";

// R2-05 "Done when" 1-2 (initiative 0004, phase 1b). JCC: "take Sidestep #72,
// then add multiple order items for that roster entry (1 small, 3 medium,
// 1 XL)" — here through the public order form, "type your own name" mode.
// Gate 1b Q5: a second email with the same name + number joins the SAME
// player silently — no warning, no flag; every submitter's lines are kept.
// Wording is reviewed from screenshots, so locators match the key word only.
//
// Build must use these accessible names (on a jersey card, fieldset /jersey 1/i):
//   fields   /name on jersey/i, /^number/i      (exist today)
//   buttons  /add one <SIZE>\b/i                SizeCounter, one per size;
//            /remove one <SIZE>\b/i             (R2-02 component, sizeOptions only)
//   button   /^submit/i                         (exists today)
//   status   role=status                        after a successful submit
// Captain's list (R2-02 names): row chips "M×3", "<n> jerseys", "Added by";
// edit control /^edit sidestep/i; the sheet's region "Sizes added by".
// The old single size radio and Quantity box are gone from this form.

function isoDate(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
}

async function copyLink(page: Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: /copy link/i }).click();
  return page.evaluate(() => navigator.clipboard.readText());
}

async function makeOrderForm(page: Page, orderId: string) {
  await page.goto(`/portal/orders/${orderId}`);
  await page.getByRole("button", { name: /make an order form/i }).click();
  await page.getByLabel(/deadline/i).fill(isoDate(14));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /make|create|start/i })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/^open$/i)).toBeVisible();
  const link = await copyLink(page);
  expect(link).toMatch(/\/run\/[a-z0-9]+$/);
  return link;
}

// A player is an anonymous browser at 375px (no captain session).
async function submitAsPlayer(
  browser: Browser,
  browserErrors: string[],
  link: string,
  who: { name: string; email: string },
  sizes: Record<string, number>,
) {
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
  });
  const player = await ctx.newPage();
  player.on("console", (m) => {
    if (
      m.type() === "error" &&
      !/React DevTools|Clerk has been loaded|Fast Refresh|HMR/.test(m.text())
    )
      browserErrors.push(`console: ${m.text()}`);
  });
  player.on("pageerror", (e) => browserErrors.push(`pageerror: ${e.message}`));

  await player.goto(link);
  await expect(player.getByLabel(/your name/i)).toBeVisible();
  await player.getByLabel(/your name/i).fill(who.name);
  await player.getByLabel(/your email/i).fill(who.email);

  // ONE card: Sidestep #72, several sizes on it.
  await player.getByLabel(/name on jersey/i).fill("Sidestep");
  await player.getByLabel(/^number/i).fill("72");
  for (const [size, qty] of Object.entries(sizes))
    for (let i = 0; i < qty; i++)
      await player
        .getByRole("button", { name: new RegExp(`add one ${size}\\b`, "i") })
        .click();
  await expect(player.getByRole("group", { name: /jersey 2/i })).toHaveCount(0);
  await expectNoHorizontalScroll(player);

  await player.getByRole("button", { name: /^submit/i }).click();
  await expect(player.getByRole("status")).toBeVisible();
  await ctx.close();
}

const rows = (page: Page) =>
  page.getByRole("main").getByRole("listitem").filter({ hasText: /sidestep/i });

test("375px: a player fills one card as Sidestep #72 with S, M×3, XL and the captain sees one row with 5 jerseys, added by that player", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  const order = seedOrder(tag);
  const link = await makeOrderForm(page, order.orderId);
  const first = { name: `Pat ${tag.slice(-6)}`, email: `${tag}-a@example.com` };

  await submitAsPlayer(browser, browserErrors, link, first, {
    S: 1,
    M: 3,
    XL: 1,
  });

  await page.goto(`/portal/orders/${order.orderId}`);
  await expect(rows(page)).toHaveCount(1);
  const row = rows(page).first();
  await expect(row).toContainText("S");
  await expect(row).toContainText(/M\s*×\s*3/);
  await expect(row).toContainText("XL");
  await expect(row).toContainText(/5 jerseys/i);
  await expect(row).toContainText(/added by/i);
  await expect(row).toContainText(first.name);
  await expectNoHorizontalScroll(page);
  await expect(
    page.getByRole("main").getByText(/CONVEX|ConvexError|Request ID/),
  ).toHaveCount(0);
});

test("375px: a second player with a different email adding Sidestep #72 in L joins the same row silently, and the edit sheet lists both players' sizes", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  const order = seedOrder(tag);
  const link = await makeOrderForm(page, order.orderId);
  const first = { name: `Pat ${tag.slice(-6)}`, email: `${tag}-a@example.com` };
  const second = { name: `Quinn ${tag.slice(-6)}`, email: `${tag}-b@example.com` };

  await submitAsPlayer(browser, browserErrors, link, first, {
    S: 1,
    M: 3,
    XL: 1,
  });
  await submitAsPlayer(browser, browserErrors, link, second, { L: 1 });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/portal/orders/${order.orderId}`);

  // Still one player, now with L and 6 jerseys, both people under "Added by".
  await expect(rows(page)).toHaveCount(1);
  const row = rows(page).first();
  await expect(row).toContainText("L");
  await expect(row).toContainText(/M\s*×\s*3/);
  await expect(row).toContainText(/6 jerseys/i);
  await expect(row).toContainText(/added by/i);
  await expect(row).toContainText(first.name);
  await expect(row).toContainText(second.name);
  // Gate 1b Q5: no flag, no warning on the list.
  await expect(
    page.getByRole("main").getByText(/sizes from|conflict|duplicate|check with/i),
  ).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // The edit sheet keeps each player's own lines under "Sizes added by".
  await page.getByRole("button", { name: /^edit sidestep/i }).click();
  const added = page
    .getByRole("dialog")
    .getByRole("region", { name: /sizes added by/i });
  await expect(added).toContainText(first.name);
  await expect(added).toContainText(second.name);
  await expect(added.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("dialog").getByText(/sizes from|conflict|duplicate/i)).toHaveCount(0);
});
