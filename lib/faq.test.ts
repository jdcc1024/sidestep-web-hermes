import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatTierPriceList,
  isExternalHref,
  isPublishable,
  parseAnswer,
  priceRange,
  publishedFaqs,
  type Block,
  type FaqEntry,
  type Inline,
} from "./faq";
import { PRICING_TIERS } from "./pricing";

/**
 * Acceptance tests for F-01 (backlog/F-01-faq-answer-source.md), lib/faq.ts.
 * One test per acceptance criterion, named after it.
 *
 * These assert behaviour through the public contract the issue names, not the
 * shape of the parser's internals: a paragraph's inlines are compared by their
 * concatenated text, so the build is free to split or merge text runs.
 */

function inlineText(inlines: Inline[]): string {
  return inlines.map((inline) => inline.text).join("");
}

function links(inlines: Inline[]) {
  return inlines.filter(
    (inline): inline is Extract<Inline, { kind: "link" }> =>
      inline.kind === "link",
  );
}

/** Block[] with each run of inlines flattened to its text. */
function simplify(blocks: Block[]) {
  return blocks.map((block) => {
    switch (block.kind) {
      case "heading":
        return { kind: "heading", text: block.text };
      case "p":
        return { kind: "p", text: inlineText(block.content) };
      case "ul":
      case "ol":
        return { kind: block.kind, items: block.items.map(inlineText) };
    }
  });
}

function entry(overrides: Partial<FaqEntry> = {}): FaqEntry {
  return {
    id: "sample",
    question: "Is this a question?",
    answer: "Yes, it is.",
    published: true,
    ...overrides,
  };
}

describe("lib/faq.ts: parser", () => {
  it('parseAnswer("a\\nb\\n\\nc") gives two p blocks, "a b" then "c"', () => {
    expect(simplify(parseAnswer("a\nb\n\nc"))).toEqual([
      { kind: "p", text: "a b" },
      { kind: "p", text: "c" },
    ]);
  });

  it("consecutive `- x` lines form one ul, consecutive `1. x` lines form one ol, and item text excludes the marker", () => {
    expect(simplify(parseAnswer("- red\n- blue\n- green"))).toEqual([
      { kind: "ul", items: ["red", "blue", "green"] },
    ]);
    expect(simplify(parseAnswer("1. one\n2. two\n3. three"))).toEqual([
      { kind: "ol", items: ["one", "two", "three"] },
    ]);
  });

  it('"1. one\\n   more\\n2. two" gives one ol with items "one more" and "two" (continuation line)', () => {
    expect(simplify(parseAnswer("1. one\n   more\n2. two"))).toEqual([
      { kind: "ol", items: ["one more", "two"] },
    ]);
  });

  it('a line that is exactly **Head** is a heading block and the lines under it a separate p; "a **b** c" stays literal', () => {
    expect(simplify(parseAnswer("**Head**\nbody line"))).toEqual([
      { kind: "heading", text: "Head" },
      { kind: "p", text: "body line" },
    ]);
    expect(simplify(parseAnswer("a **b** c"))).toEqual([
      { kind: "p", text: "a **b** c" },
    ]);
  });

  it('[price calculator](/#pricing) is a link inline with text "price calculator" and href "/#pricing"', () => {
    const blocks = parseAnswer("See the [price calculator](/#pricing) now.");
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    if (block.kind !== "p") throw new Error(`expected p, got ${block.kind}`);

    expect(links(block.content)).toEqual([
      { kind: "link", text: "price calculator", href: "/#pricing" },
    ]);
    expect(inlineText(block.content)).toBe("See the price calculator now.");
  });

  it("[x](https://example.com/a) is a link; isExternalHref is true for https:// and false for /intake and #pricing", () => {
    const [block] = parseAnswer("[x](https://example.com/a)");
    if (block.kind !== "p") throw new Error(`expected p, got ${block.kind}`);
    expect(links(block.content)).toEqual([
      { kind: "link", text: "x", href: "https://example.com/a" },
    ]);

    expect(isExternalHref("https://example.com/a")).toBe(true);
    expect(isExternalHref("/intake")).toBe(false);
    expect(isExternalHref("#pricing")).toBe(false);
  });

  it("[x](javascript:alert(1)) and [x](http://evil) stay plain text, not links; <b>hi</b> stays literal text", () => {
    for (const md of ["[x](javascript:alert(1))", "[x](http://evil)", "<b>hi</b>"]) {
      const blocks = parseAnswer(md);
      expect(blocks, md).toHaveLength(1);
      const block = blocks[0];
      if (block.kind !== "p") throw new Error(`expected p for ${md}`);
      expect(links(block.content), md).toEqual([]);
      expect(inlineText(block.content), md).toBe(md);
    }
  });
});

