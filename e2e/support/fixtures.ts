import { test as base, expect, type Page } from "@playwright/test";
import { cleanup, newTag } from "./convex";

// Every E2E test gets:
//  - `tag`: a unique id; data made through it is deleted after the test.
//  - a console/page-error collector that fails the test on any browser error.
//    `allowBrowserErrors.push(/pattern/)` lets a test expect one, e.g. a
//    refused mutation: Convex dev forwards the server's ConvexError to the
//    console even when the app catches it and shows a friendly message.
//  - `expectNoHorizontalScroll(page)` for the 375px check.

const IGNORED = [
  /Download the React DevTools/,
  /Clerk: Clerk has been loaded with development keys/,
  /\[Fast Refresh\]/,
  /\[HMR\]/,
];

export const test = base.extend<{
  tag: string;
  allowBrowserErrors: RegExp[];
  browserErrors: string[];
}>({
  allowBrowserErrors: async ({}, provide) => {
    await provide([]);
  },
  tag: async ({}, provide) => {
    const tag = newTag();
    await provide(tag);
    cleanup(tag);
  },
  browserErrors: [
    async ({ page, allowBrowserErrors }, provide) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (!IGNORED.some((re) => re.test(text)))
          errors.push(`console: ${text}`);
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      await provide(errors);
      const unexpected = errors.filter(
        (e) => !allowBrowserErrors.some((re) => re.test(e)),
      );
      expect(unexpected, "browser errors during the test").toEqual([]);
    },
    { auto: true },
  ],
});

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, "page scrolls horizontally").toBeLessThanOrEqual(0);
}

export { expect };
