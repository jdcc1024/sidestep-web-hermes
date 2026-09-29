import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FAQ, FAQ_SECTION, PERMANENT_IDS } from "./faq";
import {
  formatTierPriceList,
  isPublishable,
  parseAnswer,
  priceRange,
  toPlainText,
  type Block,
  type FaqEntry,
} from "@/lib/faq";
import { DESIGN_FEE } from "@/lib/pricing";

/**
 * Content lint for content/faq.ts, plus the F-01 acceptance criteria that are
 * about the content itself (backlog/F-01-faq-answer-source.md).
 *
 * This is the file JCC's edits must keep green. The approved §3 wording that
 * F-03 publishes is pinned in content/faq.approved.test.ts, which replaced
 * the F-01 "unpublished entries" and "regression" blocks that used to be here.
 */

const SOURCE = readFileSync(join(process.cwd(), "content", "faq.ts"), "utf-8");

function byId(id: string): FaqEntry {
  const found = FAQ.find((e) => e.id === id);
  if (!found) throw new Error(`No FAQ entry with id "${id}"`);
  return found;
}

function externalLinks(blocks: Block[]) {
  const inlines = blocks.flatMap((block) => {
    switch (block.kind) {
      case "p":
        return block.content;
      case "ul":
      case "ol":
        return block.items.flat();
      default:
        return [];
    }
  });
  return inlines.filter(
    (inline) => inline.kind === "link" && inline.href.startsWith("https://"),
  ) as Array<{ kind: "link"; text: string; href: string }>;
}

describe("content/faq.ts: content lint", () => {
  it("ids are unique and match /^[a-z0-9]+(-[a-z0-9]+)*$/", () => {
    const ids = FAQ.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("FAQ ids in order are exactly cost, minimum, timeline, process, design, design-tips, colour, shipping", () => {
    expect(FAQ.map((e) => e.id)).toEqual([
      "cost",
      "minimum",
      "timeline",
      "process",
      "design",
      "design-tips",
      "colour",
      "shipping",
    ]);
  });

  it("every id in PERMANENT_IDS exists in FAQ and is published", () => {
    // Ids only ever get appended: the 4 ids live before F-01 must stay.
    expect(PERMANENT_IDS).toEqual(
      expect.arrayContaining(["minimum", "timeline", "design", "shipping"]),
    );
    for (const id of PERMANENT_IDS) {
      const found = FAQ.find((e) => e.id === id);
      expect(found, `PERMANENT_IDS has "${id}" but FAQ does not`).toBeDefined();
      expect(found?.published, `"${id}" must stay published`).toBe(true);
      expect(isPublishable(found!), `"${id}" must pass the publish gate`).toBe(true);
    }
  });

  it("every entry marked published: true passes isPublishable", () => {
    for (const e of FAQ.filter((e) => e.published)) {
      expect(isPublishable(e), `"${e.id}" is published but not publishable`).toBe(true);
    }
  });

  it("every answer parses into at least one block", () => {
    for (const e of FAQ) {
      expect(parseAnswer(e.answer).length, `"${e.id}" answer is empty`).toBeGreaterThan(0);
    }
  });

  it("the 6 done_when topics each have a published, publishable entry (cost, minimum, timeline, process, design-tips, colour)", () => {
    // Register done_when: lead time, order cost, MOQ, design tips, the design
    // process, screen-vs-print colour. D6b puts design-tips back in (F-03).
    for (const id of ["cost", "minimum", "timeline", "process", "design-tips", "colour"]) {
      expect(isPublishable(byId(id)), `"${id}" is not live`).toBe(true);
    }
  });

  it("cost answer interpolates formatTierPriceList/priceRange from 10 and DESIGN_FEE, and does not mention 5–9 (A4 = A)", () => {
    const { answer } = byId("cost");
    expect(answer).toContain(formatTierPriceList({ fromQuantity: 10 }));
    expect(answer).toContain(priceRange({ fromQuantity: 10 }));
    expect(answer).toContain(`$${DESIGN_FEE}`);
    expect(answer).not.toContain("5–9");
  });

  it("no price literal: the source of content/faq.ts has no match for /\\$\\d/", () => {
    const matches = SOURCE.split("\n")
      .map((line, i) => ({ line: i + 1, text: line }))
      .filter(({ text }) => /\$\d/.test(text));
    expect(matches, "price literals in content/faq.ts").toEqual([]);
  });

  it('colour parses into exactly 3 headings ("Screen Glow vs Fabric", "Screen differences", "Lighting and Cameras") and one https://www.tissus-print.com/ link', () => {
    const blocks = parseAnswer(byId("colour").answer);
    const headings = blocks.filter((b) => b.kind === "heading");
    expect(headings).toEqual([
      { kind: "heading", text: "Screen Glow vs Fabric" },
      { kind: "heading", text: "Screen differences" },
      { kind: "heading", text: "Lighting and Cameras" },
    ]);

    const external = externalLinks(blocks);
    expect(external).toHaveLength(1);
    expect(external[0].href.startsWith("https://www.tissus-print.com/")).toBe(true);
  });

  it("colour plain text has no **, keeps heading + body on adjacent lines, and ends with the Tissus Print sentence then its URL", () => {
    const blocks = parseAnswer(byId("colour").answer);
    const [link] = externalLinks(blocks);
    const plain = toPlainText(blocks);

    expect(plain).not.toContain("**");
    expect(plain).toContain("Screen Glow vs Fabric\nYour phone lights up");
    expect(plain.endsWith(`Tissus Print explains it well.\n${link.href}`)).toBe(true);
  });

  it("FAQ_SECTION equals the D11 values (eyebrow, heading, subtitle, cta prompt/label/href)", () => {
    expect(FAQ_SECTION).toEqual({
      eyebrow: "FAQ",
      heading: "Common questions, answered.",
      subtitle: "Straight answers to what captains ask us most.",
      cta: {
        prompt: "Didn't see your question?",
        label: "Get a quote and ask us",
        href: "/intake",
      },
    });
  });
});
