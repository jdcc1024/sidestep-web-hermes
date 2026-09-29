// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Acceptance tests for F-02 (backlog/F-02-faq-deep-links-and-copy.md),
 * "Deep link": `/#faq-<id>` opens one answer, scrolls to it and focuses it.
 *
 * The behaviour lives in the new client component FaqAccordion, but it is
 * driven here through FaqSection, the public contract: that way these tests
 * don't pin the prop shape between the two. jsdom has no layout, so
 * `scrollIntoView` and `matchMedia` are stubs; position below the nav and
 * full opacity are checked by screenshot at review.
 *
 * convex/react is mocked (signed out) because F-02 puts `useIsAdmin()` in the
 * tree via CopyAnswerButtons, and the real hook needs a ConvexProvider.
 */

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: false }),
  useQuery: () => undefined,
}));

import { FaqSection } from "./FaqSection";
import type { FaqEntry } from "@/lib/faq";

const ENTRIES: FaqEntry[] = [
  { id: "minimum", question: "What is the minimum?", answer: "Ten jerseys.", published: true },
  { id: "timeline", question: "How long does it take?", answer: "About four weeks.", published: true },
  { id: "shipping", question: "Where do you ship?", answer: "Anywhere in Canada.", published: true },
  // Drafts: never rendered, so a deep link to them is an unknown id.
  { id: "design-tips", question: "Any design tips?", answer: "Draft tips.", published: false },
  { id: "gated", question: "Gated?", answer: "Still [CONFIRM: x].", published: true },
];

const QUESTION: Record<string, string> = {
  minimum: "What is the minimum?",
  timeline: "How long does it take?",
  shipping: "Where do you ship?",
};

// --- stubs -----------------------------------------------------------------

type ScrollCall = { el: Element; opts: unknown; panelMounted: boolean };
let scrollCalls: ScrollCall[];
let reducedMotion: boolean;
let focusSpy: ReturnType<typeof vi.spyOn>;
const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  history.replaceState(null, "", "/");
  scrollCalls = [];
  reducedMotion = false;

  Element.prototype.scrollIntoView = vi.fn(function (this: Element, opts?: unknown) {
    // Was the answer panel already in the DOM when we scrolled? (issue Notes:
    // the panel must be mounted before scrollIntoView.)
    const trigger = this.querySelector("[aria-expanded]");
    const panelId = trigger?.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    scrollCalls.push({ el: this, opts, panelMounted: !!panel && this.contains(panel) });
  }) as typeof Element.prototype.scrollIntoView;

  window.matchMedia = vi.fn((query: string) => ({
    matches: reducedMotion && query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })) as unknown as typeof window.matchMedia;

  focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  window.matchMedia = originalMatchMedia;
  focusSpy.mockRestore();
  history.replaceState(null, "", "/");
});

// --- helpers ---------------------------------------------------------------

/** Put a hash in the URL without firing hashchange (a fresh page load). */
function loadWithHash(hash: string) {
  history.replaceState(null, "", `/${hash}`);
}

