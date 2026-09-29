import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FAQ, PERMANENT_IDS } from "./faq";
import {
  APPROVED_FAQ,
  APPROVED_IDS,
  TISSUS_PRINT_URL,
  approved,
  collapse,
} from "./__fixtures__/faq-approved";
import {
  isPublishable,
  parseAnswer,
  publishedFaqs,
  toPlainText,
  type FaqEntry,
} from "@/lib/faq";
import { DESIGN_FEE } from "@/lib/pricing";

/**
 * Acceptance tests for F-03 (backlog/F-03-faq-content-pass.md): the content
 * side. content/faq.ts must carry JCC's approved §3 wording (the expected
 * text lives in ./__fixtures__/faq-approved.ts) and publish all 8 entries.
 *
 * "Same wording" is checked two ways, as the issue asks: the Markdown with all
 * whitespace collapsed (same words and punctuation, same `**` / `[…](…)`
 * syntax), and the parsed block structure (so blank lines, i.e. paragraph and
 * list boundaries, matter while line breaks inside a paragraph don't).
 *
 * Rendering and Copy answer on the real content are in
 * components/marketing/FaqSection.content.test.tsx.
 */

const SOURCE = readFileSync(join(process.cwd(), "content", "faq.ts"), "utf-8");

const ORDER = [
  "cost",
  "minimum",
  "timeline",
  "process",
  "design",
  "design-tips",
  "colour",
  "shipping",
];

function byId(id: string): FaqEntry {
  const found = FAQ.find((e) => e.id === id);
  if (!found) throw new Error(`No FAQ entry with id "${id}"`);
  return found;
}

const plain = (answer: string) => toPlainText(parseAnswer(answer));

describe("F-03: published set and order", () => {
  it("the fixture's order is the issue's order (guards the fixture itself)", () => {
    expect(APPROVED_IDS).toEqual(ORDER);
  });

  it("published entries, in order, are exactly cost, minimum, timeline, process, design, design-tips, colour, shipping (8); no entry is published: false", () => {
    expect(FAQ.filter((e) => e.published).map((e) => e.id)).toEqual(ORDER);
    expect(publishedFaqs(FAQ).map((e) => e.id)).toEqual(ORDER);
    expect(FAQ.filter((e) => !e.published).map((e) => e.id)).toEqual([]);
  });

  it("PERMANENT_IDS equals the 8 published ids, in the order above", () => {
    expect([...PERMANENT_IDS]).toEqual(ORDER);
  });

  it("no published entry contains [CONFIRM, and the content/faq.ts source has no [CONFIRM at all", () => {
    for (const e of FAQ.filter((e) => e.published)) {
      for (const text of [e.question, e.answer, e.finePrint ?? ""]) {
        expect(text, `"${e.id}"`).not.toContain("[CONFIRM");
      }
      expect(isPublishable(e), `"${e.id}" fails the publish gate`).toBe(true);
    }
    expect(SOURCE).not.toContain("[CONFIRM");
  });

  it("no price literal: the content/faq.ts source has no match for /\\$\\d/", () => {
    const hits = SOURCE.split("\n")
      .map((text, i) => `${i + 1}: ${text}`)
      .filter((line) => /\$\d/.test(line));
    expect(hits, "price literals in content/faq.ts").toEqual([]);
  });
});

describe("F-03: each published entry equals §3 (docs/ux/0001-faq.md at 0d4b39a)", () => {
  it.each(APPROVED_FAQ.map((a) => [a.id, a] as const))(
    "%s: question is §3's question text",
    (id, expected) => {
      expect(byId(id).question).toBe(expected.question);
    },
  );

  it.each(APPROVED_FAQ.map((a) => [a.id, a] as const))(
    "%s: answer (whitespace-collapsed) equals §3's approved text, with cost's numbers from the interpolation",
    (id, expected) => {
      expect(collapse(byId(id).answer)).toBe(collapse(expected.answer));
    },
  );

  it.each(APPROVED_FAQ.map((a) => [a.id, a] as const))(
    "%s: answer has §3's paragraph/list/heading structure (blank lines matter, line breaks don't)",
    (id, expected) => {
      expect(parseAnswer(byId(id).answer)).toEqual(parseAnswer(expected.answer));
    },
  );

  it.each(APPROVED_FAQ.map((a) => [a.id, a] as const))(
    "%s: finePrint is §3's fine print (only design has one)",
    (id, expected) => {
      expect(byId(id).finePrint).toBe(expected.finePrint);
    },
  );
});

