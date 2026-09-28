# Issue: FAQ content pass — apply JCC's approved wording and publish

## Phase: 2

## Type: improvement

## Size: S (1 file, content only)

## Description

Initiative 0001. Turn the FAQ from "today's 4 answers plus hidden drafts" into
the approved pilot set of 7, by editing **only `content/faq.ts`**. This is the
proof of D10: a full content change needs no JSX, component or test change.

**ss-dev does this issue (P1 = B).** Nothing is pushed before Gate 2, so JCC
can't use GitHub's web editor as the dry run; his own "one place I edit" check
moves to Gate 2 (edit `content/faq.ts` locally, reload).

Source of truth: `docs/ux/0001-faq.md` §3 at commit f3f406c (all pilot wording
approved by JCC, D11, 2026-09-28), and the decisions in
`~/sidestep/docs/gates/0001-gate1.md` → `## JCC decisions`. Not the mockup.

| id | Change in this issue |
|---|---|
| `cost` | already §3 Q1 text from F-01 → set `published: true` |
| `minimum` | question → "What's the minimum order?"; answer → exactly "Our minimum is 10 jerseys per design." (D1b). Keep the A3 comment above it, updated to say the 5–9 sentence was dropped on purpose |
| `timeline` | answer → §3 Q3 (3 paragraphs, incl. "We don't do rush orders…", D3) |
| `process` | already §3 Q4 text → set `published: true` |
| `design` | answer → §3 Q5 (2 paragraphs; the "20+ years" and 3D mock-up lines go, D8); fee as `$${DESIGN_FEE}`; add `finePrint: "Includes up to 3 rounds of changes."` (D5) |
| `design-tips` | **unchanged**: stays `published: false` with its `[CONFIRM]` (D6, follow-up card t_cd0e61b4) |
| `colour` | already §3 Q7 text → set `published: true` |
| `shipping` | unchanged (§3 Q8 = live text) |

Then set `PERMANENT_IDS` to the 7 published ids. `FAQ_SECTION` is already the
approved copy from F-01; leave it.

Rules:
- Copy §3 verbatim (same words and punctuation; line breaks inside a paragraph
  don't matter, blank lines and `**`/`[…](…)` syntax do).
- No price or fee literal: `$125` in `design` is `$${DESIGN_FEE}`, as in `cost`.
- `lib/pricing.ts`, the calculator and `HeroSection` are not touched (A3, D8).

## Acceptance Criteria
- [ ] ss-dev's build commits (everything after SDET's F-03 test commit) touch only `content/faq.ts`: no JSX, component, test or `lib/` change was needed. Across the whole F-03 branch, `HeroSection`, `lib/pricing.ts`, `PricingCalculator` and `PricingSection` are untouched
- [ ] Published entries, in order, are exactly `cost, minimum, timeline, process, design, colour, shipping`; `design-tips` is present and `published: false`
- [ ] The rendered site shows those 7 questions in that order, with the question text from §3's table (incl. "What's the minimum order?")
- [ ] For each published entry, the answer (whitespace-collapsed) equals §3's approved text (whitespace-collapsed, `> ` markers stripped), with `cost`'s numbers produced by the interpolation. SDET encodes each expected string in the test
- [ ] `minimum` answer === `"Our minimum is 10 jerseys per design."`
- [ ] `design.finePrint` === `"Includes up to 3 rounds of changes."`; the rendered `design` panel shows it as muted fine print; `toPlainText(parseAnswer(design.answer))` does not contain "rounds"
- [ ] `design` answer contains `` `$${DESIGN_FEE}` `` output ("$125" with today's constant) and not "20+ years" or "3D mock-up"
- [ ] No price literal: `content/faq.ts` source has no match for `/\$\d/`
- [ ] No published entry contains `[CONFIRM` (the existing content lint and runtime gate stay green)
- [ ] `PERMANENT_IDS` equals the 7 published ids
- [ ] Copy answer for `timeline` (admin, `NEXT_PUBLIC_SITE_URL` unset) produces the §3 Q3 text as 3 paragraphs with "quote form" as plain words, then a blank line and `<origin>/#faq-timeline`
- [ ] Copy answer for `colour` ends with `"Tissus Print explains it well.\n<Tissus Print URL>\n\n<origin>/#faq-colour"` and contains the 3 headings without `**`
- [ ] `npm run verify` passes

## Dependencies
- Blocked by: F-01-faq-answer-source
- Blocked by: F-02-faq-deep-links-and-copy (stacked branches; the Copy answer
  criteria above need F-02's buttons)

## Notes
- Files likely touched: `content/faq.ts` only. If any criterion seems to need
  another file, stop and report it: that's a bug in F-01/F-02's content
  boundary, not something to fix here.
- The F-01 tests that pin today's live wording (the 4 published questions in
  `FaqSection.test.tsx`, the byte-identical regression check, `PERMANENT_IDS`
  contents) are expected to go red here. SDET's F-03 test card replaces them
  with the §3 expectations in its own commit, before the build; the build
  never edits tests (the diff rule above).
- `docs/ux/0001-faq.md` §4's Journey B paste example predates D3 (it lacks the
  "We don't do rush orders" paragraph). §3 wins.
- Branching: this branch starts from the F-02 build branch; Gate 2 merges it
  once, fast-forward.
