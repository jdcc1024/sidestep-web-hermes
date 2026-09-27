# Issue: Order Detail Design Sections And Handoff

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none
- [x] API: lazy run creation — a run is created on first "collect", not on order save
- [x] Frontend: order detail shows linked designs as grouped sections; "Set up your run / collect sizes" handoff CTA
- [x] Tests: handoff creates a run on first collect; no run exists immediately after order save

## Description
On order detail, present each linked design as its own section under one order timeline, and give the captain a clear handoff into Run Setup to start collecting. The jersey run is created **lazily on first collect** — saving an order does not eagerly create a run.

## Acceptance Criteria
- [x] Order detail renders each linked design as a grouped section (per-design rollup placeholders are fine until O-07 wires real counts)
- [x] A prominent handoff CTA routes to Run Setup ("Set up your run / collect sizes")
- [x] Saving an order does **not** create a `jerseyRuns` record
- [x] The first "collect" action creates exactly one run for the order
- [x] Zero-design orders show the handoff as not-yet-available with the design nudge
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: O-04
- Blocks: O-06, O-07, O-08

## PRD Reference
See: docs/prd/new-edit-order-page.md — Section 2, Section 6 (Run creation = lazy), Open Questions

## Implementation Notes
- One run spans all designs (PRD §6); "which design" becomes a per-row attribute handled in the Roster Manager slice.
- Use `buttonVariants` on `<Link>` for the handoff CTA (CLAUDE.md), not `<Button render={<Link/>}>`.

## TDD Approach
1. Write test: after `orders.create` there is no run; invoking the collect entrypoint creates one run; a second invocation does not duplicate it.
2. Implement: lazy run creation helper + order-detail sections + CTA.
3. Verify: tests green, manual smoke.
