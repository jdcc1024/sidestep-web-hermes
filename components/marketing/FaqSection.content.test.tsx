// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Acceptance tests for F-03 (backlog/F-03-faq-content-pass.md): the rendered
 * site on the REAL content/faq.ts, after the content pass.
 *
 * Expected wording comes from content/__fixtures__/faq-approved.ts (UX §3 at
 * 0d4b39a, plus JCC's c8b72ff rewording of cost, design, design-tips and
 * colour). Every test renders as a signed-out visitor; convex/react is mocked
 * so nothing in the tree needs a ConvexProvider.
 *
 * Copy answer was removed for good (d568273, card t_fce3905b), so its tests
 * were deleted rather than ported.
 */

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: false }),
  useQuery: () => undefined,
}));

import { FaqSection } from "./FaqSection";
import { APPROVED_FAQ, collapse } from "@/content/__fixtures__/faq-approved";
import { parseAnswer, type Block, type Inline } from "@/lib/faq";

beforeEach(() => {
  history.replaceState(null, "", "/");
});

async function open(question: string, user = userEvent.setup()): Promise<HTMLElement> {
  const trigger = screen.getByRole("button", { name: question });
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
  if (!panel) throw new Error(`No open panel for "${question}"`);
  return panel;
}

const inlineText = (inlines: Inline[]) => inlines.map((i) => i.text).join("");

/** What a visitor reads, element by element: each heading, paragraph and list item. */
function expectedReading(blocks: Block[], finePrint?: string): string[] {
  const texts = blocks.flatMap((b) => {
    switch (b.kind) {
      case "heading":
        return [b.text];
      case "p":
        return [inlineText(b.content)];
      case "ul":
      case "ol":
        return b.items.map(inlineText);
    }
  });
  return (finePrint ? [...texts, finePrint] : texts).map(collapse);
}

function renderedReading(panel: HTMLElement): string[] {
  return Array.from(panel.querySelectorAll("h4, p, li")).map((el) => collapse(el.textContent ?? ""));
}

// ---------------------------------------------------------------------------

describe("F-03: the rendered FAQ (signed-out visitor)", () => {
  it("shows the 8 §3 questions in order: cost, minimum, timeline, process, design, design-tips, colour, shipping", () => {
    render(<FaqSection />);
    const triggers = within(document.getElementById("faq")!)
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-expanded"));
    expect(triggers.map((t) => t.textContent?.trim())).toEqual(APPROVED_FAQ.map((a) => a.question));
    expect(triggers.map((t) => t.closest("[id^='faq-']")?.id)).toEqual(APPROVED_FAQ.map((a) => `faq-${a.id}`));
  });

  it.each(APPROVED_FAQ.map((a) => [a.id, a] as const))(
    "%s: the open panel reads exactly as the approved text (each heading, paragraph, list item and fine print)",
    async (_id, expected) => {
      render(<FaqSection />);
      const panel = await open(expected.question);
      expect(renderedReading(panel)).toEqual(expectedReading(parseAnswer(expected.answer), expected.finePrint));
    },
  );

  it("design-tips: the rendered panel shows 4 list items in one list", async () => {
    render(<FaqSection />);
    const panel = await open("What should we know before sending our design?");
    const lists = within(panel).getAllByRole("list");
    expect(lists).toHaveLength(1);
    expect(lists[0].tagName).toBe("UL");
    expect(within(lists[0]).getAllByRole("listitem")).toHaveLength(4);
  });

  it("design: the rendered panel shows \"Includes up to 3 rounds of changes.\" as muted fine print after the answer", async () => {
    render(<FaqSection />);
    const panel = await open("Do you help with the design?");
    const fine = within(panel).getByText("Includes up to 3 rounds of changes.");
    const last = within(panel).getByText(/Already have a finished design\?/);
    expect(fine).toHaveClass("text-muted-foreground");
    expect(last.compareDocumentPosition(fine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel).not.toHaveTextContent(/20\+ years|3D mock-up/i);
  });

  it("no rendered panel shows [CONFIRM, ** or a raw Markdown link", async () => {
    const { container } = render(<FaqSection />);
    for (const a of APPROVED_FAQ) {
      await open(a.question);
      expect(container.innerHTML).not.toContain("[CONFIRM");
      expect(container.textContent).not.toContain("**");
      expect(container.textContent).not.toMatch(/\]\(/);
    }
  });
});
