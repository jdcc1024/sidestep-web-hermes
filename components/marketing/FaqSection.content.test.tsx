// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Acceptance tests for F-03 (backlog/F-03-faq-content-pass.md): the rendered
 * site and Copy answer on the REAL content/faq.ts, after the content pass.
 *
 * Expected wording comes from content/__fixtures__/faq-approved.ts (UX §3 at
 * 0d4b39a). Admin state is mocked through convex/react, as in
 * CopyAnswerButtons.test.tsx, so the real useIsAdmin() runs; the clipboard and
 * sonner are stubbed the same way. NEXT_PUBLIC_SITE_URL is unset throughout,
 * so copied links use window.location.origin.
 */

type AuthState = { isLoading: boolean; isAuthenticated: boolean };

const { state } = vi.hoisted(() => ({
  state: {
    auth: { isLoading: false, isAuthenticated: false } as AuthState,
    user: undefined as unknown,
  },
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => state.auth,
  useQuery: (_ref: unknown, args: unknown) => (args === "skip" ? undefined : state.user),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FaqSection } from "./FaqSection";
import { APPROVED_FAQ, TISSUS_PRINT_URL, approved, collapse } from "@/content/__fixtures__/faq-approved";
import { parseAnswer, toPlainText, type Block, type Inline } from "@/lib/faq";

function signedOut() {
  state.auth = { isLoading: false, isAuthenticated: false };
  state.user = undefined;
}

function asAdmin() {
  state.auth = { isLoading: false, isAuthenticated: true };
  state.user = { _id: "users_1", clerkId: "user_jcc", name: "JCC", email: "jcc@example.com", isAdmin: true };
}

let writeText: ReturnType<typeof vi.fn>;
function stubClipboard() {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

/** userEvent.setup() replaces navigator.clipboard; put our stub back after it. */
function setupUser() {
  const user = userEvent.setup();
  stubClipboard();
  return user;
}

beforeEach(() => {
  signedOut();
  writeText = vi.fn().mockResolvedValue(undefined);
  stubClipboard();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const origin = () => window.location.origin;

async function open(question: string, user = setupUser()): Promise<HTMLElement> {
  const trigger = screen.getByRole("button", { name: question });
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
  if (!panel) throw new Error(`No open panel for "${question}"`);
  return panel;
}

/** Copy answer on the real FAQ, as an admin; returns the exact clipboard text. */
async function copyAnswerFor(question: string): Promise<string> {
  asAdmin();
  const user = setupUser();
  render(<FaqSection />);
  const panel = await open(question, user);
  await user.click(within(panel).getByRole("button", { name: /copy answer/i }));
  expect(writeText).toHaveBeenCalledTimes(1);
  return writeText.mock.calls[0][0] as string;
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
    "%s: the open panel reads exactly as §3 (each heading, paragraph, list item and fine print)",
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

describe("F-03: Copy answer on the real content (admin, NEXT_PUBLIC_SITE_URL unset)", () => {
  it.each(APPROVED_FAQ.map((a) => [a.id, a] as const))(
    "%s: copies §3's plain text, a blank line, then <origin>/#faq-<id>; never the fine print",
    async (id, expected) => {
      const text = await copyAnswerFor(expected.question);
      expect(text).toBe(`${toPlainText(parseAnswer(expected.answer))}\n\n${origin()}/#faq-${id}`);
      if (expected.finePrint) expect(text).not.toContain(expected.finePrint);
    },
  );

  it("design-tips: the intro line, a blank line, the 4 bullets each on one line starting •, a blank line, then <origin>/#faq-design-tips", async () => {
    const text = await copyAnswerFor("What should we know before sending our design?");
    expect(text).toBe(
      [
        "Most of the hold-ups we see come down to a few things:",
        "",
        "• Send the original logo file, not a screenshot or a picture saved off Instagram. Whoever made your logo should have it, usually as an .ai, .eps, .svg or .pdf file. If a small image is all you've got, send it anyway and we'll tell you what we can do with it.",
        '• Tell us your exact colours. "Navy" is a different blue to everyone, so if your club or a sponsor has official colours, send us the Pantone codes.',
        "• Get your team to agree on the look before you send it. Changing direction after we've started designing slows everything down.",
        "• Before you confirm, check the mock-up and your roster one more time: how every name is spelled, and that each player has the right number and size. A typo is a quick fix on the mock-up, but after printing it means making that jersey again.",
        "",
        `${origin()}/#faq-design-tips`,
      ].join("\n"),
    );
  });

  it('timeline: the §3 Q3 text as 3 paragraphs with "quote form" as plain words, then a blank line and <origin>/#faq-timeline', async () => {
    const text = await copyAnswerFor("How long does an order take?");
    expect(text).toBe(
      [
        "Most orders take around 4 weeks from the day you approve your design to delivery. The design back-and-forth comes before that, so get in touch early.",
        "",
        "Playing against a season start or a tournament? Put your date on the quote form and we'll tell you up front if it's tight.",
        "",
        "We don't do rush orders. If your date is really tight, get in touch and we'll talk it through.",
        "",
        `${origin()}/#faq-timeline`,
      ].join("\n"),
    );
    expect(text).not.toContain("/intake");
  });

  it('colour: ends with "Tissus Print explains it well.\\n<Tissus Print URL>\\n\\n<origin>/#faq-colour" and has the 3 headings without **', async () => {
    const text = await copyAnswerFor("Will the colours match what I see on screen?");
    expect(text.endsWith(`Tissus Print explains it well.\n${TISSUS_PRINT_URL}\n\n${origin()}/#faq-colour`)).toBe(true);
    const lines = text.split("\n");
    for (const heading of ["Screen Glow vs Fabric", "Screen differences", "Lighting and Cameras"]) {
      expect(lines).toContain(heading);
    }
    expect(text).not.toContain("**");
  });

  it("minimum: copies exactly \"Our minimum is 10 jerseys per design.\" and its link", async () => {
    const text = await copyAnswerFor(approved("minimum").question);
    expect(text).toBe(`Our minimum is 10 jerseys per design.\n\n${origin()}/#faq-minimum`);
  });
});
