import { expect, test } from "./support/fixtures";
import type { Page, Response } from "@playwright/test";
import { addDesign, attachBigPng, seedOrder } from "./support/convex";

// IMG-02 (backlog/IMG-02-e2e-storage-egress-guard.md) "Done when" 1:
// the big-PNG fixture is stored once and reused, so the optimizer's source
// URL stays the same and later loads are cache hits instead of a fresh pull
// from Convex storage.
//
// "Done when" 2 (a plain <img> of a stored print file fails with its URL) is
// proved at review by a throwaway scratch spec, not a committed failing test.
//
// Needs from the build: `attachBigPng` reuses an existing blob (same sha256).

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
  return page.evaluate(() => navigator.clipboard.readText());
}

// The storage id each /_next/image response was made from, plus its cache header.
async function loadForm(page: Page, link: string) {
  const seen: { source: string; cache: string | undefined }[] = [];
  const onResponse = (r: Response) => {
    if (!r.url().includes("/_next/image")) return;
    const source = new URL(r.url()).searchParams.get("url") ?? "";
    seen.push({ source, cache: r.headers()["x-nextjs-cache"] });
  };
  page.on("response", onResponse);
  await page.goto(link);
  await expect(page.getByLabel(/your name/i)).toBeVisible();
  await expect(page.locator('img[alt*="main image" i]').first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  page.off("response", onResponse);
  return seen;
}

test("the big PNG is stored once and reused: two designs share one source, and a second visit is all cache hits", async ({
  page,
  browser,
  tag,
}) => {
  test.setTimeout(120_000);
  const order = seedOrder(tag);
  const second = addDesign(tag, order.orderId, "second kit");
  await attachBigPng(order.designId);
  await attachBigPng(second.designId);
  const link = await makeOrderForm(page, order.orderId);

  const visit = async () => {
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 375, height: 812 },
    });
    const player = await ctx.newPage();
    const seen = await loadForm(player, link);
    await ctx.close();
    return seen;
  };

  const first = await visit();
  const sources = new Set(first.map((s) => s.source));
  expect(sources.size, "both designs' pictures come from one stored blob").toBe(
    1,
  );

  const again = await visit();
  expect(again.length, "second visit loads pictures through the optimizer").toBeGreaterThan(0);
  expect(
    again.filter((s) => s.cache !== "HIT"),
    "second visit: every optimizer response is a cache hit",
  ).toEqual([]);
});
