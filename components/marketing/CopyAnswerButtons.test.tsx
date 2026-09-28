// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Acceptance tests for F-02 (backlog/F-02-faq-deep-links-and-copy.md):
 * "Admin gate" (component side), "Copy", and "End to end through FaqSection".
 *
 * The admin state is set by mocking convex/react (useConvexAuth / useQuery),
 * as in components/layout/UserSync.test.tsx, so the real useIsAdmin() runs.
 * sonner and navigator.clipboard are stubbed as in CopyInviteLinkButton.test.tsx.
 */

type AuthState = { isLoading: boolean; isAuthenticated: boolean };

const { state, toastSuccess, toastError } = vi.hoisted(() => ({
  state: {
    auth: { isLoading: false, isAuthenticated: false } as AuthState,
    user: undefined as unknown,
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => state.auth,
  useQuery: (_ref: unknown, args: unknown) => (args === "skip" ? undefined : state.user),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { CopyAnswerButtons } from "./CopyAnswerButtons";
import { FaqSection } from "./FaqSection";
import { FAQ } from "@/content/faq";
import type { FaqEntry } from "@/lib/faq";

const ROW = { _id: "users_1", clerkId: "user_jcc", name: "JCC", email: "jcc@example.com" };
const SIGNED_IN: AuthState = { isLoading: false, isAuthenticated: true };

function asAdmin() {
  state.auth = SIGNED_IN;
  state.user = { ...ROW, isAdmin: true };
}

const NOT_ADMIN_CASES: Array<[string, AuthState, unknown]> = [
  ["auth is loading", { isLoading: true, isAuthenticated: false }, undefined],
  ["signed out", { isLoading: false, isAuthenticated: false }, undefined],
  ["signed in, getCurrentUser loading", SIGNED_IN, undefined],
  ["signed in, no Convex row yet", SIGNED_IN, null],
  ["signed in as a non-admin", SIGNED_IN, { ...ROW, isAdmin: false }],
];

let writeText: ReturnType<typeof vi.fn>;
function stubClipboard(fn: ReturnType<typeof vi.fn>) {
  writeText = fn;
  Object.defineProperty(navigator, "clipboard", { value: { writeText: fn }, configurable: true });
}

/**
 * userEvent.setup() installs its own navigator.clipboard stub, replacing ours
 * (CopyInviteLinkButton.test.tsx calls setup() first for the same reason).
 * Set up the user, then put the current writeText stub back.
 */
function setupUser(options?: Parameters<typeof userEvent.setup>[0]) {
  const user = userEvent.setup(options);
  stubClipboard(writeText);
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.auth = { isLoading: false, isAuthenticated: false };
  state.user = undefined;
  stubClipboard(vi.fn().mockResolvedValue(undefined));
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const COPY_ANSWER = /copy answer/i;
const COPY_LINK = /copy link/i;
const URL_RE = /https?:\/\/\S+/g;

const origin = () => window.location.origin;

/** Click a question in FaqSection and return the panel it now controls. */
async function open(question: string, user = setupUser()): Promise<HTMLElement> {
  const trigger = screen.getByRole("button", { name: question });
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
  if (!panel) throw new Error(`No open panel for "${question}"`);
  return panel;
}

function entry(overrides: Partial<FaqEntry> & Pick<FaqEntry, "id">): FaqEntry {
  return { question: `Question ${overrides.id}?`, answer: `Answer ${overrides.id}.`, published: true, ...overrides };
}

const THREE = [
  entry({ id: "minimum", question: "Minimum?", answer: "Ten jerseys." }),
  entry({ id: "timeline", question: "Timeline?", answer: "About four weeks.", finePrint: "Small print." }),
  entry({ id: "shipping", question: "Shipping?", answer: "Anywhere in Canada." }),
];

// ---------------------------------------------------------------------------

describe("CopyAnswerButtons: admin gate", () => {
  it.each(NOT_ADMIN_CASES)(
    "non-admin (%s): CopyAnswerButtons renders nothing at all (container.firstChild === null)",
    (_label, auth, user) => {
      state.auth = auth;
      state.user = user;
      const { container } = render(<CopyAnswerButtons id="timeline" plainText="About four weeks." />);
      expect(container.firstChild).toBeNull();
    },
  );

  it.each(NOT_ADMIN_CASES)(
    'non-admin (%s): an open item renders no "Copy answer"/"Copy link" and the panel ends where the text ends (no empty gap)',
    async (_label, auth, user) => {
      state.auth = auth;
      state.user = user;
      render(<FaqSection entries={THREE} />);

      for (const [question, lastText] of [["Timeline?", "Small print."], ["Minimum?", "Ten jerseys."]]) {
        const panel = await open(question);
        expect(screen.queryByRole("button", { name: COPY_ANSWER })).toBeNull();
        expect(screen.queryByRole("button", { name: COPY_LINK })).toBeNull();
        expect(within(panel).queryAllByRole("button")).toHaveLength(0);

        // Nothing (no wrapper, spacer or placeholder) after the answer / fine print.
        const all = panel.querySelectorAll("*");
        const last = all[all.length - 1];
        expect(last.textContent?.trim()).toBe(lastText);
      }
    },
  );

  it('admin: an open item renders exactly one "Copy answer" and one "Copy link"; collapsed items render neither', async () => {
    asAdmin();
    render(<FaqSection entries={THREE} />);
    expect(screen.queryAllByRole("button", { name: COPY_ANSWER })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: COPY_LINK })).toHaveLength(0);

    const panel = await open("Timeline?");
    expect(screen.getAllByRole("button", { name: COPY_ANSWER })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: COPY_LINK })).toHaveLength(1);
    const copyAnswer = within(panel).getByRole("button", { name: COPY_ANSWER });
    const copyLink = within(panel).getByRole("button", { name: COPY_LINK });
    expect(document.getElementById("faq-timeline")).toContainElement(copyAnswer);

    // Rendered at the bottom of the panel, after the answer and the fine print.
    const fine = within(panel).getByText("Small print.");
    expect(fine.compareDocumentPosition(copyAnswer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fine.compareDocumentPosition(copyLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Open another: still exactly one pair, now in the other item.
    const other = await open("Shipping?");
    expect(screen.getAllByRole("button", { name: COPY_ANSWER })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: COPY_LINK })).toHaveLength(1);
    expect(within(other).getByRole("button", { name: COPY_ANSWER })).toBeInTheDocument();
  });

  it("switching the mocked query from undefined to { isAdmin: true } (re-render) makes the buttons appear without throwing", () => {
    state.auth = SIGNED_IN;
    state.user = undefined;
    const { container, rerender } = render(<CopyAnswerButtons id="timeline" plainText="About four weeks." />);
    expect(container.firstChild).toBeNull();

    state.user = { ...ROW, isAdmin: true };
    expect(() => rerender(<CopyAnswerButtons id="timeline" plainText="About four weeks." />)).not.toThrow();
    expect(screen.getByRole("button", { name: COPY_ANSWER })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COPY_LINK })).toBeInTheDocument();
  });
});

