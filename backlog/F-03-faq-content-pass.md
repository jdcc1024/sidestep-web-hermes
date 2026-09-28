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
1. JCC's Gate 1 answers to UX `needs_decision` D2–D8, D11 and architect A4 (on the board /
   Gate 1 packet `~/sidestep/docs/gates/0001-gate1.md`).
2. The drafts in `docs/ux/0001-faq.md` §3, as marked up or approved by JCC.

For each of the 8 entries:
- Replace the answer with the approved wording, verbatim. **Except `minimum`:
  it keeps today's live wording (JCC, A3).** For `timeline` and `design` this
  **replaces today's live text** (for example, the
  "20+ years" line leaves `design`, per UX).
- Remove every `[CONFIRM: …]` by filling it with JCC's fact or deleting it, as
  JCC decided.
- Set `published: true` and append the id to `PERMANENT_IDS`.
- Keep prices in the `cost` answer interpolated from `lib/pricing.ts`. Never
  type a tier price or the design fee as a literal. (`minimum` is the one
  deliberate exception: its "10" and "5–10" are policy wording, not the
  calculator's numbers.)
- If JCC approved D11, set `FAQ_SECTION.subtitle` / `cta` to the approved text.
  Still `content/faq.ts` only.
- An entry JCC isn't ready to answer stays `published: false`. It is invisible
  and never copied, and that is fine to ship.

If D8 says so, also update the "20+ years" claim in
`components/marketing/HeroSection.tsx` (and its test).

## Acceptance Criteria
- [ ] No published entry contains `[CONFIRM`. Any entry that still contains one is `published: false` and named in the handoff as deliberately held back
- [ ] Every published entry's question and answer match the Gate-1-approved text verbatim (SDET diffs against the approved source)
- [ ] `PERMANENT_IDS` contains every published id
- [ ] No price or fee is typed as a literal in `content/faq.ts`. They come from `lib/pricing.ts` (grep: no `\$\d` outside `${…}` interpolation)
- [ ] The diff touches only `content/faq.ts` (plus `HeroSection` if D8 says so): no JSX or component change was needed
- [ ] The rendered site shows the published entries in the order `cost, minimum, timeline, process, design, design-tips, colour, shipping` (skipping any unpublished)
- [ ] `minimum` is unchanged from today's live text, and `lib/pricing.ts` / the calculator are untouched (JCC, A3)
- [ ] `npm run verify` passes

## Dependencies
- Blocked by: F-01-faq-answer-source
- Blocked by: JCC decisions D2–D8, D11 and A4 (Gate 1). D1 is settled: keep
  the live `minimum` answer, leave the calculator alone (A3). No F-04.

## Notes
- Files likely touched: `content/faq.ts`, maybe
  `components/marketing/HeroSection.tsx` (+ `.test.tsx`).
- Independent of F-02. It can land before or after it.
- If JCC edits via GitHub's web editor, the commit skips `npm run verify`. Run
  it afterwards (SDET or ss-dev) on `main` and report the result.
