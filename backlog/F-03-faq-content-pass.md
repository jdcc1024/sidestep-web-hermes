# Issue: FAQ content pass — apply JCC's approved wording and publish

## Phase: 2

## Type: improvement

## Size: S (1 file, content only)

## Description

Initiative 0001. Turn the FAQ from "today's 4 answers plus hidden drafts" into
the approved set of 8 (the pilot 7 plus Q6, D6b), by editing **only
`content/faq.ts`**. This is the proof of D10: a full content change needs no
JSX, component or test change.

**ss-dev does this issue (P1 = B).** Nothing is pushed before Gate 2, so JCC
can't use GitHub's web editor as the dry run; his own "one place I edit" check
moves to Gate 2 (edit `content/faq.ts` locally, reload).

Source of truth: `docs/ux/0001-faq.md` §3 at commit 0d4b39a (pilot wording
approved by JCC, D11, 2026-09-28; Q6 approved 2026-09-29 by ss-pm on JCC's
delegation, D6b), and the decisions in `~/sidestep/docs/gates/0001-gate1.md`
→ `## JCC decisions`. Not the mockup (it still shows the old Q6 draft).

| id | Change in this issue |
|---|---|
| `cost` | already §3 Q1 text from F-01 → set `published: true` |
| `minimum` | question → "What's the minimum order?"; answer → exactly "Our minimum is 10 jerseys per design." (D1b). Keep the A3 comment above it, updated to say the 5–9 sentence was dropped on purpose |
| `timeline` | answer → §3 Q3 (3 paragraphs, incl. "We don't do rush orders…", D3) |
| `process` | already §3 Q4 text → set `published: true` |
| `design` | answer → §3 Q5 (2 paragraphs; the "20+ years" and 3D mock-up lines go, D8); fee as `$${DESIGN_FEE}`; add `finePrint: "Includes up to 3 rounds of changes."` (D5) |
| `design-tips` | question → "What should we know before sending our design?"; answer → §3 Q6 (intro line, blank line, 4 `- ` bullets; the old tips and their `[CONFIRM]` go entirely, D6b); set `published: true`. Id unchanged |
| `colour` | already §3 Q7 text → set `published: true` |
| `shipping` | unchanged (§3 Q8 = live text) |

The array order in `content/faq.ts` stays as it is (`design-tips` already sits
between `design` and `colour`), so no entry moves. Then set `PERMANENT_IDS` to
the 8 published ids. `FAQ_SECTION` is already the approved copy from F-01;
leave it.

The Q6 `answer` template literal, copied from §3 with the `> ` markers
stripped. Line breaks inside a bullet are free: the parser joins a bullet's
continuation lines, indented or not.

```
Most of the hold-ups we see come down to a few things:

- Send the original logo file, not a screenshot or a picture saved off
  Instagram. Whoever made your logo should have it, usually as an .ai, .eps,
  .svg or .pdf file. If a small image is all you've got, send it anyway and
  we'll tell you what we can do with it.
- Tell us your exact colours. "Navy" is a different blue to everyone, so if
  your club or a sponsor has official colours, send us the Pantone codes.
- Get your team to agree on the look before you send it. Changing direction
  after we've started designing slows everything down.
- Before you confirm, check the mock-up and your roster one more time: how
  every name is spelled, and that each player has the right number and size.
  A typo is a quick fix on the mock-up, but after printing it means making
  that jersey again.
```

Q6 states no price, fee or surcharge (JCC confirmed more colours don't change
the price). Don't add one.

Rules:
- Copy §3 verbatim (same words and punctuation; line breaks inside a paragraph
  don't matter, blank lines and `**`/`[…](…)` syntax do).
- No price or fee literal: `$125` in `design` is `$${DESIGN_FEE}`, as in `cost`.
- `lib/pricing.ts`, the calculator and `HeroSection` are not touched (A3, D8).

## Acceptance Criteria
- [ ] ss-dev's build commits (everything after SDET's F-03 test commit) touch only `content/faq.ts`: no JSX, component, test or `lib/` change was needed. Across the whole F-03 branch, `HeroSection`, `lib/pricing.ts`, `PricingCalculator` and `PricingSection` are untouched
- [ ] Published entries, in order, are exactly `cost, minimum, timeline, process, design, design-tips, colour, shipping` (8); no entry is `published: false`
- [ ] The rendered site shows those 8 questions in that order, with the question text from §3's table (incl. "What's the minimum order?" and "What should we know before sending our design?")
- [ ] For each published entry, the answer (whitespace-collapsed) equals §3's approved text (whitespace-collapsed, `> ` markers stripped), with `cost`'s numbers produced by the interpolation. SDET encodes each expected string in the test
- [ ] `minimum` answer === `"Our minimum is 10 jerseys per design."`
- [ ] `design-tips` answer (whitespace-collapsed) equals §3 Q6 verbatim (the block above); it parses to one paragraph followed by one `ul` of 4 items, and the rendered panel shows 4 list items
- [ ] `design-tips` answer contains no `$`, and no match for `/price|cost|fee|surcharge|\[CONFIRM/i`; none of the old tips' text remains (e.g. no "Skip tiny text", no "fair game")
- [ ] Copy answer for `design-tips` (admin, `NEXT_PUBLIC_SITE_URL` unset) === the intro line, a blank line, the 4 bullets each on one line starting `• `, a blank line, then `<origin>/#faq-design-tips`
- [ ] Deep link `/#faq-design-tips` opens the Q6 item (it's published now, so F-02's unknown/unpublished-id path no longer applies to it)
- [ ] `design.finePrint` === `"Includes up to 3 rounds of changes."`; the rendered `design` panel shows it as muted fine print; `toPlainText(parseAnswer(design.answer))` does not contain "rounds"
- [ ] `design` answer contains `` `$${DESIGN_FEE}` `` output ("$125" with today's constant) and not "20+ years" or "3D mock-up"
- [ ] No price literal: `content/faq.ts` source has no match for `/\$\d/`
- [ ] No published entry contains `[CONFIRM`, and `content/faq.ts` source has no `[CONFIRM` at all (the existing content lint and runtime gate stay green)
- [ ] `PERMANENT_IDS` equals the 8 published ids, in the order above
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
- Tests that pin `design-tips` as unpublished also go red and are SDET's to
  replace: `content/faq.test.ts` (the "design-tips exists and is published:
  false (D6)" check and the "unpublished entries carry §3 approved text"
  block), and `FaqAccordion.test.tsx`'s "a hash for the real, unpublished
  design-tips entry opens nothing on the real FAQ". After F-03 the real FAQ
  has no unpublished entry, so the "unpublished id opens nothing" behaviour
  stays covered by the fixture-based test only (`#faq-design-tips` /
  `#faq-gated` against fixtures). Keep that one.
- `docs/ux/0001-faq.md` §4's Journey B paste example predates D3 (it lacks the
  "We don't do rush orders" paragraph). §3 wins.
- Branching: this branch starts from the F-02 build branch; Gate 2 merges it
  once, fast-forward.
