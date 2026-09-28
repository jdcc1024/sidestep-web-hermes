import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Acceptance tests for F-02 (backlog/F-02-faq-deep-links-and-copy.md), "Page":
 * the FAQ is a deep-link destination, so it loses its <Reveal> (a fade-and-rise
 * would play on the answer the visitor asked for and shift it under the nav).
 * Source-level checks: the page is a server component tree with motion that
 * jsdom can't observe, and the reveal itself is proven by
 * scripts/check-reduced-motion.mjs in the browser.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");

/** The JSX returned by Home(), with comments removed. */
function homeJsx(): string {
  const src = read("app/page.tsx")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const start = src.indexOf("export default function Home");
  expect(start, "app/page.tsx exports Home").toBeGreaterThanOrEqual(0);
  return src.slice(start);
}

const REVEALED = ["ProcessSection", "CustomizeSection", "PricingSection", "QuoteCtaSection"];

describe("app/page.tsx (F-02)", () => {
  it("no longer wraps FaqSection in <Reveal>, and every other section keeps its <Reveal>", () => {
    const jsx = homeJsx();

    // FaqSection is still rendered exactly once…
    expect(jsx.match(/<FaqSection\b/g) ?? []).toHaveLength(1);
    // …and not inside any <Reveal>…</Reveal>.
    for (const block of jsx.match(/<Reveal\b[^>]*>[\s\S]*?<\/Reveal>/g) ?? []) {
      expect(block).not.toMatch(/<FaqSection\b/);
    }

    for (const name of REVEALED) {
      expect(jsx, `${name} is wrapped in <Reveal>`).toMatch(
        new RegExp(`<Reveal\\b[^>]*>\\s*<${name}\\s*/>\\s*</Reveal>`),
      );
    }
    // The hero still owns its own entrance (unchanged).
    expect(jsx).not.toMatch(/<Reveal\b[^>]*>\s*<HeroSection/);
  });

  it("has a comment saying why the FAQ isn't revealed", () => {
    const src = read("app/page.tsx");
    const comments = (src.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).join("\n");
    expect(comments).toMatch(/FAQ|FaqSection/);
    expect(comments).toMatch(/deep.?link/i);
  });
});

describe("scripts/check-reduced-motion.mjs (F-02)", () => {
  it("check-reduced-motion.mjs targets #quote", () => {
    const src = read("scripts/check-reduced-motion.mjs");
    expect(src).toMatch(/const REVEALED_SECTION\s*=\s*['"]#quote['"]/);
    expect(src).not.toMatch(/const REVEALED_SECTION\s*=\s*['"]#faq['"]/);
  });
});
