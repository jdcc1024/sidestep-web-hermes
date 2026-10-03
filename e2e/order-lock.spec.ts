import { expect, expectNoHorizontalScroll, test } from "./support/fixtures";
import { seedItems, seedOrder, setConfirmed } from "./support/convex";

// L-06 "Done when": once JCC confirms the order size, the captain's order page
// says the list is locked for production, offers no way to change it, still
// lets them download the CSV, and has a working "Email us" link. Unconfirming
// gives the controls back. Runs at 1280px and 375px with no browser errors and
// no horizontal scroll. Wording is reviewed from screenshots, so locators match
// the key word only.
//
// The second test needs SNAP_UID to be an admin (it drives /admin).

test("captain sees a locked list: note with a mailto link, no edit controls, CSV still works", async ({ page, tag }) => {
  const order = seedOrder(tag);
  seedItems(tag, order.orderId, [
    { name: "Sidestep", number: "72", size: "M" },
    { name: "Riley Park", number: "7", size: "L", qty: 2 },
  ]);

  // Before confirming: the list is editable.
  await page.goto(`/portal/orders/${order.orderId}`);
  await expect(page.getByRole("button", { name: /add item/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^edit /i }).first()).toBeVisible();
  await expect(page.getByText(/locked for production/i)).toHaveCount(0);

  // JCC confirms the order size: the page updates without a reload.
  setConfirmed(tag, order.orderId, true);
  await expect(page.getByText(/locked for production/i)).toBeVisible();
  await expectNoHorizontalScroll(page);

  // No way to change the list.
  await expect(page.getByRole("button", { name: /add item/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /paste a list/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /copy from/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^edit /i })).toHaveCount(0);

  // The list is still there, and the captain can still take it out.
  await expect(page.getByText("Sidestep").first()).toBeVisible();
  await page.getByRole("button", { name: /download csv/i }).first().click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /by name/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);

  // "Email us" is a real, keyboard-reachable mailto link with a focus ring.
  const emailUs = page.getByRole("link", { name: /email us/i });
  await expect(emailUs).toHaveAttribute("href", "mailto:info@sidestep.design");
  await emailUs.focus();
  await expect(emailUs).toBeFocused();
  const ring = await emailUs.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0,
      shadow: s.boxShadow !== "none",
    };
  });
  expect(ring.outline || ring.shadow, "visible focus ring on Email us").toBe(true);

  // No raw server text on the page.
  await expect(page.getByText(/CONVEX|ConvexError|Request ID/)).toHaveCount(0);

  // Unconfirming gives the controls back, live.
  setConfirmed(tag, order.orderId, false);
  await expect(page.getByRole("button", { name: /add item/i })).toBeVisible();
  await expect(page.getByText(/locked for production/i)).toHaveCount(0);
});

test("admin order page shows the same list and edits it while confirmed; confirming is refused while an item needs a size", async ({ page, tag }) => {
  const order = seedOrder(tag);
  seedItems(tag, order.orderId, [
    { name: "Sidestep", number: "72", size: "M" },
    { name: "Jordan Lee", number: "4" }, // Needs size
  ]);

  await page.goto(`/admin/orders/${order.orderId}`);
  await expect(page.getByText("Jordan Lee").first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Confirming is refused and names the item that needs a size.
  await page.getByRole("checkbox", { name: "Order Size Confirmed" }).click();
  await expect(page.getByText(/Jordan Lee #4/)).toBeVisible();
  await expect(page.getByText(/needs? a size/i).first()).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Order Size Confirmed" })).not.toBeChecked();

  // Give Jordan a size from the admin page (same list, same controls).
  await page.getByRole("button", { name: /edit jordan lee/i }).click();
  await page.getByRole("dialog").getByRole("radio", { name: /^m$/i }).check();
  await page.getByRole("dialog").getByRole("button", { name: /save/i }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Now it confirms, and the list shows a locked badge but keeps its controls.
  await page.getByRole("checkbox", { name: "Order Size Confirmed" }).click();
  await expect(page.getByRole("checkbox", { name: "Order Size Confirmed" })).toBeChecked();
  await expect(page.getByText(/locked for production/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /add item/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /edit sidestep/i })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
