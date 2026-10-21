import type { Locator, Page } from "@playwright/test";

/**
 * IMG-05: Download is a button with no href. Click it inside `scope` and read
 * the original's URL (/api/storage/<id>) off the popup it opens.
 */
export async function originalUrlFromDownload(
  page: Page,
  scope: Locator,
): Promise<string> {
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    scope.getByRole("button", { name: /download/i }).click(),
  ]);
  await popup.waitForURL(/\/api\/storage\//, { timeout: 15_000 });
  const url = popup.url();
  await popup.close();
  return url;
}
