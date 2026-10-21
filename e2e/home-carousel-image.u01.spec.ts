import {
  expect,
  expectNoHorizontalScroll,
  test,
} from "./support/fixtures";

// U-01 Next 16.4 + React 19.3, "Done when" 1 (backlog/U-01-next-16-4-react-19-3.md).
// Regression guard for the image optimizer (sharp 0.35): the first carousel
// jersey on the home page must come back through /_next/image as WebP.
// May already pass on Next 16.2; that is expected.
//
// Build must keep: the first carousel slide is an <img alt="Heartbreakers">
// rendered by next/image (no `unoptimized`), visible on the home page.
// Visitor test: no signed-in session. Locators are loose on purpose.

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 375, height: 812 },
});

test("a phone visitor sees the first carousel jersey, resized by /_next/image as WebP", { tag: ["@pinned-375", "@smoke"] }, async ({
  page,
}) => {
  const imageResponses: { url: string; type: string; status: number }[] = [];
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/_next/image")) {
      imageResponses.push({
        url,
        type: res.headers()["content-type"] ?? "",
        status: res.status(),
      });
    }
  });

  await page.goto("/");

  const first = page.getByRole("img", { name: /heartbreakers/i }).first();
  await expect(first).toBeVisible();

  // wait until the browser has actually decoded it
  await expect
    .poll(() => first.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true);

  // the <img> points at the optimizer, not at the raw 3.6 MB-class PNG
  const src = (await first.evaluate((el: HTMLImageElement) => el.currentSrc)) ?? "";
  expect(src, "image src").toContain("/_next/image");
  expect(decodeURIComponent(src)).toContain("01-heartbreakers");

  // and the optimizer answered 200 image/webp for that file
  const mine = imageResponses.filter((r) =>
    decodeURIComponent(r.url).includes("01-heartbreakers"),
  );
  expect(mine.length, "a /_next/image response for the first jersey").toBeGreaterThan(0);
  expect(mine[0].status).toBe(200);
  expect(mine[0].type).toMatch(/image\/webp/);

  await expectNoHorizontalScroll(page);
});