/** Change the hash and fire hashchange, as in-page navigation does. */
function navigateToHash(hash: string) {
  act(() => {
    history.replaceState(null, "", `/${hash}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

function trigger(id: string): HTMLElement {
  return screen.getByRole("button", { name: QUESTION[id] });
}

function expandedState(): Record<string, string | null> {
  return Object.fromEntries(
    Object.keys(QUESTION).map((id) => [id, trigger(id).getAttribute("aria-expanded")]),
  );
}

function onlyOpen(id: string | null) {
  return Object.fromEntries(
    Object.keys(QUESTION).map((key) => [key, key === id ? "true" : "false"]),
  );
}

/** Let effects, animation frames and short timers run. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

// --- tests -----------------------------------------------------------------

describe("FaqAccordion: deep links", () => {
  it('with location.hash = "#faq-timeline" at mount, only the timeline item is open', async () => {
    loadWithHash("#faq-timeline");
    render(<FaqSection entries={ENTRIES} />);
    await waitFor(() => expect(expandedState()).toEqual(onlyOpen("timeline")));
    expect(within(document.getElementById("faq-timeline")!).getByText("About four weeks.")).toBeVisible();
  });

  it("…and its trigger is document.activeElement (focused with preventScroll)", async () => {
    loadWithHash("#faq-timeline");
    render(<FaqSection entries={ENTRIES} />);
    await waitFor(() => expect(document.activeElement).toBe(trigger("timeline")));

    const focusedTrigger = focusSpy.mock.contexts.findIndex((ctx: unknown) => ctx === trigger("timeline"));
    expect(focusedTrigger).toBeGreaterThanOrEqual(0);
    expect(focusSpy.mock.calls[focusedTrigger][0]).toMatchObject({ preventScroll: true });
  });

  it('…and scrollIntoView was called on the timeline item with behavior "smooth", after its panel mounted', async () => {
    loadWithHash("#faq-timeline");
    render(<FaqSection entries={ENTRIES} />);
    await waitFor(() => expect(scrollCalls.length).toBeGreaterThan(0));

    const item = document.getElementById("faq-timeline");
    const last = scrollCalls[scrollCalls.length - 1];
    expect(last.el).toBe(item);
    expect(last.opts).toMatchObject({ behavior: "smooth", block: "start" });
    expect(last.panelMounted).toBe(true);
    expect(scrollCalls.every((c) => c.el === item)).toBe(true);
  });

  it('…or with behavior "auto" when matchMedia reports reduced motion', async () => {
    reducedMotion = true;
    loadWithHash("#faq-timeline");
    render(<FaqSection entries={ENTRIES} />);
    await waitFor(() => expect(scrollCalls.length).toBeGreaterThan(0));

    const last = scrollCalls[scrollCalls.length - 1];
    expect(last.el).toBe(document.getElementById("faq-timeline"));
    expect(last.opts).toMatchObject({ behavior: "auto", block: "start" });
  });

  it('dispatching hashchange after setting location.hash = "#faq-shipping" opens shipping and closes timeline', async () => {
    loadWithHash("#faq-timeline");
    render(<FaqSection entries={ENTRIES} />);
    await waitFor(() => expect(expandedState()).toEqual(onlyOpen("timeline")));
    await settle();
    scrollCalls = [];

    navigateToHash("#faq-shipping");
    await waitFor(() => expect(expandedState()).toEqual(onlyOpen("shipping")));
    await waitFor(() => expect(document.activeElement).toBe(trigger("shipping")));
    await waitFor(() => expect(scrollCalls.map((c) => c.el)).toContain(document.getElementById("faq-shipping")));
  });

  it.each(["#faq-nope", "#faq", "#pricing", ""])(
    "hash %j at mount leaves all items closed, doesn't call scrollIntoView, and throws nothing",
    async (hash) => {
      loadWithHash(hash);
      expect(() => render(<FaqSection entries={ENTRIES} />)).not.toThrow();
      await settle();
      expect(expandedState()).toEqual(onlyOpen(null));
      expect(scrollCalls).toHaveLength(0);
    },
  );

  it.each(["#faq-nope", "#faq", "#pricing", ""])(
    "hashchange to %j changes nothing: the open item stays open and nothing scrolls",
    async (hash) => {
      loadWithHash("#faq-timeline");
      render(<FaqSection entries={ENTRIES} />);
      await waitFor(() => expect(expandedState()).toEqual(onlyOpen("timeline")));
      await settle();
      scrollCalls = [];

      expect(() => navigateToHash(hash)).not.toThrow();
      await settle();
      expect(expandedState()).toEqual(onlyOpen("timeline"));
      expect(scrollCalls).toHaveLength(0);
    },
  );

  it.each(["#faq-design-tips", "#faq-gated"])(
    "a hash naming an id that isn't rendered (%s) behaves like an unknown id",
    async (hash) => {
      loadWithHash(hash);
      expect(() => render(<FaqSection entries={ENTRIES} />)).not.toThrow();
      await settle();
      expect(document.getElementById(hash.slice(1))).toBeNull();
      expect(expandedState()).toEqual(onlyOpen(null));
      expect(scrollCalls).toHaveLength(0);
    },
  );

  // F-03 publishes design-tips, so on the real FAQ its deep link now opens Q6.
  // The "unpublished id opens nothing" path stays covered by the fixture test
  // above (#faq-design-tips / #faq-gated against ENTRIES).
  it("deep link /#faq-design-tips opens the real, now-published Q6 item on the real FAQ (F-03)", async () => {
    loadWithHash("#faq-design-tips");
    render(<FaqSection />);
    const q6 = () => screen.getByRole("button", { name: "What should we know before sending our design?" });
    await waitFor(() => expect(q6()).toHaveAttribute("aria-expanded", "true"));

    const triggers = within(document.getElementById("faq")!)
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-expanded"));
    expect(triggers).toHaveLength(8);
    expect(triggers.filter((t) => t.getAttribute("aria-expanded") === "true")).toEqual([q6()]);

    const item = document.getElementById("faq-design-tips");
    expect(item).not.toBeNull();
    expect(within(item!).getAllByRole("listitem")).toHaveLength(4);
    await waitFor(() => expect(document.activeElement).toBe(q6()));
    await waitFor(() => expect(scrollCalls.map((c) => c.el)).toContain(item));
  });

  it("clicking a trigger doesn't change location.hash (no URL rewrite, no history entry)", async () => {
    const pushState = vi.spyOn(history, "pushState");
    try {
      const user = userEvent.setup();
      render(<FaqSection entries={ENTRIES} />);
      await user.click(trigger("shipping"));
      expect(trigger("shipping")).toHaveAttribute("aria-expanded", "true");
      await user.click(trigger("shipping"));
      expect(trigger("shipping")).toHaveAttribute("aria-expanded", "false");
      expect(location.hash).toBe("");

      // Arrived on a deep link, then opened another item by hand: URL untouched.
      navigateToHash("#faq-timeline");
      await waitFor(() => expect(expandedState()).toEqual(onlyOpen("timeline")));
      await user.click(trigger("minimum"));
      expect(trigger("minimum")).toHaveAttribute("aria-expanded", "true");
      expect(location.hash).toBe("#faq-timeline");
      expect(pushState).not.toHaveBeenCalled();
    } finally {
      pushState.mockRestore();
    }
  });

  it("keyboard: Tab reaches each trigger, and Enter/Space toggles it (unchanged from today)", async () => {
    const user = userEvent.setup();
    render(<FaqSection entries={ENTRIES} />);

    for (const id of Object.keys(QUESTION)) {
      await user.tab();
      expect(document.activeElement).toBe(trigger(id));
    }

    trigger("timeline").focus();
    await user.keyboard("{Enter}");
    expect(trigger("timeline")).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Enter}");
    expect(trigger("timeline")).toHaveAttribute("aria-expanded", "false");
    await user.keyboard(" ");
    expect(trigger("timeline")).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    expect(trigger("timeline")).toHaveAttribute("aria-expanded", "false");
  });

  it("stays single-open: opening one item by hand closes the other (as today)", async () => {
    const user = userEvent.setup();
    render(<FaqSection entries={ENTRIES} />);
    await user.click(trigger("minimum"));
    await user.click(trigger("shipping"));
    expect(expandedState()).toEqual(onlyOpen("shipping"));
  });
});

/** Constraints from the issue's description (client boundary), not the checklist. */
describe("FaqAccordion: build constraints (issue description)", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");

  it('FaqAccordion and CopyAnswerButtons are "use client" modules, FaqSection renders FaqAccordion, and the client never parses Markdown', () => {
    const accordion = read("components/marketing/FaqAccordion.tsx");
    const buttons = read("components/marketing/CopyAnswerButtons.tsx");
    const section = read("components/marketing/FaqSection.tsx");

    expect(accordion).toMatch(/^\s*["']use client["']/);
    expect(buttons).toMatch(/^\s*["']use client["']/);
    expect(section).toMatch(/import[^;]*\bFaqAccordion\b[^;]*from\s+["'][^"']*FaqAccordion["']/);

    for (const [name, src] of [["FaqAccordion.tsx", accordion], ["CopyAnswerButtons.tsx", buttons]]) {
      expect(src, `${name} must not parse Markdown`).not.toMatch(/\b(parseAnswer|toPlainText)\b/);
      expect(src, `${name} must not import content/faq`).not.toMatch(/["']@\/content\/faq["']/);
    }
  });
});
