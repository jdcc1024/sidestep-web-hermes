// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// F-02 puts useIsAdmin() (convex/react) inside each open panel. These F-01
// tests render without a ConvexProvider, so they run as a signed-out visitor:
// no copy buttons, and the panel content is exactly the answer + fine print.
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: false }),
  useQuery: () => undefined,
}));

import { FaqSection } from "./FaqSection";
import { FAQ_SECTION } from "@/content/faq";
import type { FaqEntry } from "@/lib/faq";

/**
 * Acceptance tests for F-01 (backlog/F-01-faq-answer-source.md), FaqSection.
 * One test per acceptance criterion, named after it.
 *
 * Fixtures go in through the `entries` / `section` props the issue specifies,
 * so nothing here mocks the content module. Answers are reached the way a
 * visitor reaches them: click the question, then read the panel the trigger
 * controls (`aria-controls`). No class names are pinned except the two the
 * criteria name (`text-muted-foreground`, a smaller text-size class).
 */

// The 8 published questions after F-03, in order (UX §3 table, at 0d4b39a).
// F-03 replaced the 4 pre-F-01 live questions that used to be pinned here.
const LIVE_QUESTIONS = [
  "How much do custom jerseys cost?",
  "What's the minimum order?",
  "How long does an order take?",
  "How does the process work?",
  "Do you help with the design?",
  "What should we know before sending our design?",
  "Will the colours match what I see on screen?",
  "Where do you ship?",
];
const LIVE_IDS = ["cost", "minimum", "timeline", "process", "design", "design-tips", "colour", "shipping"];

function entry(overrides: Partial<FaqEntry> & Pick<FaqEntry, "id">): FaqEntry {
  return {
    question: `Question ${overrides.id}?`,
    answer: `Answer ${overrides.id}.`,
    published: true,
    ...overrides,
  };
}

function section(): HTMLElement {
  const el = document.getElementById("faq");
  if (!el) throw new Error('No element with id="faq"');
  return el;
}

function triggers(): HTMLElement[] {
  return within(section())
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("aria-expanded"));
}

/** Click a question and return the panel it now controls. */
async function open(question: string): Promise<HTMLElement> {
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: question });
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const panelId = trigger.getAttribute("aria-controls");
  const panel = panelId ? document.getElementById(panelId) : null;
  if (!panel) throw new Error(`No open panel for "${question}"`);
  return panel;
}

const SIZE_SCALE = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl"];

/** Rank of the nearest unprefixed text-size class on `el` or an ancestor. */
function sizeRank(el: Element): number {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const classes = Array.from(node.classList);
    const hit = SIZE_SCALE.findIndex((size) => classes.includes(size));
    if (hit !== -1) return hit;
  }
  return SIZE_SCALE.indexOf("text-base"); // browser default 16px
}

