# Issue: FAQ content pass — apply JCC's answers and publish

## Phase: 2

## Type: improvement

## Size: S (1–2 files, content only)

## Description

Initiative 0001. Turn the FAQ from "today's 4 answers plus 4 hidden drafts"
into the approved set of 8, by editing only `content/faq.ts`. This is the first
real use of "one place I edit". **JCC can do this himself in GitHub's web
editor** as the dry run. Otherwise ss-dev does it from the approved text.

Inputs, in order of authority:
1. JCC's Gate 1 answers to UX `needs_decision` D1–D8 and D11 (on the board /
   Gate 1 packet `~/sidestep/docs/gates/0001-gate1.md`).
2. The drafts in `docs/ux/0001-faq.md` §3, as marked up or approved by JCC.

For each of the 8 entries:
- Replace the answer with the approved wording, verbatim. For `minimum`,
  `timeline` and `design` this **replaces today's live text** (for example, the
  "20+ years" line leaves `design`, per UX).
- Remove every `[CONFIRM: …]` by filling it with JCC's fact or deleting it, as
  JCC decided.
- Set `published: true` and append the id to `PERMANENT_IDS`.
- Keep prices interpolated from `lib/pricing.ts`. Never type a price or a
  minimum quantity as a literal.
- An entry JCC isn't ready to answer stays `published: false`. It is invisible
  and never copied, and that is fine to ship.

If D8 says so, also update the "20+ years" claim in
`components/marketing/HeroSection.tsx` (and its test).

## Acceptance Criteria
- [ ] No published entry contains `[CONFIRM`. Any entry that still contains one is `published: false` and named in the handoff as deliberately held back
- [ ] Every published entry's question and answer match the Gate-1-approved text verbatim (SDET diffs against the approved source)
- [ ] `PERMANENT_IDS` contains every published id
- [ ] No price, fee or quantity number is typed as a literal in `content/faq.ts`. They all come from `lib/pricing.ts` (grep: no `\$\d` outside `${…}` interpolation)
- [ ] The rendered site shows the published entries in the order `cost, minimum, timeline, process, design, design-tips, colour, shipping` (skipping any unpublished)
- [ ] The FAQ `minimum` answer and the pricing section/calculator state the same minimum and small-run price (UX D1)
- [ ] `npm run verify` passes

## Dependencies
- Blocked by: F-01-faq-answer-source
- Blocked by: JCC decisions D1–D8 and D11 (Gate 1)
- If D1 ≠ A (the calculator must change: a new minimum or a small-run fee),
  **stop**. That is a pricing-logic change to `lib/pricing.ts` /
  `PricingCalculator`, and it becomes its own issue `F-04` (architect decision
  A3). Don't fold it into this one.

## Notes
- Files likely touched: `content/faq.ts`, maybe
  `components/marketing/HeroSection.tsx` (+ `.test.tsx`).
- Independent of F-02. It can land before or after it.
- If JCC edits via GitHub's web editor, the commit skips `npm run verify`. Run
  it afterwards (SDET or ss-dev) on `main` and report the result.
