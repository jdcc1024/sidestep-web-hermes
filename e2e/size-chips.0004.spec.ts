import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import type { Browser, Page } from "@playwright/test";
import { seedItems, seedOrder } from "./support/convex";

// 0004 size chips + order-row cleanup, "Done when" 1, 2, 3, 4, 5, 7, 8, 12
// (docs/ux/0004-size-chips.md §10; #3 as amended by JCC at the mini gate:
// "Nothing printed" is gone). #6 (teal/semibold classes), #9-#11 (items ->
// jerseys copy) and #13 (contrast) are reviewed by eye from screenshots.
// Wording is reviewed from screenshots, so locators match the key word only.
// Runs as SNAP_UID (an admin): same list and controls as a captain.
//
// Build must use these accessible names / structure:
//   row chip      text exactly "S×1", "M×3" (size + count in two spans is fine,
//                 the chip's text is still one run); found by exact text in the row
//   total line    text "<N> jerseys", then list "Sizes on this order" with one
//                 listitem per size ("XS×1", "S×14", ...), no "·" between sizes
//   row           no "Added by" anywhere; the blank entry reads "Blank jerseys"
//                 and nothing else but its chips and jersey count
//   edit control  /^edit sidestep/i, sheet region "Sizes added by" (unchanged)
//   paste         list "Paste preview" (unchanged), chips "S×1" and "M×3"

test.use({ viewport: { width: 375, height: 812 } });

const rows = (page: Page, name: string) =>
  page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ hasText: new RegExp(name, "i") });

const chip = (scope: ReturnType<typeof rows>, text: string) =>
  scope.getByText(text, { exact: true });

// ── public order form helpers (as in order-form-sizes.r205.spec.ts) ─────────

function isoDate(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
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
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: /copy link/i }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/run\/[a-z0-9]+$/);
  return link;
}

async function submitAsPlayer(
  browser: Browser,
  browserErrors: string[],
  link: string,
  who: { name: string; email: string },
  card: { name: string; number: string },
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
  await player.getByLabel(/name on jersey/i).fill(card.name);
  await player.getByLabel(/^number/i).fill(card.number);
  for (const [size, qty] of Object.entries(sizes))
    for (let i = 0; i < qty; i++)
      await player
        .getByRole("button", { name: new RegExp(`add one ${size}\\b`, "i") })
        .click();
  await player.getByRole("button", { name: /^submit/i }).click();
  await expect(player.getByRole("status")).toBeVisible();
  await ctx.close();
}

// ── Done when 1, 7 ──────────────────────────────────────────────────────────

test("375px: a player with S×1 and M×3 shows chips S×1 and M×3 and the row has no 'Added by'", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  seedItems(tag, order.orderId, [
    { name: "Sidestep", number: "72", size: "S", qty: 1 },
    { name: "Sidestep", number: "72", size: "M", qty: 3 },
  ]);
  await page.goto(`/portal/orders/${order.orderId}`);

  const row = rows(page, "sidestep");
  await expect(row).toHaveCount(1);
  await expect(chip(row, "S×1")).toBeVisible();
  await expect(chip(row, "M×3")).toBeVisible();
  // Done when 7: the chip's text is exactly the pair, nothing added.
  await expect(chip(row, "M×3")).toHaveText("M×3");
  await expect(row).not.toContainText(/added by/i);
  await expectNoHorizontalScroll(page);
});

// ── Done when 2 ─────────────────────────────────────────────────────────────

