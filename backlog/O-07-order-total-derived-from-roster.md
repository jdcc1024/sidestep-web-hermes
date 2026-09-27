# Issue: Order Total Derived From Roster

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: none (reads the external `rosterEntries`)
- [x] API: query that sums roster rows (overall and per linked design)
- [x] Frontend: order detail shows the derived total and per-design rollups
- [x] Tests: total = sum of rows; per-design grouping correct

## Description
Replace the static estimate with a live total derived from the unified roster: the order total and each linked design's count are computed from roster rows, not entered. This closes the "quantity is a frozen guess" gap.

## Acceptance Criteria
- [x] Order detail shows an order total equal to the sum of roster row quantities
- [x] Each linked design section shows its own count derived from rows tagged with that `designId`
- [x] With zero roster rows the total reads as 0 (or "X of N" where a target exists), never a stale estimate
- [x] `estimatedQuantity` is shown only as an informational/intake seed, clearly distinct from the derived total
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: O-05
- Blocked by: **R-04** (Derived Counts Query) — provides the Σ-qty total + per-design subtotals this issue displays. R-04 in turn rests on the unified `rosterEntries`/`orderEntries` model (R-01..R-03). (Was an undeclared external dependency; now tracked in Track R, docs/prd/roster-manager-and-lock.md.)

## PRD Reference
See: docs/prd/new-edit-order-page.md — Section 5 (Out of Scope: dependencies), Section 6 (Order total = derived)

## Implementation Notes
- "Variant" = `designId` on a roster row (PRD §6) — per-design counts are a group-by over rows, no separate variants table.

## TDD Approach
1. Write test: derived total equals sum of row quantities; per-design grouping tallies correctly; empty roster → 0.
2. Implement: aggregation query + order-detail display.
3. Verify: tests green once `rosterEntries` exists.
