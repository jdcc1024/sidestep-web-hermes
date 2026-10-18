import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import { seedOrder } from "./support/convex";

// U-02 (Clerk 7.9 + middleware.ts -> proxy.ts), "Done when" 1 and 2
// (backlog/U-02-clerk-7-9-proxy.md). The rename moves the auth gate from the
// Edge to the Node runtime, so these are REGRESSION GUARDS: they pass on main
// today and must still pass after the build. Same routes public, same routes
// sent to sign-in, /invite still sets its cookie and redirects to /sign-up.
//
// Done when 3 (admin signs in and opens /admin/orders/<id>) is already covered
// by e2e/support/global-setup.ts (signs in SNAP_UID through @clerk/testing,
// which the @clerk/testing bump exercises on every spec) and the test
// "admin order page shows the same list and edits it while confirmed; ..."
// in e2e/order-lock.spec.ts. No new spec for it.
//
// Locators match key words only; the build adds no new accessible names.

const SIGNED_OUT = { cookies: [], origins: [] };

function isoDate(daysAhead: number) {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

test("a signed-out visitor is sent from /portal to sign-in, but can open a player's /run form without signing in", async ({
  page,
  browser,
  tag,
  browserErrors,
}) => {
  // The captain (signed-in default session) makes an order form to get a real
  // /run/<token> link.
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);
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

  // The visitor: a fresh browser with no session.
  const ctx = await browser.newContext({
    storageState: SIGNED_OUT,
    viewport: { width: 375, height: 812 },
  });
  const visitor = await ctx.newPage();
  visitor.on("pageerror", (e) => browserErrors.push(`pageerror: ${e.message}`));

  // Protected: /portal -> sign-in.
  await visitor.goto("/portal");
  await expect(visitor).toHaveURL(/\/sign-in/);
  await expect(visitor.getByText(/sign in/i).first()).toBeVisible();
  await expectNoHorizontalScroll(visitor);

  // Public: the player form renders, and the visitor is not bounced.
  await visitor.goto(link);
  await expect(visitor.getByLabel(/your name/i)).toBeVisible();
  expect(new URL(visitor.url()).pathname).toMatch(/^\/run\//);
  await expectNoHorizontalScroll(visitor);
  await ctx.close();
});

test.describe("captain invite link", () => {
  test.use({ storageState: SIGNED_OUT });

  test("/invite?token=<id> lands on sign-up and sets the HTTP-only invite cookie", async ({
    page,
    context,
    tag,
  }) => {
    await page.goto(`/invite?token=${tag}`);
    await expect(page).toHaveURL(/\/sign-up/);

    const cookies = await context.cookies();
    const invite = cookies.find((c) => c.name === "sidestep_invite_token");
    expect(invite, "invite cookie is set").toBeDefined();
    expect(invite!.value, "invite cookie has a value").not.toBe("");
    expect(invite!.httpOnly, "invite cookie is HTTP-only").toBe(true);

    // Script can't read it.
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain("sidestep_invite_token");
  });
});
