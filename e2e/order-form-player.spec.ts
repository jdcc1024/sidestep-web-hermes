import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import { seedOrder } from "./support/convex";

// L-07 "Done when" 2: a player opens a captain's /run/<id> link, submits a
// name, number and size, and the captain sees that item on the order page.
// The rename moves the table, the module and the form id; the link, the public
// form and the order list must keep working end to end. Wording is not pinned:
// locators match the key word only.

function isoDate(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test("a player submits through the captain's /run link and the captain sees the item", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  const order = seedOrder(tag);
  const playerName = `Pat ${tag.slice(-6)}`;
  const jerseyName = "Zephyr"; // distinct from the site logo text

  // Captain makes an order form and copies the share link.
  await page.goto(`/portal/orders/${order.orderId}`);
  await page.getByRole("button", { name: /make an order form/i }).click();
  await page.getByLabel(/deadline/i).fill(isoDate(14));
  await page.getByRole("dialog").getByRole("button", { name: /make|create|start/i }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/^open$/i)).toBeVisible();
  const shared = await copyLink(page);
  expect(shared).toMatch(/\/run\/[a-z0-9]+$/);

  // A player (anonymous browser, no captain session) fills in the public form.
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
  });
  const player = await ctx.newPage();
  player.on("console", (m) => {
    if (m.type() === "error" && !/React DevTools|Clerk has been loaded|Fast Refresh|HMR/.test(m.text()))
      browserErrors.push(`console: ${m.text()}`);
  });
  player.on("pageerror", (e) => browserErrors.push(`pageerror: ${e.message}`));

  await player.goto(shared);
  await expect(player.getByLabel(/your name/i)).toBeVisible();
  await player.getByLabel(/your name/i).fill(playerName);
  await player.getByLabel(/your email/i).fill(`${tag}@example.com`);
  await player.getByLabel(/name on jersey/i).fill(jerseyName);
  await player.getByLabel(/^number/i).fill("72");
  await player.getByRole("button", { name: /add one M\b/i }).click();
  await expectNoHorizontalScroll(player);
  await player.getByRole("button", { name: /^submit/i }).click();
  await expect(player.getByRole("status")).toBeVisible();
  await ctx.close();

  // The captain sees that item on the order page, without a reload dance.
  await page.goto(`/portal/orders/${order.orderId}`);
  await expect(page.getByText(jerseyName).first()).toBeVisible();
  await expect(page.getByText("72").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

async function copyLink(page: import("@playwright/test").Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: /copy link/i }).click();
  return page.evaluate(() => navigator.clipboard.readText());
}
