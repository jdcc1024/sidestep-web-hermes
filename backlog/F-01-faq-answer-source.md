# Issue: FAQ answer source — one typed file drives the site FAQ

## Phase: 2

## Type: feature

## Size: M (~9 files)

## Description

Initiative 0001. Replace the hardcoded array in `FaqSection.tsx` with a single
answer source, `content/faq.ts`, that JCC edits, plus a pure module,
`lib/faq.ts`, that parses each answer once and renders it as React (site) or
plain text (the clipboard, used by F-02). The design and its reasons are in
`docs/architecture/0001-faq.md`. The UX spec is `docs/ux/0001-faq.md`, §3 and §5.

**This issue makes no wording or business decisions.** The 4 live answers move
across verbatim and stay published, so the live site says exactly what it says
today. UX's 4 new drafts go in verbatim, `[CONFIRM]` markers included, as
unpublished drafts. F-03 applies JCC's decisions later.

### `lib/faq.ts` (framework-free, unit tested)

```ts
export type FaqEntry = { id: string; question: string; answer: string; published: boolean };
export type Inline = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };
export type Block =
  | { kind: "p"; content: Inline[] }
  | { kind: "ul"; items: Inline[][] }
  | { kind: "ol"; items: Inline[][] };

export function parseAnswer(md: string): Block[];
export function toPlainText(blocks: Block[]): string;
export function isPublishable(entry: FaqEntry): boolean; // published && no "[CONFIRM" in question/answer
export function publishedFaqs(entries: readonly FaqEntry[]): FaqEntry[];
export function faqAnchorId(id: string): string;          // "faq-<id>"
export function faqUrl(origin: string, id: string): string; // `${origin}/#faq-${id}`
export function faqCopyText(plainText: string, origin: string, id: string): string; // text + "\n\n" + url
export function priceRange(): string;          // from PRICING_TIERS
export function formatTierPriceList(): string; // from PRICING_TIERS
```

Markdown subset: a blank line separates blocks. Consecutive lines starting
`- ` form a `ul`, and consecutive lines starting `<n>. ` form an `ol`. Inline
`[text](href)` becomes a link only when `href` starts with `/`, `#` or
`https://`; anything else stays literal text. Within a paragraph, single
newlines join with a space. No HTML is ever interpreted.

### `content/faq.ts`

Exports `FAQ: FaqEntry[]` in UX order: `cost, minimum, timeline, process,
design, design-tips, colour, shipping`.
- `minimum`, `timeline`, `design`, `shipping`: `published: true`, question and
  answer copied **verbatim from today's `FaqSection.tsx`**.
- `cost`, `process`, `design-tips`, `colour`: `published: false`, question and
  answer copied **verbatim from `docs/ux/0001-faq.md` §3** (Q1, Q4, Q6, Q7),
  including the `[CONFIRM: …]` lines. The `cost` answer interpolates
  `priceRange()`, `formatTierPriceList()` and `DESIGN_FEE` instead of typing
  the numbers.
- Also exports `PERMANENT_IDS = ["minimum", "timeline", "design", "shipping"] as const`,
  with a comment that ids in it must never be removed or renamed, and that an
  id is appended when its entry is first published.

### `FaqSection.tsx` (stays a server component)

Renders `publishedFaqs(FAQ)`. Each `AccordionItem` gets `value={id}` and
`id={faqAnchorId(id)}`, and its answer is rendered from `parseAnswer` blocks as
`<p>`, `<ul>`, `<ol>` and `next/link` elements. It adds the UX §3 section copy:
the subtitle "Straight answers to what captains ask us most." and, after the
list, "Didn't see your question?" with a "Get a quote and ask us" link to
`/intake`, styled with `buttonVariants` per CLAUDE.md, not `<Button render={<Link/>}>`.
**Hold:** the subtitle and CTA are UX draft copy (D11). If Gate 1 hasn't approved
them by build time, ship without them and note that in the handoff.

### `MarketingNav.tsx`

Add `{ href: "/#faq", label: "FAQ" }` after Pricing. It appears in the desktop
nav and the mobile sheet (both come from the same `navLinks` array).

## Acceptance Criteria

