# Issue: Design Form Captures Specs

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none (done in O-01)
- [ ] API: none (done in O-01)
- [x] Frontend: `DesignForm` gains jersey-style / neckline / sleeve fields; design detail page shows them
- [x] Tests: form validation + render tests

## Description
Surface the silhouette specs (now living on the design) in the design create/edit form and on the design detail page. Captains describe the cut where the artwork lives, not on the order.

## Acceptance Criteria
- [x] `DesignForm` collects `jerseyStyle`, `neckline`, `sleeveStyle` using the RHF + zod + shadcn Form pattern (mirrors S-07)
- [x] zod schema colocated; validation errors via `FormMessage`
- [x] `designs.create` / `designs.update` receive the new fields in the same payload shape
- [x] Design detail page renders the three specs
- [x] Files remain optional (idea-only design still saves)
- [x] Success via sonner toast; existing design tests pass
- [x] All tests pass (314)
- [x] No regressions in existing tests

## Implementation Note (delivered)
All three specs are **optional** in the form: `jerseyStyle` is a free-text
`Input`; `neckline` / `sleeveStyle` are shadcn `Select`s offering the
`lib/design/rules` allowlists. Blank means "not decided yet" — an idea-only
design (brief + files, cut undecided) still saves, matching PRD §4 / §6. The
zod `.refine` predicates are return-annotated `: boolean` so the
`isNeckline` / `isSleeveStyle` type guards don't widen `FormValues` into a
literal union and break RHF's resolver generics. Payload building lives in
the shared `lib/design` form adapter (`toDesignPayload` omits blank specs).
The detail page renders a "The cut" section; clearing a spec in edit mode is
not supported (convex `normalizeSpecs` leaves omitted specs as-is — a
deliberate API behaviour left untouched per this slice's "API: none" scope).

## Dependencies
- Blocked by: O-01
- Blocks: O-03

## PRD Reference
See: docs/prd/new-edit-order-page.md — Section 5 (In Scope), Appendix (Sequencing, slice 1)

## Implementation Notes
- Follow S-07 (`DesignForm` RHF conversion) — the file-upload field stays imperative; RHF owns only metadata + the new specs.
- Keep the warm, field-anchored validation voice (flow spec §7).

## TDD Approach
1. Write test: submitting the form with specs builds the expected `designs.create` payload; missing required spec shows a friendly error.
2. Implement: add fields + zod schema; render specs on detail.
3. Verify: light/dark render, tests green.
