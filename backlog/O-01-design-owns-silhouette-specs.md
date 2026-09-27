# Issue: Design Owns Silhouette Specs

## Phase: 1

## Type: infrastructure

## Vertical Slice
This issue touches:
- [x] Database: move `jerseyStyle` / `neckline` / `sleeveStyle` from `orders` onto `designs`
- [x] API: `designs.create` / `designs.update` accept specs; `orders.create` / `orders.update` stop accepting them; `lib/design` rules gain spec constants + checks
- [ ] Frontend: none (UI is O-02)
- [x] Tests: design + order mutation smoke tests; `lib/design` rule unit tests

## Description
Relocate the three silhouette spec fields from the order record onto the design record, so a reusable design carries its own cut. This is the foundational schema change the whole order-page rework depends on. No data migration — schema swap (no real data yet).

## Acceptance Criteria
- [x] `designs` table gains `jerseyStyle`, `neckline`, `sleeveStyle` (optional); `orders` table no longer defines them
- [x] `designs.create` / `designs.update` validate and persist the three specs via `lib/design/rules`
- [x] `orders.create` no longer references the removed fields and still succeeds (no `orders.update` mutation exists yet)
- [x] `lib/design/rules.ts` holds spec allowlists/constants with unit tests at each boundary
- [x] Convex smoke tests: design happy-path + rejection, order happy-path still green
- [x] Schema validated via convex-test + tsc (Convex DataModel derives from schema.ts); `npx convex dev` push not run (no deploy creds in-session)
- [x] All tests pass (304)
- [x] No regressions in existing tests

## Implementation Note (delivered)
Specs are **optional** on `designs` so the existing design form (which doesn't capture them until O-02) keeps creating designs. Removing the fields from `orders` forced minimal frontend edits to keep the build/tests green — front-running part of O-03: the order form's "Jersey specs" section was reduced to the `hasOwnDesign` flag, and the spec rows were removed from the portal/admin order detail pages. `NECKLINES` / `SLEEVE_STYLES` / `JERSEY_STYLE_MAX_LENGTH` and their guards moved from `lib/order` to `lib/design/rules`.

## Dependencies
- Blocked by: none
- Blocks: O-02, O-03

## PRD Reference
See: docs/prd/new-edit-order-page.md — Section 6 (Implementation Decisions) and Appendix (Sequencing, slice 1)

## Implementation Notes
- Follow the A-03/A-05 grain: `lib/design/rules.ts` (constants + atomic checks) + `form.ts` adapter; Convex imports from `rules.ts`.
- Specs are currently order-level free text on `orders` (schema.ts:28-30) and entered in `OrderForm`; this issue removes them from the order side. O-03 cleans up the order form.
- Sport / jersey-style picker stays as-is per PRD §6 — this issue only moves the *spec* fields, it does not restructure them into structured pickers.

## TDD Approach
1. Write test: `lib/design/rules` accepts valid specs and rejects invalid; `designs.create` persists specs; `orders.create` succeeds without spec args.
2. Implement: schema field move; mutation arg changes; rules module.
3. Verify: convex dev clean, all smoke + unit tests green.
