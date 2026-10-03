import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import { seedOrder } from "./support/convex";

// Baseline: a signed-in captain can open the portal and one of their orders
// with no browser errors, at desktop and 375px.
test("captain opens the portal and an order", async ({ page, tag }) => {
  const order = seedOrder(tag);

  await page.goto("/portal");
  await expect(page.getByRole("heading", { name: order.teamName, exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto(`/portal/orders/${order.orderId}`);
  await expect(page.getByRole("heading", { name: order.teamName })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
