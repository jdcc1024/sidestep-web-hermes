# Issue: Order Page Design Main Image

## Status: pending

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none (uses `designAssets` + resolver from D-01)
- [ ] API: order/design query returns each linked design's resolved main image + file count
- [ ] Frontend: order page renders per-design main image thumbnail alongside the count
- [ ] Tests: query returns correct main image per design; render test

## Description
Make the order page visual: for each design linked to an order, show the resolved main image next to its file count — picture and number, not either/or. Uses the main-image resolver and asset URLs from D-01, so this is a thin read-side + UI slice.

## Acceptance Criteria
- [ ] The order query returns, per linked design, a resolved main-image URL (via the D-01 resolver) and the file count
- [ ] Order page renders the main image thumbnail beside the count for each design; falls back cleanly when there's no image
- [ ] Handles unavailable URLs gracefully
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: D-01
- Blocks: D-08

## PRD Reference
See: docs/prd/design-page-blocks.md — Section 5 (order page), Appendix slice 7

## Implementation Notes
- Reuse the shared resolver from D-01 (`lib/designAsset`); don't reinvent main-image selection here.
- Compose with the roster fan-out: one main image *per design* (an order links many designs) — do not invent an order-level main image.
- Order page is the captain's at-a-glance hub; keep the thumbnail modest and the count legible.

## TDD Approach
1. Write test: query returns per-design main image + count across resolver fallback cases; render shows image + count and the no-image fallback.
2. Implement: extend the order/design query; add the thumbnail to the order page design sections.
3. Verify: convex + component tests green; manual order-page check.
