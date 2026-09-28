# Issue: FAQ answer source — one typed file drives the site FAQ

## Phase: 2

## Type: feature

## Size: M (~10 files)

## Description

Initiative 0001. Replace the hardcoded array in `FaqSection.tsx` with a single
answer source, `content/faq.ts`, that JCC edits, plus a pure module,
`lib/faq.ts`, that parses each answer once and renders it as React (site) or
plain text (the clipboard, used by F-02). The design and its reasons are in
`docs/architecture/0001-faq.md`. The approved wording is `docs/ux/0001-faq.md`
§3 (JCC, Gate 1 D11, 2026-09-28). The mockup shows older copy: §3 wins.

**For a visitor this issue is a refactor.** The 4 live answers move across
verbatim and stay published, so the FAQ list reads exactly as today. The only
visible changes are the approved subtitle, the CTA and the FAQ nav link. The
approved new answers go in as unpublished entries; F-03 swaps in the approved
text for the live 4 and publishes everything.

### `lib/faq.ts` (framework-free, unit tested)

```ts
export type FaqEntry = {
  id: string;
  question: string;
  answer: string;       // Markdown subset
  finePrint?: string;   // plain text, muted, under the answer; never copied (D5)
  published: boolean;
};
export type Inline = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };
export type Block =
  | { kind: "heading"; text: string }
  | { kind: "p"; content: Inline[] }
  | { kind: "ul"; items: Inline[][] }
  | { kind: "ol"; items: Inline[][] };

export function parseAnswer(md: string): Block[];
export function toPlainText(blocks: Block[]): string;
export function isExternalHref(href: string): boolean;   // starts with "https://"
export function isPublishable(entry: FaqEntry): boolean; // published && no "[CONFIRM" in question/answer/finePrint
export function publishedFaqs(entries: readonly FaqEntry[]): FaqEntry[];
export function faqAnchorId(id: string): string;          // "faq-<id>"
export function faqUrl(origin: string, id: string): string; // `${origin}/#faq-${id}`
export function faqCopyText(plainText: string, origin: string, id: string): string; // text + "\n\n" + url
export type TierFilter = { fromQuantity?: number }; // drop tiers whose max < fromQuantity
export function priceRange(opts?: TierFilter): string;          // from PRICING_TIERS
export function formatTierPriceList(opts?: TierFilter): string; // from PRICING_TIERS
```

Markdown subset:
- A blank line separates blocks. Consecutive lines starting `- ` form a `ul`;
  consecutive lines starting `<n>. ` form an `ol`. Inside a list, a line with
  no marker continues the previous item (trimmed, joined with a space).
- A line that is exactly `**text**` is a `heading` block; the lines after it,
  up to the next blank line, are a separate block. `**` anywhere else is
  literal text (no inline bold).
- Inline `[text](href)` is a link only when `href` starts with `/`, `#` or
  `https://`; anything else stays literal text. Within a paragraph, single
  newlines join with a space. No HTML is ever interpreted.

`toPlainText`:
- blocks are joined with `"\n\n"`, except a `heading` is joined to the block
  right after it with a single `"\n"`; the heading's text has no `**`
- `ol` items `1. `, `2. `…, `ul` items `• `, one item per line
- same-site links (`/`, `#`) become their text only
- an external (`https://`) link becomes its text in place, and its URL is
  appended on its own line (`"\n" + href`) directly after the block that
  contains it (UX §5 exception, D7)
- no hard wrapping

### `content/faq.ts`

**Rule (JCC, D10): every FAQ string lives here.** Adding, rewording,
reordering, hiding or publishing an entry, or changing the section copy,
must never need a change to JSX or any component. Besides `FAQ`, export:

```ts
export const FAQ_SECTION: {
  eyebrow: string;   // "FAQ"
  heading: string;   // "Common questions, answered."
  subtitle?: string; // omitted → not rendered
  cta?: { prompt: string; label: string; href: string }; // omitted → not rendered
};
```

Values (D11 approved): `eyebrow` and `heading` verbatim from today's
`FaqSection.tsx`; `subtitle: "Straight answers to what captains ask us most."`;
`cta: { prompt: "Didn't see your question?", label: "Get a quote and ask us", href: "/intake" }`.

`FAQ: FaqEntry[]` in this order: `cost, minimum, timeline, process, design,
design-tips, colour, shipping`.

| id | published | question + answer in F-01 |
|---|---|---|
| `minimum`, `timeline`, `design`, `shipping` | `true` | **verbatim from today's `FaqSection.tsx`** (question and answer). No `finePrint` yet |
| `cost` | `false` | §3 Q1 approved text. Prices interpolated (see below) |
| `process` | `false` | §3 Q4 approved text |
| `colour` | `false` | §3 Q7 approved text, with the 3 `**…**` heading lines and the Tissus Print `https://` link exactly as in §3 |
| `design-tips` | `false` | §3 Q6 draft verbatim, `[CONFIRM: …]` line included. Held out of the pilot (D6, follow-up card t_cd0e61b4); the entry reserves the id |