lib/faq.ts
- [ ] `parseAnswer("a\nb\n\nc")` → two `p` blocks: the first has text "a b", the second "c"
- [ ] Consecutive `- x` lines → one `ul` block. Consecutive `1. x` lines → one `ol` block, and item text excludes the marker
- [ ] `[price calculator](/#pricing)` → a link inline with text "price calculator" and href "/#pricing"
- [ ] `[x](javascript:alert(1))` and `[x](http://evil)` → plain text, not a link. `<b>hi</b>` stays literal text
- [ ] `toPlainText`: blocks separated by exactly one blank line, `ol` items prefixed `1. `, `2. `…, `ul` items prefixed `• `, and links rendered as their text only (no URL)
- [ ] `isPublishable` is false when `published` is false, or when the question or answer contains `[CONFIRM`. Otherwise true
- [ ] `publishedFaqs` keeps input order and drops non-publishable entries
- [ ] `faqUrl("https://x.test", "timeline")` === `"https://x.test/#faq-timeline"`
- [ ] `faqCopyText("Body", "https://x.test", "timeline")` === `"Body\n\nhttps://x.test/#faq-timeline"`
- [ ] With the current tiers, `formatTierPriceList()` === `"$60 each for 5–9, $50 for 10–24, $45 for 25–49 and $40 for 50 or more"` and `priceRange()` === `"$40 to $60"`
- [ ] Both price helpers are derived from `PRICING_TIERS` (the test builds expectations from `PRICING_TIERS`, or mocks it with different prices and sees the output change)

content/faq.ts (content lint, `content/faq.test.ts`)
- [ ] Ids are unique and match `/^[a-z0-9]+(-[a-z0-9]+)*$/`
- [ ] Every id in `PERMANENT_IDS` exists in `FAQ` and is published
- [ ] Every entry marked `published: true` passes `isPublishable`
- [ ] Every answer parses into at least one block
- [ ] All 6 done_when topics have an entry: `cost, minimum, timeline, design-tips, process, colour`
- [ ] The `cost` answer contains the output of `formatTierPriceList()` and `$${DESIGN_FEE}`

FaqSection (`FaqSection.test.tsx`, jsdom)
- [ ] Renders exactly the published entries' questions, in `FAQ` order (today: minimum, timeline, design, shipping)
- [ ] No text matching `[CONFIRM` appears anywhere in the rendered output
- [ ] Each item's root has `id="faq-<id>"`
- [ ] Opening an item shows its answer. A test fixture answer with a list renders a real `<ul>`/`<ol>`, and a link renders an `<a href>`
- [ ] Section keeps `id="faq"` and the "Common questions, answered." heading
- [ ] (if D11 approved) The "Get a quote and ask us" link points to `/intake`

MarketingNav
- [ ] A "FAQ" link with `href="/#faq"` appears after "Pricing" in the desktop nav and in the mobile sheet

Regression
- [ ] The live site's visible FAQ text is unchanged apart from the approved subtitle and CTA
- [ ] `npm run verify` passes

## Dependencies
- Blocked by: none

## Notes
- Files likely touched: `lib/faq.ts`, `lib/faq.test.ts`, `content/faq.ts`,
  `content/faq.test.ts`, `components/marketing/FaqSection.tsx`,
  `components/marketing/FaqSection.test.tsx`, `components/layout/MarketingNav.tsx`
  (+ its test if one exists).
- `content/` is a new top-level folder, covered by tsconfig's `**/*.ts` and
  vitest's default include. Add one line for it to CLAUDE.md's Project Structure
  tree: "`content/` ← editable site copy (FAQ)".
- Don't use `react-markdown` or add any dependency. Don't use `dangerouslySetInnerHTML`.
- Leave `<Reveal>` around the FAQ as it is. F-02 removes it.
- Testability: `FaqSection` takes an optional `entries?: readonly FaqEntry[]`
  prop that defaults to `FAQ`, so tests can pass fixtures (a list, a link, a
  `[CONFIRM]` draft) without `vi.mock`. `app/page.tsx` keeps calling
  `<FaqSection />`.
- The price helpers live in `lib/faq.ts`, not `lib/pricing.ts`, so the pricing
  module doesn't grow FAQ-specific phrasing. Either placement is fine if you
  have a reason.
