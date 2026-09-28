// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { faqCopyText, faqUrl, siteOrigin } from "./faq";

/**
 * Acceptance tests for F-02 (backlog/F-02-faq-deep-links-and-copy.md):
 * `siteOrigin()` in lib/faq.ts, the origin copied links are built from (A1).
 * Kept apart from lib/faq.test.ts so the F-01 acceptance file stays unchanged.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lib/faq.ts: siteOrigin (F-02, A1)", () => {
  it("returns window.location.origin when NEXT_PUBLIC_SITE_URL is unset or empty", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    expect(siteOrigin()).toBe(window.location.origin);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteOrigin()).toBe(window.location.origin);
  });

  it("returns NEXT_PUBLIC_SITE_URL with the trailing / stripped when set", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://box.tail1234.ts.net/");
    expect(siteOrigin()).toBe("https://box.tail1234.ts.net");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sidestep.design");
    expect(siteOrigin()).toBe("https://sidestep.design");
  });

  it("is read at call time, not import time", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://a.test");
    expect(siteOrigin()).toBe("https://a.test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://b.test/");
    expect(siteOrigin()).toBe("https://b.test");
  });

  it("composes with faqUrl / faqCopyText into a single-slash deep link", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://box.tail1234.ts.net/");
    expect(faqUrl(siteOrigin(), "timeline")).toBe("https://box.tail1234.ts.net/#faq-timeline");
    expect(faqCopyText("Four weeks.", siteOrigin(), "timeline")).toBe(
      "Four weeks.\n\nhttps://box.tail1234.ts.net/#faq-timeline",
    );
  });
});