- **No price literal anywhere in `content/faq.ts`.** `cost` interpolates
  `priceRange(FROM_10)`, `formatTierPriceList(FROM_10)` and `DESIGN_FEE`, with
  `FROM_10 = { fromQuantity: 10 }` (A4 = A). (`design` still carries today's
  live text in F-01, which has no price; F-03 adds `$${DESIGN_FEE}` there.)
- A comment above `minimum`: the FAQ steers new customers to 10+ on purpose,
  the calculator still quotes 5–9 for repeat customers (A3, D1b), and the two
  must not be "fixed" to agree. Write no dollar amounts in comments either
  (the no-price-literal grep covers the whole file).
- `PERMANENT_IDS = ["minimum", "timeline", "design", "shipping"] as const`,
  with a comment that ids in it must never be removed or renamed, and that an
  id is appended when its entry is first published.

### `FaqSection.tsx` (stays a server component)

Renders `publishedFaqs(FAQ)` and `FAQ_SECTION`. The component contains no
literal user-facing copy. Each `AccordionItem` gets `value={id}` and
`id={faqAnchorId(id)}`. Answer blocks render as: `p` → `<p>`, `ul`/`ol` →
`<ul>`/`<ol>`, `heading` → `<h4>` (bold, foreground colour), same-site link →
`next/link`, external link → `<a href target="_blank" rel="noopener noreferrer">`.
`finePrint`, when present, renders as its own `<p>` after the answer blocks,
smaller text, `text-muted-foreground`. `FAQ_SECTION.subtitle` renders under the
heading and `FAQ_SECTION.cta` after the list when present (the CTA link styled
with `buttonVariants` per CLAUDE.md, not `<Button render={<Link/>}>`), and
nothing for either when absent.

### `MarketingNav.tsx`

Add `{ href: "/#faq", label: "FAQ" }` after Pricing. It appears in the desktop
nav and the mobile sheet (both come from the same `navLinks` array).

## Acceptance Criteria

lib/faq.ts — parser
- [ ] `parseAnswer("a\nb\n\nc")` → two `p` blocks: the first has text "a b", the second "c"
- [ ] Consecutive `- x` lines → one `ul` block. Consecutive `1. x` lines → one `ol` block, and item text excludes the marker
- [ ] `"1. one\n   more\n2. two"` → one `ol` with items "one more" and "two" (continuation line)
- [ ] `"**Head**\nbody line"` → `[{kind:"heading",text:"Head"}, p("body line")]`. `"a **b** c"` → one `p` with the literal text `a **b** c`
- [ ] `[price calculator](/#pricing)` → a link inline with text "price calculator" and href "/#pricing"
- [ ] `[x](https://example.com/a)` → a link; `isExternalHref("https://example.com/a")` is true, and false for `/intake` and `#pricing`
- [ ] `[x](javascript:alert(1))` and `[x](http://evil)` → plain text, not a link. `<b>hi</b>` stays literal text

lib/faq.ts — plain text
- [ ] `toPlainText`: blocks separated by exactly one blank line, `ol` items prefixed `1. `, `2. `…, `ul` items prefixed `• `, same-site links rendered as their text only (no URL)
- [ ] A heading is followed by a single `\n`, not a blank line: `toPlainText(parseAnswer("intro\n\n**H**\nbody"))` === `"intro\n\nH\nbody"`
- [ ] External link: `toPlainText(parseAnswer("More? [Read this](https://x.test/a).\n\nNext"))` === `"More? Read this.\nhttps://x.test/a\n\nNext"`
- [ ] `faqUrl("https://x.test", "timeline")` === `"https://x.test/#faq-timeline"`
- [ ] `faqCopyText("Body", "https://x.test", "timeline")` === `"Body\n\nhttps://x.test/#faq-timeline"`

lib/faq.ts — gate and prices
- [ ] `isPublishable` is false when `published` is false, or when the question, answer or `finePrint` contains `[CONFIRM`. Otherwise true
- [ ] `publishedFaqs` keeps input order and drops non-publishable entries
- [ ] With the current tiers, `formatTierPriceList()` === `"$60 each for 5–9, $50 for 10–24, $45 for 25–49 and $40 for 50 or more"` and `priceRange()` === `"$40 to $60"`
- [ ] With `{ fromQuantity: 10 }`: `formatTierPriceList` === `"$50 each for 10–24, $45 for 25–49 and $40 for 50 or more"` and `priceRange` === `"$40 to $50"`
- [ ] Both price helpers are derived from `PRICING_TIERS` (the test builds expectations from `PRICING_TIERS`, or mocks it with different prices and sees the output change)

