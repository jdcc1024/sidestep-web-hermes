import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import type { Browser, Page } from "@playwright/test";
import { addDesign, attachFile, seedItems, seedOrder } from "./support/convex";

// 0004 R3-01 public order form redesign, "Done when" 1-6
// (backlog/R3-01-public-form-redesign.md, docs/ux/0004-public-form.md §6).
// Looks and copy (40px height, 3-across grid, the 5 strings, dark mode) are
// reviewed from screenshots, so locators match key words only.
// Runs as SNAP_UID (an admin) to make the form; players are anonymous.
//
// Build must use these accessible names / structure:
//   picture        <img alt="<title> main image"> (DesignThumbnail); zoomable
//                  one is a button /view .* full size/i that opens a dialog
//                  holding the full-size <img>
//   no-picture     no <img alt=/main image/>, no /full size/ button; text
//                  "Design: <title>" is on the page
//   design choice  radiogroup "Design" in the Jersey 1 fieldset; one radio per
//                  design, its accessible name contains the title
//   name/number    getByLabel(/name on jersey/i), getByLabel(/^number/i) (as today)
//   sizes          buttons /add one <SIZE>\b/i (as today)
//   roster row     pick-your-name: one <button aria-expanded> per player (name
//                  contains the player's name); chips are exact text "S×1";
//                  header text "<n> jerseys"

const isoDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

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

async function usePickMode(page: Page, orderId: string) {
  await page.goto(`/portal/orders/${orderId}/run/setup`);
  const pick = page.getByRole("radio", {
    name: /players pick their name from your list/i,
  });
  await pick.check();
  await expect(pick).toBeChecked();
  await page.reload();
  await expect(
    page.getByRole("radio", { name: /players pick their name from your list/i }),
  ).toBeChecked();
}

// A player is an anonymous browser.
async function openAsPlayer(
  browser: Browser,
  browserErrors: string[],
  link: string,
  width = 375,
) {
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width, height: 812 },
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
  return { player, close: () => ctx.close() };
}

const mainPictures = (p: Page) => p.locator('img[alt*="main image" i]');

// ── Done when 1 ─────────────────────────────────────────────────────────────

test("375px: a single-design form with a PNG main picture shows it above 'Your name', and tapping it opens it full size", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  const order = seedOrder(tag);
  attachFile(order.designId, "png");
  const link = await makeOrderForm(page, order.orderId);

  const { player, close } = await openAsPlayer(browser, browserErrors, link);
  await expect(mainPictures(player).first()).toBeVisible();
  const pic = await mainPictures(player).first().boundingBox();
  const nameField = await player.getByLabel(/your name/i).boundingBox();
  expect(pic!.y + pic!.height, "picture sits above Your name").toBeLessThanOrEqual(
    nameField!.y,
  );

  await player.getByRole("button", { name: /full size/i }).click();
  const dialog = player.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img[alt*="main image" i]')).toBeVisible();
  await expectNoHorizontalScroll(player);
  await close();
});

// ── Done when 2 ─────────────────────────────────────────────────────────────

test("375px: no picture, or only a PDF, shows no picture block and 'Design: <title>' under the intro", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  const none = seedOrder(`${tag}-n`.slice(0, 40));
  const pdf = seedOrder(`${tag}-p`.slice(0, 40));
  attachFile(pdf.designId, "pdf");

  for (const [order, label] of [
    [none, "no files"],
    [pdf, "PDF only"],
  ] as const) {
    const link = await makeOrderForm(page, order.orderId);
    const { player, close } = await openAsPlayer(browser, browserErrors, link);
    await expect(mainPictures(player), label).toHaveCount(0);
    await expect(
      player.getByRole("button", { name: /full size/i }),
      label,
    ).toHaveCount(0);
    await expect(player.getByText(/design:/i).first(), label).toContainText(
      /kit/i,
    );
    await expectNoHorizontalScroll(player);
    await close();
  }
});

// ── Done when 3 ─────────────────────────────────────────────────────────────

