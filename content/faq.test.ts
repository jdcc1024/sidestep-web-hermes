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
 * This is the file JCC's edits must keep green. The last describe block pins
 * today's live wording (F-01 is a visitor-facing refactor); the F-03 test card
 * replaces that block when the approved §3 wording goes live.
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
    // F-01 starts the list with the 4 live ids; later issues only append.
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

  it("the 5 in-pilot done_when topics have an entry (cost, minimum, timeline, process, colour); design-tips exists and is published: false (D6)", () => {
    const ids = FAQ.map((e) => e.id);
    for (const id of ["cost", "minimum", "timeline", "process", "colour"]) {
      expect(ids).toContain(id);
    }
    // D6: design tips are out of the pilot. This must not require publishing.
    expect(byId("design-tips").published).toBe(false);
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

/**
 * Not a checklist line, but the issue's content table: cost, process and colour
 * go in as §3's approved text (docs/ux/0001-faq.md, commit f3f406c). F-03
 * publishes them without rewording, so these hold through F-03. Compared as
 * plain text, so source line breaks don't matter; prices come from the helpers.
 */
describe("content/faq.ts: unpublished entries carry §3 approved text", () => {
  it("cost, process, colour, design-tips are unpublished in F-01, with §3 questions", () => {
    expect(byId("cost")).toMatchObject({
      question: "How much do custom jerseys cost?",
      published: false,
    });
    expect(byId("process")).toMatchObject({
      question: "How does the process work?",
      published: false,
    });
    expect(byId("colour")).toMatchObject({
      question: "Will the colours match what I see on screen?",
      published: false,
    });
    expect(byId("design-tips")).toMatchObject({
      question: "Any tips for designing our jerseys?",
      published: false,
    });
  });

  it("cost reads as §3 Q1", () => {
    const from10 = { fromQuantity: 10 };
    expect(toPlainText(parseAnswer(byId("cost").answer))).toBe(
      `Jerseys are ${priceRange(from10)} each, and the more you order, the less each one costs: ` +
        `${formatTierPriceList(from10)}. Tax and shipping are included, so there are no hidden fees.` +
        "\n\n" +
        `Want us to design it for you? That's a flat $${DESIGN_FEE} design fee, tax included. ` +
        "The price calculator works out your total, and we confirm your final quote before anything is made.",
    );
  });

  it("process reads as §3 Q4 (6 numbered steps)", () => {
    expect(toPlainText(parseAnswer(byId("process").answer))).toBe(
      [
        "1. Get a quote: tell us about your team on our quote form.",
        "2. Design: add your colours, logos and ideas to our jersey template, or we design it with you.",
        "3. Names, numbers & sizes: send us your team's roster. We need it before we confirm your order.",
        "4. 3D mock-up: see exactly how your jersey will look before anything is made.",
        "5. Confirm: we lock in your design, roster and final quote, and send your invoice.",
        "6. Production: most orders arrive in around 4 weeks.",
      ].join("\n"),
    );
  });

  it("colour reads as §3 Q7", () => {
    const blocks = parseAnswer(byId("colour").answer);
    const [link] = externalLinks(blocks);
    expect(link.href).toBe(
      "https://www.tissus-print.com/en/blog/printing/print-file-preparation/understanding-the-difference-between-screen-display-and-printed-fabric-why-do-colours-change",
    );
    expect(toPlainText(blocks)).toBe(
      [
        "Close, but not exactly. This one surprises a lot of people, so here's what's going on.",
        "",
        "Screen Glow vs Fabric\nYour phone lights up every colour from behind. A jersey can't do that. It only reflects whatever light is around it, so bright, neon-ish colours on your screen come out a bit softer on fabric.",
        "",
        "Screen differences\nNo two screens show colour the same way. Your design will look slightly different on your phone, your laptop and your teammate's phone, and that goes for the mock-ups we send you too. Brightness and night mode make a bigger difference than you'd think.",
        "",
        "Lighting and Cameras\nThe finished jersey will look different under gym lights than it does outside. Phone cameras also adjust colour on their own, so a photo of an old jersey isn't a reliable colour reference.",
        "",
        "Need a specific colour, like a club or sponsor colour? Send us the Pantone code and we'll match it as closely as the fabric allows.",
        "",
        `Want the longer version? Tissus Print explains it well.\n${link.href}`,
      ].join("\n"),
    );
  });
});

/**
 * Regression: F-01 must not change what a visitor reads. These strings are
 * copied from components/marketing/FaqSection.tsx at main 12afdf7.
 * F-03's test card replaces this block (D1b, D3, D5, D8 change the wording).
 */
describe("content/faq.ts: regression (F-01 only; replaced by F-03 tests)", () => {
  it("the 4 published entries' questions and answers are byte-identical to today's FaqSection.tsx", () => {
    const live = FAQ.filter((e) => e.published).map(({ id, question, answer, finePrint }) => ({
      id,
      question,
      answer,
      finePrint,
    }));

    expect(live).toEqual([
      {
        id: "minimum",
        question: "What is your minimum order?",
        answer:
          "Our standard minimum is 10 jerseys per design. Smaller runs of 5–10 jerseys are possible but carry a special-order fee.",
        finePrint: undefined,
      },
      {
        id: "timeline",
        question: "How long does an order take?",
        answer:
          "Most orders take around 4 weeks from confirmed design to delivery. We'll flag a tighter timeline up front if you're working against a tournament or season start.",
        finePrint: undefined,
      },
      {
        id: "design",
        question: "Do you help with the design?",
        answer:
          "Yes — our team has 20+ years of industry experience and can guide you through the design from a rough idea, mood board, or sketch. You'll see a 3D mock-up before anything goes into production.",
        finePrint: undefined,
      },
      {
        id: "shipping",
        question: "Where do you ship?",
        answer:
          "We currently serve the Greater Vancouver area. If you're outside that region, get in touch and we'll see what we can do.",
        finePrint: undefined,
      },
    ]);
  });
});
