import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { appendFileSync } from "node:fs";
import {
  directStorageFailure,
  isDirectStorage,
  nextImageCache,
  ORIGINAL_DOWNLOAD_TAG,
  type Download,
  type EgressLine,
} from "../../lib/e2eEgress";
import { cleanup, newTag } from "./convex";
import { EGRESS_LOG } from "./global-teardown";

// Every E2E test gets:
//  - `tag`: a unique id; data made through it is deleted after the test.
//  - a console/page-error collector that fails the test on any browser error.
//    `allowBrowserErrors.push(/pattern/)` lets a test expect one, e.g. a
//    refused mutation: Convex dev forwards the server's ConvexError to the
//    console even when the app catches it and shows a friendly message.
//  - `expectNoHorizontalScroll(page)` for the 375px check.
//  - a storage egress guard (IMG-02): on the test's context and on any
//    context it opens through `browser`, it adds up bytes fetched straight
//    from Convex storage (`/api/storage/`, not via `/_next/image`) and fails
//    the test over 1 MB, listing the URLs. Convex file egress is a small
//    team-wide quota, so render pictures through a preset. A test that
//    really needs an original opts out with the tag:
//      test("...", { tag: "@original-download" }, async ({ page }) => ...)
//    It also counts `/_next/image` cache HIT / MISS, and logs one line per
//    test for the run report printed by global-teardown.ts.

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
  storageEgress: void;
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
  storageEgress: [
    async ({ context, browser }, provide, testInfo) => {
      const downloads: Promise<Download>[] = [];
      const cache = { hit: 0, miss: 0, other: 0 };
      const watched = new WeakSet<BrowserContext>();
      const watch = (ctx: BrowserContext) => {
        if (watched.has(ctx)) return;
        watched.add(ctx);
        ctx.on("response", (response) => {
          const url = response.url();
          const headers = response.headers();
          const bucket = nextImageCache(url, headers["x-nextjs-cache"]);
          if (bucket) cache[bucket] += 1;
          if (!isDirectStorage(url)) return;
          downloads.push(
            response.body().then(
              (body) => ({ url, bytes: body.length }),
              // Page closed or a redirect: the header is the best we have.
              () => ({ url, bytes: Number(headers["content-length"]) || 0 }),
            ),
          );
        });
      };
      watch(context);

      // Contexts the test opens itself (e.g. a signed-out player) are
      // covered too. `newPage` makes its own context.
      const { newContext, newPage } = browser;
      browser.newContext = async (...args: Parameters<Browser["newContext"]>) => {
        const ctx = await newContext.apply(browser, args);
        watch(ctx);
        return ctx;
      };
      browser.newPage = async (...args: Parameters<Browser["newPage"]>) => {
        const page = await newPage.apply(browser, args);
        watch(page.context());
        return page;
      };

      await provide();

      browser.newContext = newContext;
      browser.newPage = newPage;
      const settled = await Promise.allSettled(downloads);
      const direct = settled.flatMap((s) =>
        s.status === "fulfilled" ? [s.value] : [],
      );
      const line: EgressLine = {
        test: testInfo.titlePath.join(" › "),
        directBytes: direct.reduce((sum, d) => sum + d.bytes, 0),
        ...cache,
      };
      appendFileSync(EGRESS_LOG, `${JSON.stringify(line)}\n`);

      if (testInfo.tags.includes(ORIGINAL_DOWNLOAD_TAG)) return;
      expect(
        directStorageFailure(direct),
        "storage egress: fetched straight from Convex storage",
      ).toBeNull();
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
