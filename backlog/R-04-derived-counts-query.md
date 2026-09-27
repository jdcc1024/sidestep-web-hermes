# Issue: Derived Counts Query

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none (reads `orderEntries`)
- [x] API: query summing `orderEntry.qty` overall and grouped by `designId` for an order/run
- [x] Frontend: expose the derived counts for the order detail + captain dashboard to consume
- [x] Tests: total = Σ qty; per-design grouping; not-yet-filled excluded; blank/bulk counted

## Description
Provide the live production count the order page's derived total (O-07) reads: total = **Σ orderEntry.qty**, plus the same sum grouped by design. Roster entries with no order entries ("not yet filled") naturally contribute zero; blank/bulk lines (no roster entry) still count by qty.

## Acceptance Criteria
- [x] A query returns the order's total = sum of all order-entry quantities
- [x] The query returns per-design subtotals (Σ qty grouped by `designId`)
- [x] Not-yet-filled roster entries contribute 0 (they have no order entries)
- [x] Blank/bulk order entries (no roster entry) are included by their qty
- [x] The count excludes order entries belonging to a removed design (see R-05)
- [x] All tests pass
- [x] No regressions in existing tests

## Implementation
`orderEntries.countsByRun` (captain/admin) returns `{ total, byDesign: [{ designId, title, total }] }`, keyed by `runId` (the order page reads `run._id` from `jerseyRuns.getByOrder`). One pass tallies Σ qty per design id, then projects onto `order.designIds` so the breakdown lists every linked design (0 if unfilled) and `total` always reconciles with Σ byDesign. "Removed design" is the derived state — a design no longer in `order.designIds` — so its entries fall out of both total and breakdown with no schema change (R-05 owns the relabel/remove UI). Empty `{ total: 0, byDesign: [] }` for a missing run/order so the consumer never null-checks.

## Dependencies
- Blocked by: R-02, R-03
- Blocks: R-05, R-06
- Blocks (EXTERNAL): O-07 (Order Total Derived From Roster) consumes this query

## PRD Reference
See: docs/prd/roster-manager-and-lock.md — Section 6 (production total = Σ qty), Section 8 (success metrics)

## Implementation Notes
- Pure aggregation over `orderEntries`; group-by `designId` is cheap given the by-run index.
- Coordinate the shape with order-page O-07 so the consumer doesn't reshape it.

## TDD Approach
1. Write test: mixed fixture (filled slots, a not-yet-filled slot, a blank bulk line) → expected total and per-design subtotals.
2. Implement: aggregation query.
3. Verify: totals reconcile against a hand tally; removed-design entries excluded once R-05 lands.