test("375px: no row says 'Added by', whether the captain or a player through the order form added the player", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  const order = seedOrder(tag);
  seedItems(tag, order.orderId, [
    { name: "Avery Quinn", number: "7", size: "L", qty: 2 },
  ]);
  const link = await makeOrderForm(page, order.orderId);
  await submitAsPlayer(
    browser,
    browserErrors,
    link,
    { name: `Pat ${tag.slice(-6)}`, email: `${tag}-a@example.com` },
    { name: "Sidestep", number: "72" },
    { S: 1, M: 3 },
  );

  await page.goto(`/portal/orders/${order.orderId}`);
  await expect(rows(page, "avery quinn")).toHaveCount(1);
  await expect(rows(page, "sidestep")).toHaveCount(1);
  await expect(rows(page, "avery quinn")).not.toContainText(/added by/i);
  await expect(rows(page, "sidestep")).not.toContainText(/added by/i);
  await expect(page.getByRole("main").getByText(/added by/i)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

// ── Done when 3 (JCC: "Nothing printed" removed) ────────────────────────────

test("375px: the design's blank entry reads 'Blank jerseys' with no 'Nothing printed' and no 'Added by'", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  seedItems(tag, order.orderId, [{ size: "M", qty: 2 }]);
  await page.goto(`/portal/orders/${order.orderId}`);

  const row = rows(page, "blank jerseys");
  await expect(row).toHaveCount(1);
  await expect(row).not.toContainText(/nothing printed/i);
  await expect(row).not.toContainText(/added by/i);
  await expect(page.getByRole("main").getByText(/nothing printed/i)).toHaveCount(0);
  // No second line: the label is followed straight by the chips.
  await expect(chip(row, "M×2")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

// ── Done when 4 ─────────────────────────────────────────────────────────────
// Moved here from r202/r205: who sent what is answered in the edit sheet, by
// full name as before (the first-name-only rule belonged to the row's line).

test("375px: ⋯ on a player with the captain's S×1 and Quinn's M×1 still lists both people and their sizes under 'Sizes added by'", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  const order = seedOrder(tag);
  seedItems(tag, order.orderId, [
    { name: "Sidestep", number: "72", size: "S", qty: 1 },
  ]);
  const link = await makeOrderForm(page, order.orderId);
  const quinn = { name: `Quinn ${tag.slice(-6)}`, email: `${tag}-q@example.com` };
  await submitAsPlayer(
    browser,
    browserErrors,
    link,
    quinn,
    { name: "Sidestep", number: "72" },
    { M: 1 },
  );

  await page.goto(`/portal/orders/${order.orderId}`);
  await expect(rows(page, "sidestep")).toHaveCount(1);
  await page.getByRole("button", { name: /^edit sidestep/i }).click();

  const added = page
    .getByRole("dialog")
    .getByRole("region", { name: /sizes added by/i });
  await expect(added.getByRole("listitem")).toHaveCount(2);
  await expect(added).toContainText(/you/i);
  await expect(added).toContainText("S×1");
  await expect(added).toContainText(quinn.name);
  await expect(added).toContainText("M×1");
});

// ── Done when 5, 12 ─────────────────────────────────────────────────────────

const SEVEN_SIZES: Array<[string, number]> = [
  ["XS", 1],
  ["S", 14],
  ["M", 7],
  ["XL", 3],
  ["2XL", 2],
  ["3XL", 4],
  ["4XL", 16],
];
const TOTAL = SEVEN_SIZES.reduce((n, [, q]) => n + q, 0); // 47

function seedSevenSizes(tag: string, orderId: string) {
  seedItems(
    tag,
    orderId,
    SEVEN_SIZES.map(([size, qty], i) => ({
      name: `Player ${i + 1}`,
      number: String(i + 1),
      size,
      qty,
    })),
  );
}

test("375px: the order total reads '47 jerseys' then one list item per size in 'Sizes on this order', with no '·' between sizes", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  seedSevenSizes(tag, order.orderId);
  await page.goto(`/portal/orders/${order.orderId}`);

  const main = page.getByRole("main");
  await expect(main.getByText(new RegExp(`^${TOTAL} jerseys$`)).last()).toBeVisible();

  const sizes = main.getByRole("list", { name: "Sizes on this order" });
  await expect(sizes).toBeVisible();
  const items = sizes.getByRole("listitem");
  await expect(items).toHaveText(SEVEN_SIZES.map(([s, q]) => `${s}×${q}`));
  await expect(sizes).not.toContainText("·");
  // The line that holds the total carries no separator dot either.
  await expect(
    main.getByText(new RegExp(`${TOTAL} jerseys\\s*·`)),
  ).toHaveCount(0);
});

test("375px: with 7 sizes in the total line the page has no horizontal scroll and no size×count is split across two lines", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  seedSevenSizes(tag, order.orderId);
  await page.goto(`/portal/orders/${order.orderId}`);

  const items = page
    .getByRole("main")
    .getByRole("list", { name: "Sizes on this order" })
    .getByRole("listitem");
  await expect(items).toHaveCount(SEVEN_SIZES.length);
  await expectNoHorizontalScroll(page);

  // Each pair sits on one line: its box is no taller than one line of text.
  const wrapped = await items.evaluateAll((els) =>
    els
      .filter((el) => {
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
        return el.getBoundingClientRect().height > lh * 1.5;
      })
      .map((el) => el.textContent),
  );
  expect(wrapped, "size×count pairs split across lines").toEqual([]);
  await expect(items.last()).toHaveText("4XL×16");
});

// ── Done when 8 ─────────────────────────────────────────────────────────────

test("375px: pasting 'Sidestep 72 S' and 'Sidestep 72 M 3' previews one player with chips S×1 and M×3", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);

  await page.getByRole("button", { name: /paste a list/i }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: /paste your list/i })
    .fill("Sidestep\t72\tS\nSidestep\t72\tM\t3");

  const preview = page
    .getByRole("dialog")
    .getByRole("list", { name: /paste preview/i });
  await expect(preview.getByRole("listitem")).toHaveCount(1);
  const item = preview.getByRole("listitem").first();
  await expect(item.getByText("S×1", { exact: true })).toBeVisible();
  await expect(item.getByText("M×3", { exact: true })).toHaveText("M×3");
  await expectNoHorizontalScroll(page);
});