test("375px: a two-design form has a picture tile per design, and picking 'Away Kit' shows its title, not an id", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  const order = seedOrder(tag);
  const away = addDesign(tag, order.orderId, "Away Kit");
  attachFile(order.designId, "png");
  attachFile(away.designId, "png");
  const link = await makeOrderForm(page, order.orderId);

  const { player, close } = await openAsPlayer(browser, browserErrors, link);
  // One tile per design, above the form.
  const tiles = player.getByRole("button", { name: /full size/i });
  await expect(tiles).toHaveCount(2);
  const tile = await tiles.first().boundingBox();
  const nameField = await player.getByLabel(/your name/i).boundingBox();
  expect(tile!.y + tile!.height).toBeLessThanOrEqual(nameField!.y);

  const jersey = player.getByRole("group", { name: /jersey 1/i });
  const choices = jersey.getByRole("radiogroup", { name: /design/i });
  await expect(choices.getByRole("radio")).toHaveCount(2);
  await choices.getByRole("radio", { name: /away kit/i }).click();
  await expect(choices.getByRole("radio", { name: /away kit/i })).toBeChecked();
  await expect(choices.getByRole("radio", { name: /away kit/i })).toContainText(
    /away kit/i,
  );
  // No raw Convex id (32 lowercase alphanumerics) anywhere in the card.
  await expect(jersey).not.toContainText(/[a-z0-9]{28,}/);
  await expectNoHorizontalScroll(player);
  await close();
});

// ── Done when 4 ─────────────────────────────────────────────────────────────

for (const width of [375, 1280]) {
  test(`${width}px: Name on jersey and Number share a row, and every size button is the same width`, async ({
    page,
    browser,
    tag,
    browserErrors,
  }) => {
    const order = seedOrder(tag);
    const link = await makeOrderForm(page, order.orderId);
    const { player, close } = await openAsPlayer(
      browser,
      browserErrors,
      link,
      width,
    );
    const jersey = player.getByRole("group", { name: /jersey 1/i });
    const name = await jersey.getByLabel(/name on jersey/i).boundingBox();
    const num = await jersey.getByLabel(/^number/i).boundingBox();
    expect(Math.abs(name!.y - num!.y), "same top edge").toBeLessThanOrEqual(1);
    expect(num!.x, "Number is beside the name, not under it").toBeGreaterThan(
      name!.x + name!.width - 1,
    );

    const buttons = jersey.getByRole("button", { name: /add one/i });
    const count = await buttons.count();
    expect(count).toBeGreaterThan(3);
    const widths: number[] = [];
    for (let i = 0; i < count; i++)
      widths.push((await buttons.nth(i).boundingBox())!.width);
    expect(
      Math.max(...widths) - Math.min(...widths),
      `size button widths ${widths.join(",")}`,
    ).toBeLessThanOrEqual(1);
    await expectNoHorizontalScroll(player);
    await close();
  });
}

// ── Done when 5 ─────────────────────────────────────────────────────────────

test("375px: pick-your-name: Sidestep's row closes with S×1 M×2 XL×1, Avery's opens, 4 jerseys, and Submit sends those 4", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  const order = seedOrder(tag);
  seedItems(tag, order.orderId, [
    { name: "Sidestep", number: "72" },
    { name: "Avery Quinn", number: "7" },
  ]);
  const link = await makeOrderForm(page, order.orderId);
  await usePickMode(page, order.orderId);

  const { player, close } = await openAsPlayer(browser, browserErrors, link);
  const row = (name: RegExp) =>
    player.locator("form button[aria-expanded]").filter({ hasText: name });
  const sidestep = row(/sidestep/i);
  const avery = row(/avery quinn/i);

  // Nothing is open by default.
  await expect(sidestep).toHaveAttribute("aria-expanded", "false");
  await expect(avery).toHaveAttribute("aria-expanded", "false");

  await sidestep.click();
  await expect(sidestep).toHaveAttribute("aria-expanded", "true");
  for (const size of ["S", "M", "M", "XL"])
    await player
      .getByRole("button", { name: new RegExp(`add one ${size}\\b.*sidestep`, "i") })
      .click();

  await avery.click();
  await expect(sidestep).toHaveAttribute("aria-expanded", "false");
  await expect(avery).toHaveAttribute("aria-expanded", "true");
  await expect(sidestep.getByText("S×1", { exact: true })).toBeVisible();
  await expect(sidestep.getByText("M×2", { exact: true })).toBeVisible();
  await expect(sidestep.getByText("XL×1", { exact: true })).toBeVisible();
  await expect(player.getByText(/\b4 jerseys\b/i)).toBeVisible();
  await expectNoHorizontalScroll(player);

  await player.getByLabel(/your name/i).fill(`Pat ${tag.slice(-6)}`);
  await player.getByLabel(/your email/i).fill(`${tag}@example.com`);
  await player.getByRole("button", { name: /^submit/i }).click();
  await expect(player.getByRole("status")).toBeVisible();
  await close();

  // The captain's list has exactly those 4 jerseys on Sidestep.
  await page.goto(`/portal/orders/${order.orderId}`);
  const mine = page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ hasText: /sidestep/i });
  await expect(mine.getByText("S×1", { exact: true })).toBeVisible();
  await expect(mine.getByText("M×2", { exact: true })).toBeVisible();
  await expect(mine.getByText("XL×1", { exact: true })).toBeVisible();
  await expect(page.getByText(/\b4 jerseys\b/i).first()).toBeVisible();
});