describe("lib/faq.ts: publish gate", () => {
  it("isPublishable is false when unpublished or when question, answer or finePrint contains [CONFIRM; otherwise true", () => {
    expect(isPublishable(entry())).toBe(true);
    expect(isPublishable(entry({ finePrint: "Up to 3 rounds." }))).toBe(true);

    expect(isPublishable(entry({ published: false }))).toBe(false);
    expect(
      isPublishable(entry({ question: "How much? [CONFIRM: price]" })),
    ).toBe(false);
    expect(
      isPublishable(entry({ answer: "It depends.\n\n[CONFIRM: JCC to edit]" })),
    ).toBe(false);
    expect(
      isPublishable(entry({ finePrint: "[CONFIRM: how many rounds?]" })),
    ).toBe(false);
  });

  it("publishedFaqs keeps input order and drops non-publishable entries", () => {
    const entries: FaqEntry[] = [
      entry({ id: "c" }),
      entry({ id: "draft", published: false }),
      entry({ id: "a" }),
      entry({ id: "confirm", answer: "[CONFIRM: x]" }),
      entry({ id: "b" }),
    ];

    expect(publishedFaqs(entries).map((e) => e.id)).toEqual(["c", "a", "b"]);
    // Pure: the input is not reordered or trimmed.
    expect(entries.map((e) => e.id)).toEqual(["c", "draft", "a", "confirm", "b"]);
  });
});

describe("lib/faq.ts: price helpers", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/pricing");
    vi.resetModules();
  });

  // Pins today's tiers, as the issue states them. If JCC changes a tier price
  // in lib/pricing.ts, update this expectation; the derivation test below is
  // the one that proves the FAQ follows the change on its own.
  it("with the current tiers, formatTierPriceList() and priceRange() give the full list and $40 to $60", () => {
    expect(formatTierPriceList()).toBe(
      "$60 each for 5–9, $50 for 10–24, $45 for 25–49 and $40 for 50 or more",
    );
    expect(priceRange()).toBe("$40 to $60");
  });

  it("with { fromQuantity: 10 }, the 5–9 tier is dropped: list from $50 each for 10–24, range $40 to $50", () => {
    expect(formatTierPriceList({ fromQuantity: 10 })).toBe(
      "$50 each for 10–24, $45 for 25–49 and $40 for 50 or more",
    );
    expect(priceRange({ fromQuantity: 10 })).toBe("$40 to $50");
  });

  it("both price helpers are derived from PRICING_TIERS (mocked tiers change the output)", async () => {
    // Sanity: today's output agrees with the real table.
    const prices = PRICING_TIERS.map((tier) => tier.pricePerUnit);
    expect(priceRange()).toBe(`$${Math.min(...prices)} to $${Math.max(...prices)}`);

    vi.resetModules();
    vi.doMock("@/lib/pricing", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/pricing")>()),
      PRICING_TIERS: [
        { min: 5, max: 9, pricePerUnit: 61, tagline: "a" },
        { min: 10, max: 24, pricePerUnit: 51, tagline: "b" },
        { min: 25, max: null, pricePerUnit: 41, tagline: "c" },
      ],
    }));
    const mocked = await import("@/lib/faq");

    expect(mocked.formatTierPriceList()).toBe(
      "$61 each for 5–9, $51 for 10–24 and $41 for 25 or more",
    );
    expect(mocked.priceRange()).toBe("$41 to $61");
    expect(mocked.priceRange({ fromQuantity: 10 })).toBe("$41 to $51");
    expect(mocked.formatTierPriceList({ fromQuantity: 10 })).not.toContain("$61");
  });
});