describe("CopyAnswerButtons: copy", () => {
  const PLAIN = "Most orders take around 4 weeks.\n\n1. one\n2. two";

  it('Copy answer writes plainText + "\\n\\n" + window.location.origin + "/#faq-" + id, exactly (NEXT_PUBLIC_SITE_URL unset)', async () => {
    asAdmin();
    const user = setupUser();
    render(<CopyAnswerButtons id="timeline" plainText={PLAIN} />);
    await user.click(screen.getByRole("button", { name: COPY_ANSWER }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(`${PLAIN}\n\n${origin()}/#faq-timeline`);
  });

  it('Copy link writes window.location.origin + "/#faq-" + id, exactly (NEXT_PUBLIC_SITE_URL unset)', async () => {
    asAdmin();
    const user = setupUser();
    render(<CopyAnswerButtons id="timeline" plainText={PLAIN} />);
    await user.click(screen.getByRole("button", { name: COPY_LINK }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(`${origin()}/#faq-timeline`);
  });

  it('with NEXT_PUBLIC_SITE_URL="https://box.tail1234.ts.net/", both buttons use https://box.tail1234.ts.net/#faq-<id> regardless of window.location.origin', async () => {
    asAdmin();
    const user = setupUser();
    // Rendered before the env is set: the origin is read at click time.
    render(<CopyAnswerButtons id="shipping" plainText="Anywhere in Canada." />);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://box.tail1234.ts.net/");

    await user.click(screen.getByRole("button", { name: COPY_ANSWER }));
    await user.click(screen.getByRole("button", { name: COPY_LINK }));
    expect(writeText.mock.calls.map((c) => c[0])).toEqual([
      "Anywhere in Canada.\n\nhttps://box.tail1234.ts.net/#faq-shipping",
      "https://box.tail1234.ts.net/#faq-shipping",
    ]);
    expect(origin()).not.toBe("https://box.tail1234.ts.net");
  });

  it.each([
    [COPY_ANSWER, "Answer copied. Paste it into your message.", /copy answer/i],
    [COPY_LINK, "Link copied.", /copy link/i],
  ])(
    'after a successful copy (%s), the pressed button\'s accessible name contains "Copied!" and a success toast fires; the label reverts after 2 s',
    async (button, toastText, original) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      asAdmin();
      const user = setupUser({ advanceTimers: vi.advanceTimersByTime });
      render(<CopyAnswerButtons id="timeline" plainText={PLAIN} />);
      const buttons = screen.getAllByRole("button");
      const pressed = screen.getByRole("button", { name: button });
      const index = buttons.indexOf(pressed);
      const otherName = buttons[1 - index].textContent;

      await user.click(pressed);
      expect(screen.getAllByRole("button")[index]).toHaveAccessibleName(/Copied!/);
      // Only the pressed button changes.
      expect(screen.getAllByRole("button")[1 - index]).toHaveTextContent(otherName ?? "");
      expect(screen.getAllByRole("button")[1 - index]).not.toHaveAccessibleName(/Copied!/);
      expect(toastSuccess).toHaveBeenCalledWith(toastText);
      expect(toastError).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(1500));
      expect(screen.getAllByRole("button")[index]).toHaveAccessibleName(/Copied!/);
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getAllByRole("button")[index]).not.toHaveAccessibleName(/Copied!/);
      expect(screen.getAllByRole("button")[index]).toHaveAccessibleName(original);
    },
  );

  it.each([
    [COPY_ANSWER, `${PLAIN}\n\n`, "/#faq-timeline"],
    [COPY_LINK, "", "/#faq-timeline"],
  ])(
    "when writeText rejects (%s), an error toast fires whose message contains the exact text or URL, and the button doesn't show \"Copied!\"",
    async (button, prefix, suffix) => {
      asAdmin();
      stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
      const user = setupUser();
      render(<CopyAnswerButtons id="timeline" plainText={PLAIN} />);
      await user.click(screen.getByRole("button", { name: button }));

      const expected = `${prefix}${origin()}${suffix}`;
      expect(toastError).toHaveBeenCalledTimes(1);
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining(expected));
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /Copied!/ })).toBeNull();
    },
  );
});