// ── Done when 6 ─────────────────────────────────────────────────────────────

test("375px: pick-your-name: numbers 7, 12 and 72 share a right edge, and a 29-character name stays on one line, truncated", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  const longName = "Alexandra Vandermeulen-Okafor"; // 29 characters
  expect(longName).toHaveLength(29);
  const order = seedOrder(tag);
  seedItems(tag, order.orderId, [
    { name: "Avery Quinn", number: "7" },
    { name: "Sam Okafor", number: "12" },
    { name: "Sidestep", number: "72" },
    { name: longName, number: "9" },
  ]);
  const link = await makeOrderForm(page, order.orderId);
  await usePickMode(page, order.orderId);

  const { player, close } = await openAsPlayer(browser, browserErrors, link);
  const rows = player.locator("form button[aria-expanded]");
  await expect(rows).toHaveCount(4);

  // Measure in the page: right edge of the number's text, and whether the
  // name's box is one line, clipped, and inside its row.
  const measured = await rows.evaluateAll((buttons, long) => {
    const textNodes = (el: Element) => {
      const out: Text[] = [];
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n as Text);
      return out;
    };
    return buttons.map((b) => {
      const nodes = textNodes(b);
      const numNode = nodes.find((n) => /^\s*#?\d+\s*$/.test(n.data));
      const nameNode = nodes.find((n) => n.data.includes("Okafor") || n.data.includes(long));
      const range = (n: Text | undefined) => {
        if (!n) return null;
        const r = document.createRange();
        r.selectNodeContents(n);
        return r;
      };
      const nr = range(numNode);
      const nameEl = nameNode?.parentElement ?? null;
      const nameRange = range(nameNode);
      return {
        text: b.textContent ?? "",
        numberRight: nr ? nr.getBoundingClientRect().right : null,
        nameLines: nameRange
          ? new Set(Array.from(nameRange.getClientRects()).map((r) => Math.round(r.top))).size
          : null,
        nameClipped: nameEl ? nameEl.scrollWidth > nameEl.clientWidth + 1 : null,
        nameBoxRight: nameEl ? nameEl.getBoundingClientRect().right : null,
        rowRight: b.getBoundingClientRect().right,
        rowHeight: b.getBoundingClientRect().height,
      };
    });
  }, longName);

  const withNumber = measured.filter((m) => m.numberRight !== null);
  expect(withNumber).toHaveLength(4);
  const edges = withNumber.map((m) => m.numberRight!);
  expect(
    Math.max(...edges) - Math.min(...edges),
    `number right edges ${edges.join(",")}`,
  ).toBeLessThanOrEqual(1);

  const long = measured.find((m) => m.text.includes("Vandermeulen"))!;
  expect(long.nameLines, "name on one line").toBe(1);
  expect(long.nameClipped, "name is truncated").toBe(true);
  expect(long.nameBoxRight!, "name stays inside its row").toBeLessThanOrEqual(
    long.rowRight,
  );
  expect(long.rowHeight, "row stays one line tall").toBeLessThanOrEqual(56);
  await expectNoHorizontalScroll(player);
  await close();
});
