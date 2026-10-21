import type { Locator, Page } from "@playwright/test";

/**
 * IMG-05: Download is a button with no href. Click it inside `scope` and read
 * the original's URL (/api/storage/<id>) off the request the new tab makes.
 * That request is aborted, so the click downloads nothing and the storage
 * egress guard (support/fixtures.ts) isn't tripped: a test that only needs the
 * original's id needn't be tagged @original-download.
 */
export async function originalUrlFromDownload(
  page: Page,
  scope: Locator,
): Promise<string> {
  const context = page.context();
  let seen: (url: string) => void = () => {};
  const urlSeen = new Promise<string>((resolve) => {
    seen = resolve;
  });
  const pattern = /\/api\/storage\/(?!upload)[^/?#]+$/;
  const handler = async (route: import("@playwright/test").Route) => {
    const url = route.request().url();
    if (pattern.test(url)) {
      seen(url);
      await route.abort();
    } else {
      await route.fallback();
    }
  };
  await context.route(pattern, handler);
  try {
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      scope.getByRole("button", { name: /download/i }).click(),
    ]);
    const url = await urlSeen;
    await popup.close();
    return url;
  } finally {
    await context.unroute(pattern, handler);
  }
}