describe("F-03: entry-specific criteria", () => {
  it('minimum answer === "Our minimum is 10 jerseys per design." (D1b)', () => {
    expect(byId("minimum").answer).toBe("Our minimum is 10 jerseys per design.");
    expect(byId("minimum").question).toBe("What's the minimum order?");
  });

  it("minimum no longer mentions smaller runs or a special-order fee (D1b)", () => {
    const text = byId("minimum").answer;
    expect(text).not.toMatch(/5–10|5-10|5–9|special-order|fee/i);
  });

  it('timeline answer is 3 paragraphs, including "We don\'t do rush orders…" (D3) and a /intake link', () => {
    const blocks = parseAnswer(byId("timeline").answer);
    expect(blocks.map((b) => b.kind)).toEqual(["p", "p", "p"]);
    expect(plain(byId("timeline").answer)).toContain(
      "We don't do rush orders. If your date is really tight, get in touch and we'll talk it through.",
    );
    expect(blocks[1]).toMatchObject({
      kind: "p",
      content: expect.arrayContaining([{ kind: "link", text: "quote form", href: "/intake" }]),
    });
  });

  it('design.finePrint === "Includes up to 3 rounds of changes." and toPlainText(parseAnswer(design.answer)) does not contain "rounds" (D5)', () => {
    const design = byId("design");
    expect(design.finePrint).toBe("Includes up to 3 rounds of changes.");
    expect(plain(design.answer)).not.toContain("rounds");
  });

  it('design answer contains the `$${DESIGN_FEE}` output ("$125" today) and not "20+ years" or "3D mock-up" (D8)', () => {
    const { answer } = byId("design");
    expect(answer).toContain(`$${DESIGN_FEE}`);
    expect(answer).not.toContain("20+ years");
    expect(answer).not.toMatch(/3D mock-up/i);
    expect(plain(answer)).toBe(
      `Yes. Send us a rough idea, a mood board or a sketch and we'll design it with you for a flat $${DESIGN_FEE} fee.` +
        "\n\nAlready have a finished design? Then there's no design fee.",
    );
  });

  it('design-tips question is "What should we know before sending our design?" (D6b)', () => {
    expect(byId("design-tips").question).toBe("What should we know before sending our design?");
  });

  it("design-tips answer parses to one paragraph followed by one ul of 4 items", () => {
    const blocks = parseAnswer(byId("design-tips").answer);
    expect(blocks.map((b) => b.kind)).toEqual(["p", "ul"]);
    const list = blocks[1];
    expect(list.kind === "ul" && list.items).toHaveLength(4);
  });

  it("design-tips answer (whitespace-collapsed) equals §3 Q6 verbatim", () => {
    expect(collapse(byId("design-tips").answer)).toBe(
      collapse(`Most of the hold-ups we see come down to a few things:

- Send the original logo file, not a screenshot or a picture saved off Instagram. Whoever made your logo should have it, usually as an .ai, .eps, .svg or .pdf file. If a small image is all you've got, send it anyway and we'll tell you what we can do with it.
- Tell us your exact colours. "Navy" is a different blue to everyone, so if your club or a sponsor has official colours, send us the Pantone codes.
- Get your team to agree on the look before you send it. Changing direction after we've started designing slows everything down.
- Before you confirm, check the mock-up and your roster one more time: how every name is spelled, and that each player has the right number and size. A typo is a quick fix on the mock-up, but after printing it means making that jersey again.`),
    );
  });

  it("design-tips answer has no $, no price/cost/fee/surcharge/[CONFIRM, and none of the old tips' text", () => {
    const { answer, finePrint } = byId("design-tips");
    expect(finePrint).toBeUndefined();
    expect(answer).not.toContain("$");
    expect(answer).not.toMatch(/price|cost|fee|surcharge|\[CONFIRM/i);
    for (const old of [
      "Skip tiny text",
      "fair game",
      "Blurry logos print blurry",
      "largest PNG",
      "A few things that make a big difference",
      "Any tips for designing",
    ]) {
      expect(answer, old).not.toContain(old);
    }
  });

  it("colour keeps its 3 headings and the Tissus Print link (§3 Q7, D7)", () => {
    const blocks = parseAnswer(byId("colour").answer);
    expect(blocks.filter((b) => b.kind === "heading").map((b) => b.kind === "heading" && b.text)).toEqual([
      "Screen Glow vs Fabric",
      "Screen differences",
      "Lighting and Cameras",
    ]);
    expect(plain(byId("colour").answer).endsWith(`Tissus Print explains it well.\n${TISSUS_PRINT_URL}`)).toBe(true);
  });

  it("cost reads as §3 Q1 with tiers from 10 up only: the 5–9 tier is not mentioned (A4 = A)", () => {
    const text = plain(byId("cost").answer);
    expect(text).not.toContain("5–9");
    expect(text).toBe(plain(approved("cost").answer));
  });
});

describe("F-03: things that must not change (A3, D8)", () => {
  it('HeroSection keeps its "20+ years" line (D8 = A: removed from the FAQ only)', () => {
    const hero = readFileSync(join(process.cwd(), "components/marketing/HeroSection.tsx"), "utf-8");
    expect(collapse(hero)).toContain("20+ years");
  });
});
