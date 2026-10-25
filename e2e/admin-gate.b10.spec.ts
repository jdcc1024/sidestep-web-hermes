import { expect, test } from "./support/fixtures";
import { captainConfigured, seedOrder } from "./support/convex";

// B-10 "Done when" 2: a signed-in non-admin who opens /admin/orders/<id> sees
// the 403 page. Done when 1 (admin sees the order) is already covered by the
// admin test in order-lock.spec.ts. Done when 3 (one Clerk call forced to fail)
// needs Clerk to fail on purpose: it is a dev check on the build card.

test.describe("as a non-admin captain", () => {
  test.use({ storageState: ".auth/e2e-captain.json" });
  test.skip(
    !captainConfigured(),
    "needs a non-admin captain: set E2E_CAPTAIN_UID and E2E_CAPTAIN_PWD in .env.local",
  );

  test("non-admin opening /admin/orders/<id> sees the 403 page, not the order", async ({
    page,
    tag,
  }) => {
    const order = seedOrder(tag, "captain");
    await page.goto(`/admin/orders/${order.orderId}`);
    await expect(page.getByText(/403/)).toBeVisible();
    await expect(page.getByText(/access denied/i)).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Order Size Confirmed" }),
    ).toHaveCount(0);
  });
});
