import { readFileSync } from "node:fs";
import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import { seedItems, seedOrder } from "./support/convex";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// R2-03 "Done when" 1 and 2 (initiative 0004, phase 1b). JCC: "take Sidestep
// #72, and then add multiple order items for that roster entry (1 small,
// 3 medium, 1 XL)". R2-03 retires the flat item fields, so both ends of the
// data (the admin export and the player's own page) must still read the right
// values once they come off the player. Wording is reviewed from screenshots,
// so locators match key words only. Runs as SNAP_UID (an admin).
//
// Build must keep these accessible names:
//   admin page   /admin/orders/<id>: button /export csv/i
//   captain page /portal/orders/<id>: text /<n> jerseys/i (list footer)
//   portal       /portal: a card per jersey showing name, number and size

// Minimal CSV reader (quoted fields, doubled quotes), enough for the export.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
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
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) (row.push(cell), rows.push(row));
  return rows.filter((r) => r.some((x) => x !== ""));
}

test("admin exports an order with Sidestep #72 in S, M×3 and XL: the right sizes, and the jersey count matches the captain's footer", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  // Same player three times: the seed resolves them onto one player.
  seedItems(tag, order.orderId, [
    { name: "Sidestep", number: "72", size: "S" },
    { name: "Sidestep", number: "72", size: "M", qty: 3 },
    { name: "Sidestep", number: "72", size: "XL" },
    { name: "Jordan Lee", number: "4" }, // needs sizes: not a jersey yet
  ]);

  // The captain's footer, the number the export must agree with.
  await page.goto(`/portal/orders/${order.orderId}`);
  const footer = page.getByText(/\b5 jerseys\b/i).first();
  await expect(footer).toBeVisible();

  // The admin's download.
  await page.goto(`/admin/orders/${order.orderId}`);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /export csv/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  const rows = parseCsv(readFileSync(await download.path(), "utf8"));
  const header = rows[0];
  const col = (label: RegExp) => header.findIndex((h) => label.test(h));
  const nameCol = col(/^name/i);
  const sizeCol = col(/^size/i);
  const qtyCol = col(/^quantity|^qty/i);
  expect(nameCol, "a name column").toBeGreaterThanOrEqual(0);
  expect(sizeCol, "a size column").toBeGreaterThanOrEqual(0);

  // Count jerseys whether the file lists M×3 as one row with a quantity or as
  // three rows: either way the sizes must come out S 1, M 3, XL 1.
  const mine = rows.slice(1).filter((r) => /sidestep/i.test(r[nameCol]));
  const bySize: Record<string, number> = {};
  for (const r of mine) {
    const n = qtyCol >= 0 && r[qtyCol] !== "" ? Number(r[qtyCol]) : 1;
    bySize[r[sizeCol]] = (bySize[r[sizeCol]] ?? 0) + n;
  }
  expect(bySize).toEqual({ S: 1, M: 3, XL: 1 });

  // Footer says 5; so does the file. The player who needs sizes isn't in it.
  const total = Object.values(bySize).reduce((a, b) => a + b, 0);
  await expect(footer).toContainText(String(total));
  expect(rows.slice(1).some((r) => /jordan lee/i.test(r[nameCol]))).toBe(false);
  await expectNoHorizontalScroll(page);
});

function isoDate(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test("a player who submitted through the order form signs in and sees their jersey with the right name, number and size", async ({
  page,
  browser,
  tag,
}) => {
  const order = seedOrder(tag);
  // The email the signed-in session carries (listMyResponses matches on it),
  // read from Clerk rather than assumed equal to the sign-in identifier.
  await page.goto("/portal");
  await page.waitForFunction(() =>
    Boolean((window as Any).Clerk?.user),
  );
  const uid = await page.evaluate(
    () =>
      ((window as Any).Clerk?.user?.primaryEmailAddress?.emailAddress ??
        "") as string,
  );
  expect(uid, "the signed-in user has an email").toMatch(/@/);
  // The jersey is distinct from the site logo text and from every other test.
  const jerseyName = `Zeph${tag.replace(/[^a-z]/gi, "").slice(-5)}`;

  // Captain makes the order form and copies its link.
  await page.goto(`/portal/orders/${order.orderId}`);
  await page.getByRole("button", { name: /make an order form/i }).click();
  await page.getByLabel(/deadline/i).fill(isoDate(14));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /make|create|start/i })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: /copy link/i }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/run\/[a-z0-9]+$/);

  // The player fills in the public form with the email they sign in with.
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
  });
  const player = await ctx.newPage();
  await player.goto(link);
  await player.getByLabel(/your name/i).fill("Pat Player");
  await player.getByLabel(/your email/i).fill(uid);
  await player.getByLabel(/name on jersey/i).fill(jerseyName);
  await player.getByLabel(/^number/i).fill("72");
  await player.getByRole("button", { name: /add one L\b/i }).click();
  await player.getByRole("button", { name: /^submit/i }).click();
  await expect(player.getByRole("status")).toBeVisible();
  await ctx.close();

  // They sign in (the signed-in session of that email) and see it.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/portal");
  const card = page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ hasText: jerseyName });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("72");
  await expect(card).toContainText(/\bL\b/);
  await expectNoHorizontalScroll(page);
});
