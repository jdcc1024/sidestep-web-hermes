# Issue: Order Page Visual Pass

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: none
- [ ] API: none
- [x] Frontend: restyle the New/Edit Order page + order detail to match the Claude design mock's visual language
- [x] Tests: visual smoke in light/dark at 375 / 768 / 1280; no functional regressions

## Description
The New/Edit Order screen has no dedicated screen in the Claude design mock (it was marked "soon"), so the functional slices O-04/O-05 build it from scratch. This issue brings its *look* in line with the mock's established design language — the dark, dense, chip-and-meter aesthetic seen on the Roster Manager surface — so the order page feels like one product with the rest of the redesign. Pure presentation: no behaviour changes.

## Acceptance Criteria
- [ ] Page chrome matches the mock's design language: section cards on dark surfaces, generous density, Sidestep teal accents, uppercase section labels
- [ ] Order/design metadata uses the mock's **chip/badge** vocabulary (e.g. source/spec/status chips) rather than plain text where appropriate
- [ ] The readiness **progress meter** (from O-04) is styled to match the mock's "X of N" meter treatment
- [ ] Linked-design sections (from O-05) read as the mock's grouped sections (header + count + rows)
- [ ] All surfaces render correctly in **both light and dark** themes
- [ ] Uses existing shadcn primitives and theme tokens (`bg-card`, `text-muted-foreground`, `border-border`, etc.) — no new hand-rolled primitives
- [ ] Navigation CTAs use `buttonVariants` on `<Link>` (not `<Button render={<Link/>}>`) per CLAUDE.md
- [ ] No functional regressions — O-01..O-05 tests still pass
- [ ] All tests pass

## Dependencies
- Blocked by: O-05
- Blocks: none
- Note: this is a presentation layer over the working spine; do not start until O-04/O-05 have landed the structure and states.

## PRD Reference
See: docs/prd/new-edit-order-page.md — Section 2 (Proposed Solution), Section 8 (Success Metrics)

## Implementation Notes
- Reference: the Claude design mock "Sidestep Order Flow" — the order page has no screen there, so borrow the **Roster Manager** surface's design language (dark cards, chips, the progress meter, uppercase labels, teal accents). Do not invent a divergent style.
- The Roster Manager screen's own visual fidelity is owned by the separate Roster Manager PRD — keep this issue scoped to the order page + order detail only.
- Lean on the shadcn token + dark-mode work from Track S (S-14/S-15) rather than re-deriving palettes.

## TDD Approach
1. Write test: existing O-01..O-05 behaviour/component tests remain green (guards against regressions during restyle).
2. Implement: restyle sections, chips, meter, and grouped design sections against the mock's language.
3. Verify: manual smoke in light + dark at 375 / 768 / 1280; screenshots compared against the mock's aesthetic.
