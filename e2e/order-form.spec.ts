import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import { seedOrder } from "./support/convex";

// L-05 "Done when": a captain makes an order form from the order page, copies
// its link, and manages it (deadline, questions, names mode) from Form
// settings. Runs at 1280px and 375px with no browser errors and no
// horizontal scroll. Wording is reviewed from screenshots, so locators match
// loosely on the key word only.

function isoDate(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test("captain makes an order form, copies its link, and opens Form settings", async ({ page, context, tag }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const order = seedOrder(tag);

  await page.goto(`/portal/orders/${order.orderId}`);
  await expectNoHorizontalScroll(page);

  // The deadline is asked here and only here, after pressing the button.
  await expect(page.getByLabel(/deadline/i)).toHaveCount(0);
  await page.getByRole("button", { name: /make an order form/i }).click();
  await page.getByLabel(/deadline/i).fill(isoDate(14));
  await page.getByRole("dialog").getByRole("button", { name: /make|create|start/i }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The form exists: open, with a closing date, a copyable link and settings.
  await expect(page.getByText(/^open$/i)).toBeVisible();
  await expect(page.getByText(/closes/i)).toBeVisible();
  await page.getByRole("button", { name: /copy link/i }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/\/run\/[a-z0-9]+$/);
  await expectNoHorizontalScroll(page);

  // The link a captain shares opens the public form.
  const player = await context.newPage();
  await player.goto(copied);
  await expect(player.getByRole("heading").first()).toBeVisible();
  await player.close();

  // Names mode lives in Form settings now, not on the order page.
  await expect(page.getByRole("radio", { name: /players type their own name/i })).toHaveCount(0);
  await page.getByRole("link", { name: /form settings/i }).click();
  await expect(page).toHaveURL(new RegExp(`/portal/orders/${order.orderId}/run/setup$`));
  await expect(page.getByRole("radio", { name: /players type their own name and number/i })).toBeVisible();
  await page.getByRole("radio", { name: /players pick their name from your list/i }).check();
  await expect(page.getByRole("radio", { name: /players pick their name from your list/i })).toBeChecked();
  await expectNoHorizontalScroll(page);
});