describe("FaqSection (real content)", () => {
  it("renders exactly the published questions in order", () => {
    render(<FaqSection />);
    expect(triggers().map((t) => t.textContent?.trim())).toEqual(LIVE_QUESTIONS);
  });

  it("no text matching [CONFIRM appears anywhere in the rendered output", async () => {
    const { container } = render(
      <FaqSection
        entries={[
          entry({ id: "ok", question: "Fine?", answer: "Fine." }),
          entry({ id: "draft-q", question: "Draft [CONFIRM: q]?", answer: "x" }),
          entry({ id: "draft-a", question: "Also a draft?", answer: "y\n\n[CONFIRM: a]" }),
          entry({ id: "draft-f", question: "Fine print draft?", finePrint: "[CONFIRM: f]" }),
        ]}
      />,
    );
    expect(triggers().map((t) => t.textContent?.trim())).toEqual(["Fine?"]);
    await open("Fine?");
    expect(container.innerHTML).not.toContain("[CONFIRM");

    // Real content, every item opened in turn (panels mount on open).
    const real = render(<FaqSection />);
    for (const q of LIVE_QUESTIONS) {
      await open(q);
      expect(real.container.innerHTML).not.toContain("[CONFIRM");
    }
  });

  it('each item\'s root has id="faq-<id>"', async () => {
    const { container } = render(<FaqSection />);

    LIVE_IDS.forEach((id, i) => {
      const item = container.querySelector(`#faq-${id}`);
      expect(item, `#faq-${id}`).not.toBeNull();
      expect(within(item as HTMLElement).getByRole("button", { name: LIVE_QUESTIONS[i] })).toBeInTheDocument();
    });

    // The item root, not just its header: the open answer is inside it too.
    const panel = await open("How long does an order take?");
    expect(container.querySelector("#faq-timeline")).toContainElement(panel);
  });

  it("opening an item shows its answer; a list renders a real <ul>/<ol> and a same-site link an <a href> without target", async () => {
    render(<FaqSection />);
    const hidden = screen.queryByText(/Most orders take around 4 weeks/);
    if (hidden) expect(hidden).not.toBeVisible();
    const live = await open("How long does an order take?");
    expect(live).toHaveTextContent(/Most orders take around 4 weeks from the day you approve your design to delivery\./);
    expect(live).toBeVisible();

    render(
      <FaqSection
        entries={[
          entry({
            id: "lists",
            question: "Lists?",
            answer: "Use the [quote form](/intake).\n\n1. one\n2. two\n\n- red\n- blue",
          }),
        ]}
      />,
    );
    const panel = await open("Lists?");
    const lists = within(panel).getAllByRole("list");
    expect(lists.map((l) => l.tagName)).toEqual(["OL", "UL"]);
    expect(within(lists[0]).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["one", "two"]);
    expect(within(lists[1]).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["red", "blue"]);

    const link = within(panel).getByRole("link", { name: "quote form" });
    expect(link).toHaveAttribute("href", "/intake");
    expect(link).not.toHaveAttribute("target");
  });

  it("a **Heading** line renders an <h4> with that text (no asterisks visible)", async () => {
    render(
      <FaqSection
        entries={[
          entry({ id: "head", question: "Heading?", answer: "Intro.\n\n**Screen Glow**\nBody text." }),
        ]}
      />,
    );
    const panel = await open("Heading?");
    const heading = within(panel).getByRole("heading", { name: "Screen Glow" });
    expect(heading.tagName).toBe("H4");
    expect(panel.textContent).not.toContain("*");
    expect(within(panel).getByText("Body text.")).toBeInTheDocument();
  });

  it('an https:// link renders <a> with target="_blank" and rel containing noopener', async () => {
    render(
      <FaqSection
        entries={[
          entry({ id: "ext", question: "External?", answer: "More? [Read this](https://x.test/a)." }),
        ]}
      />,
    );
    const panel = await open("External?");
    const link = within(panel).getByRole("link", { name: "Read this" });
    expect(link).toHaveAttribute("href", "https://x.test/a");
    expect(link).toHaveAttribute("target", "_blank");
    const rel = (link.getAttribute("rel") ?? "").split(/\s+/);
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer"); // spec: rel="noopener noreferrer"
  });

  it("finePrint renders as a separate, muted, smaller element after the answer; no finePrint renders no extra element", async () => {
    render(
      <FaqSection
        entries={[
          entry({ id: "fine", question: "With fine print?", answer: "Main answer.", finePrint: "Small print." }),
          entry({ id: "plain", question: "Without fine print?", answer: "Only answer." }),
        ]}
      />,
    );

    const withFine = await open("With fine print?");
    const answer = within(withFine).getByText("Main answer.");
    const fine = within(withFine).getByText("Small print.");
    expect(fine).not.toBe(answer);
    expect(answer.contains(fine)).toBe(false);
    expect(fine.textContent).toBe("Small print.");
    expect(answer.compareDocumentPosition(fine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fine).toHaveClass("text-muted-foreground");
    expect(sizeRank(fine)).toBeLessThan(sizeRank(answer));
    expect(withFine.querySelectorAll("p")).toHaveLength(2);

    const withoutFine = await open("Without fine print?");
    expect(withoutFine.textContent?.trim()).toBe("Only answer.");
    expect(withoutFine.querySelectorAll("p")).toHaveLength(1);
  });

  it('section keeps id="faq" and shows the eyebrow, heading, subtitle, "Didn\'t see your question?" and a "Get a quote and ask us" link to /intake', () => {
    render(<FaqSection />);
    const faq = section();
    expect(faq.tagName).toBe("SECTION");

    const scoped = within(faq);
    expect(scoped.getByText("FAQ")).toBeInTheDocument();
    expect(scoped.getByRole("heading", { level: 2, name: "Common questions, answered." })).toBeInTheDocument();
    expect(scoped.getByText("Straight answers to what captains ask us most.")).toBeInTheDocument();
    expect(scoped.getByText("Didn't see your question?")).toBeInTheDocument();
    expect(scoped.getByRole("link", { name: "Get a quote and ask us" })).toHaveAttribute("href", "/intake");
  });

  it("section copy comes from FAQ_SECTION: a fixture's heading/subtitle/cta render exactly, and a fixture without subtitle/cta renders neither", () => {
    const entries = [entry({ id: "only", question: "OnlyQuestion?", answer: "Nothing to see." })];

    const first = render(
      <FaqSection
        entries={entries}
        section={{
          eyebrow: "Questions",
          heading: "Other heading.",
          subtitle: "Other subtitle.",
          cta: { prompt: "Still stuck?", label: "Email us", href: "/contact" },
        }}
      />,
    );
    const faq = within(section());
    expect(faq.getByText("Questions")).toBeInTheDocument();
    expect(faq.getByRole("heading", { level: 2, name: "Other heading." })).toBeInTheDocument();
    expect(faq.getByText("Other subtitle.")).toBeInTheDocument();
    expect(faq.getByText("Still stuck?")).toBeInTheDocument();
    expect(faq.getByRole("link", { name: "Email us" })).toHaveAttribute("href", "/contact");
    for (const real of [FAQ_SECTION.heading, FAQ_SECTION.subtitle, FAQ_SECTION.cta?.prompt, FAQ_SECTION.cta?.label]) {
      if (real) expect(faq.queryByText(real)).toBeNull();
    }
    first.unmount();

    render(<FaqSection entries={entries} section={{ eyebrow: "Eyebrow", heading: "Heading" }} />);
    const bare = section();
    // Nothing rendered beyond eyebrow, heading and the (closed) question.
    expect((bare.textContent ?? "").replace(/\s+/g, "")).toBe("EyebrowHeadingOnlyQuestion?");
    expect(within(bare).queryAllByRole("link")).toHaveLength(0);
  });

  it("FaqSection.tsx contains no user-facing string literals (the section copy is found only in content/faq.ts)", () => {
    const component = readFileSync(join(process.cwd(), "components/marketing/FaqSection.tsx"), "utf-8");
    const content = readFileSync(join(process.cwd(), "content/faq.ts"), "utf-8");

    const copy = [
      "Common questions, answered.",
      "Straight answers to what captains ask us most.",
      "Didn't see your question?",
      "Get a quote and ask us",
      ...LIVE_QUESTIONS,
      "Greater Vancouver",
    ];
    for (const text of copy) {
      expect(component, `"${text}" in FaqSection.tsx`).not.toContain(text);
    }
    for (const text of copy.slice(0, 4)) {
      expect(content, `"${text}" missing from content/faq.ts`).toContain(text);
    }
    // The eyebrow as a string or JSX text (the FAQ / FAQ_SECTION identifiers are fine).
    expect(component).not.toMatch(/["'`]FAQ["'`]|>\s*FAQ\s*</);
    expect(component).not.toMatch(/["'`]\/intake["'`]/);
  });
});

/** Constraints from the issue's description and Notes, not the checklist. */
describe("FaqSection: build constraints (issue description)", () => {
  it("stays a server component and never injects HTML; no markdown dependency added", () => {
    const component = readFileSync(join(process.cwd(), "components/marketing/FaqSection.tsx"), "utf-8");
    const lib = readFileSync(join(process.cwd(), "lib/faq.ts"), "utf-8");
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));

    expect(component).not.toMatch(/^\s*["']use client["']/m);
    expect(component).not.toContain("dangerouslySetInnerHTML");
    expect(lib).not.toContain("dangerouslySetInnerHTML");
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty("react-markdown");
  });
});
