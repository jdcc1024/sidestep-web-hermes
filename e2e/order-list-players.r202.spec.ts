import {
  expect,
  expectNoHorizontalScroll,
  test,
} from "./support/fixtures";
import type { Page } from "@playwright/test";
import { seedOrder } from "./support/convex";

// R2-02 "Done when" 1-3 (initiative 0004, phase 1b). JCC: "take Sidestep #72,
// then add multiple order items for that roster entry (1 small, 3 medium,
// 1 XL)". One player row, several sizes per sheet, at 375px.
// Wording is reviewed from screenshots, so locators match the key word only.
// Runs as SNAP_UID (an admin): admins edit through the same list and controls
// as a captain; the lock rules are covered by order-lock.spec.ts.
//
// Build must use these accessible names:
//   button  /add player/i                    opens the sheet (the list's + Add player)
//   fields  /^name/i, /^number/i             in the dialog
//   buttons /add one <SIZE>\b/i, /remove one <SIZE>\b/i    size counters in the dialog
//   button  /^add sidestep/i                 submit when no match ("Add Sidestep #72 · 5 jerseys")
//   button  /^add 1 to/i                     submit when the player already exists
//   text    /already on/i                    the match notice
//   button  /^edit sidestep/i                a row's edit control
//   button  /^save/i                         edit sheet save
//   button  /remove player/i, toast /undo/i
//   row text: chips "M×3", "<n> jerseys", "Added by"; design line "<n> player(s)"

test.use({ viewport: { width: 375, height: 812 } });

const sheet = (page: Page) => page.getByRole("dialog");
const rows = (page: Page) =>
  page.getByRole("main").getByRole("listitem").filter({ hasText: /sidestep/i });
const size = (page: Page, verb: "add" | "remove", s: string) =>
  sheet(page).getByRole("button", {
    name: new RegExp(`${verb} one ${s}\\b`, "i"),
  });

async function fillPlayer(page: Page, name: string) {
  await sheet(page).getByLabel(/^name/i).fill(name);
  await sheet(page).getByLabel(/^number/i).fill("72");
}

async function addSidestep(page: Page) {
  await page.getByRole("button", { name: /add player/i }).first().click();
  await fillPlayer(page, "Sidestep");
  await size(page, "add", "S").click();
  for (let i = 0; i < 3; i++) await size(page, "add", "M").click();
  await size(page, "add", "XL").click();
  await sheet(page).getByRole("button", { name: /^add sidestep/i }).click();
  await expect(sheet(page)).toHaveCount(0);
}

test("375px: a captain adds Sidestep #72 with 1 S, 3 M and 1 XL in one sheet and sees one player row", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);

  await addSidestep(page);

  await expect(rows(page)).toHaveCount(1);
  const row = rows(page).first();
  await expect(row).toContainText("S");
  await expect(row).toContainText(/M\s*×\s*3/);
  await expect(row).toContainText("XL");
  await expect(row).toContainText(/5 jerseys/i);
  await expectNoHorizontalScroll(page);
  await expect(
    page.getByRole("main").getByText(/CONVEX|ConvexError|Request ID/),
  ).toHaveCount(0);
});

test("adding ' sidestep ' #72 again with an L joins the player; lowering M to 2 updates row, design line and footer live", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);
  await addSidestep(page);
  await expect(rows(page)).toHaveCount(1);

  // Same player, different case and spacing, one more size.
  await page.getByRole("button", { name: /add player/i }).first().click();
  await fillPlayer(page, " sidestep ");
  await expect(sheet(page).getByText(/already on/i)).toBeVisible();
  await size(page, "add", "L").click();
  await sheet(page).getByRole("button", { name: /^add 1 to/i }).click();
  await expect(sheet(page)).toHaveCount(0);

  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("L");
  await expect(rows(page).first()).toContainText(/6 jerseys/i);
  await expect(page.getByText(/1 player/i).first()).toBeVisible();

  // Lower M from 3 to 2 in the edit sheet; no refresh.
  await page.getByRole("button", { name: /^edit sidestep/i }).click();
  await size(page, "remove", "M").click();
  await sheet(page).getByRole("button", { name: /^save/i }).click();
  await expect(sheet(page)).toHaveCount(0);

  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(/M\s*×\s*2/);
  await expect(rows(page).first()).toContainText(/5 jerseys/i);
  const main = page.getByRole("main");
  // Row, design line and footer all say 5; nothing still says 6.
  await expect(main.getByText(/5 jerseys/i).nth(2)).toBeVisible();
  await expect(main.getByText(/6 jerseys/i)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("removing Sidestep #72 and pressing Undo brings the row back with the same sizes and 'Added by'", async ({
  page,
  tag,
}) => {
  const order = seedOrder(tag);
  await page.goto(`/portal/orders/${order.orderId}`);
  await addSidestep(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(/added by/i);

  await page.getByRole("button", { name: /^edit sidestep/i }).click();
  await sheet(page).getByRole("button", { name: /remove player/i }).click();
  await expect(rows(page)).toHaveCount(0);

  await page.getByRole("button", { name: /undo/i }).click();
  await expect(rows(page)).toHaveCount(1);
  const row = rows(page).first();
  await expect(row).toContainText(/M\s*×\s*3/);
  await expect(row).toContainText("XL");
  await expect(row).toContainText(/5 jerseys/i);
  await expect(row).toContainText(/added by/i);
  await expectNoHorizontalScroll(page);
});