content/faq.ts (content lint, `content/faq.test.ts`)
- [ ] Ids are unique and match `/^[a-z0-9]+(-[a-z0-9]+)*$/`
- [ ] `FAQ` ids in order are exactly `cost, minimum, timeline, process, design, design-tips, colour, shipping`
- [ ] Every id in `PERMANENT_IDS` exists in `FAQ` and is published
- [ ] Every entry marked `published: true` passes `isPublishable`
- [ ] Every answer parses into at least one block
- [ ] The 5 in-pilot done_when topics have an entry: `cost, minimum, timeline, process, colour`. `design-tips` exists and is `published: false` (D6: out of the pilot; this test must not require it to be published)
- [ ] `cost` answer contains `formatTierPriceList({ fromQuantity: 10 })`, `priceRange({ fromQuantity: 10 })` and `` `$${DESIGN_FEE}` ``, and does not contain `5–9` (A4 = A)
- [ ] No price literal: the source text of `content/faq.ts` has no match for `/\$\d/` (interpolations are written `` $${…} ``, so they don't match)
- [ ] `colour` parses into exactly 3 `heading` blocks with texts "Screen Glow vs Fabric", "Screen differences", "Lighting and Cameras", and contains one external link whose href starts `https://www.tissus-print.com/`
- [ ] `toPlainText(parseAnswer(colour.answer))` contains no `**`, contains `"Screen Glow vs Fabric\nYour phone lights up"`, and ends with `"Tissus Print explains it well.\n"` + the Tissus Print URL
- [ ] `FAQ_SECTION` equals the D11 values above (eyebrow, heading, subtitle, cta prompt/label/href)

FaqSection (`FaqSection.test.tsx`, jsdom)
- [ ] With the real content, renders exactly the published questions in order: "What is your minimum order?", "How long does an order take?", "Do you help with the design?", "Where do you ship?"
- [ ] No text matching `[CONFIRM` appears anywhere in the rendered output
- [ ] Each item's root has `id="faq-<id>"`
- [ ] Opening an item shows its answer. A fixture answer with a list renders a real `<ul>`/`<ol>`; a same-site link renders an `<a href>` without `target`
- [ ] A fixture with a `**Heading**` line renders an `<h4>` with that text (no asterisks visible)
- [ ] A fixture with an `https://` link renders `<a>` with `target="_blank"` and a `rel` containing `noopener`
- [ ] A fixture with `finePrint: "Small print."` renders it as a separate element after the answer with the `text-muted-foreground` class and a smaller text class than the answer; an entry without `finePrint` renders no extra element
- [ ] Section keeps `id="faq"`; with the real content shows "FAQ", "Common questions, answered.", the subtitle, "Didn't see your question?" and a "Get a quote and ask us" link with `href="/intake"`
- [ ] Section copy comes from `FAQ_SECTION`: a fixture with a different heading, subtitle and `cta` renders exactly those, and a fixture without `subtitle`/`cta` renders neither
- [ ] `FaqSection.tsx` contains no user-facing string literals (grep for the heading/eyebrow/subtitle/CTA text finds them only in `content/faq.ts`)

MarketingNav
- [ ] A "FAQ" link with `href="/#faq"` appears after "Pricing" in the desktop nav and in the mobile sheet

Regression
- [ ] The 4 published entries' questions and answers are byte-identical to today's `FaqSection.tsx` (including `minimum`: "Our standard minimum is 10 jerseys per design. Smaller runs of 5–10 jerseys are possible but carry a special-order fee."). F-03, not this issue, changes them
- [ ] `lib/pricing.ts`, `PricingCalculator` and `PricingSection` are untouched (JCC, A3); `HeroSection` is untouched (D8)
- [ ] `npm run verify` passes

## Dependencies
- Blocked by: none

## Notes
- Files likely touched: `lib/faq.ts`, `lib/faq.test.ts`, `content/faq.ts`,
  `content/faq.test.ts`, `components/marketing/FaqSection.tsx`,
  `components/marketing/FaqSection.test.tsx`, `components/layout/MarketingNav.tsx`
  (+ its test if one exists), `CLAUDE.md`.
- `content/` is a new top-level folder, covered by tsconfig's `**/*.ts` and
  vitest's default include. Add one line for it to CLAUDE.md's Project Structure
  tree: "`content/` ← editable site copy (FAQ)".
- Copy §3's text from `docs/ux/0001-faq.md` at commit f3f406c or later, not from
  the mockup. Strip the `> ` quote markers; line breaks don't matter (they
  collapse), blank lines and `**`/`[…](…)` syntax do.
- Don't use `react-markdown` or add any dependency. Don't use `dangerouslySetInnerHTML`.
- Leave `<Reveal>` around the FAQ as it is. F-02 removes it.
- Testability: `FaqSection` takes optional `entries?: readonly FaqEntry[]` and
  `section?: typeof FAQ_SECTION` props that default to `FAQ` / `FAQ_SECTION`, so
  tests can pass fixtures (a list, links, a heading, fine print, a `[CONFIRM]`
  draft) without `vi.mock`. `app/page.tsx` keeps calling `<FaqSection />`.
- The price helpers live in `lib/faq.ts`, not `lib/pricing.ts`, so the pricing
  module doesn't grow FAQ-specific phrasing.
- Branching: stacked branches F-01 → F-02 → F-03, merged once at Gate 2.