describe("Copy: end to end through FaqSection (admin)", () => {
  async function copyAnswerFor(entries: FaqEntry[], question: string): Promise<{ text: string; panel: HTMLElement }> {
    asAdmin();
    const user = setupUser();
    render(<FaqSection entries={entries} />);
    const panel = await open(question, user);
    await user.click(within(panel).getByRole("button", { name: COPY_ANSWER }));
    expect(writeText).toHaveBeenCalledTimes(1);
    return { text: writeText.mock.calls[0][0] as string, panel };
  }

  it("fixture with a list and a same-site link: • / 1. markers, the link's words with no URL inline, exactly one URL (the deep link) on the last line", async () => {
    const { text } = await copyAnswerFor(
      [entry({ id: "lists", question: "Lists?", answer: "Use the [quote form](/intake).\n\n1. one\n2. two\n\n- red\n- blue" })],
      "Lists?",
    );
    const deepLink = `${origin()}/#faq-lists`;
    expect(text).toBe(`Use the quote form.\n\n1. one\n2. two\n\n• red\n• blue\n\n${deepLink}`);
    expect(text).not.toContain("/intake");
    expect(text.match(URL_RE)).toEqual([deepLink]);
    expect(text.split("\n").at(-1)).toBe(deepLink);
  });

  it('fixture with finePrint "Small print.": the fine print is visible in the open panel, and the copied text does not contain it', async () => {
    const { text, panel } = await copyAnswerFor(
      [entry({ id: "design", question: "Design?", answer: "Yes, we help.", finePrint: "Small print." })],
      "Design?",
    );
    expect(within(panel).getByText("Small print.")).toBeVisible();
    expect(text).not.toContain("Small print.");
    expect(text).toBe(`Yes, we help.\n\n${origin()}/#faq-design`);
  });

  it("fixture with a **Heading** line and an https://x.test/article link: heading text without **, the article URL on its own line, exactly two URLs with the deep link last", async () => {
    const { text } = await copyAnswerFor(
      [
        entry({
          id: "colourish",
          question: "Colours?",
          answer: "Intro.\n\n**Screen Glow**\nRead [the article](https://x.test/article) for more.",
        }),
      ],
      "Colours?",
    );
    const deepLink = `${origin()}/#faq-colourish`;
    expect(text).toContain("Screen Glow");
    expect(text).not.toContain("**");
    expect(text.split("\n")).toContain("https://x.test/article");
    expect(text.match(URL_RE)).toEqual(["https://x.test/article", deepLink]);
    expect(text.split("\n").at(-1)).toBe(deepLink);
    expect(text).toBe(
      `Intro.\n\nScreen Glow\nRead the article for more.\nhttps://x.test/article\n\n${deepLink}`,
    );
  });

  it("real colour entry (published for the test): the Tissus Print URL stays on its own line before the deep link", async () => {
    const colour = FAQ.find((e) => e.id === "colour");
    expect(colour, "content/faq.ts has a colour entry").toBeDefined();
    const entries = FAQ.map((e) => (e.id === "colour" ? { ...e, published: true } : e));
    const { text } = await copyAnswerFor(entries, colour!.question);

    const deepLink = `${origin()}/#faq-colour`;
    const urls = text.match(URL_RE) ?? [];
    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatch(/^https:\/\/www\.tissus-print\.com\//);
    expect(urls[1]).toBe(deepLink);
    const lines = text.split("\n");
    expect(lines).toContain(urls[0]);
    expect(lines.at(-1)).toBe(deepLink);
    expect(text).not.toContain("**");
    expect(text).not.toContain("[CONFIRM");
  });

  it("with NEXT_PUBLIC_SITE_URL set, Copy link in a FaqSection panel copies the override origin (trailing / stripped)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://box.tail1234.ts.net/");
    asAdmin();
    const user = setupUser();
    render(<FaqSection entries={THREE} />);
    const panel = await open("Shipping?", user);
    await user.click(within(panel).getByRole("button", { name: COPY_LINK }));
    expect(writeText).toHaveBeenCalledWith("https://box.tail1234.ts.net/#faq-shipping");
  });
});
