# Issue: Order Page Design Main Image

## Status: done

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [x] Database: none (uses `designAssets` + resolver from D-01)
- [x] API: order/design query returns each linked design's resolved main image + file count
- [x] Frontend: order page renders per-design main image thumbnail alongside the count
- [x] Tests: query returns correct main image per design; render test

## Description
Make the order page visual: for each design linked to an order, show the resolved main image next to its file count — picture and number, not either/or. Uses the main-image resolver and asset URLs from D-01, so this is a thin read-side + UI slice.

## Acceptance Criteria
- [x] The order query returns, per linked design, a resolved main-image URL (via the D-01 resolver) and the file count
- [x] Order page renders the main image thumbnail beside the count for each design; falls back cleanly when there's no image
- [x] Handles unavailable URLs gracefully
- [x] All tests pass
- [x] No regressions in existing tests

## Implementation Summary
- `convex/_designAssets.ts` gains `assetSummariesByDesign` — one index read per
  design returning `{ fileCount, mainImage }`, resolving the main asset over
  metadata and asking storage for only that one URL.
- `orders.getMyOrder` now carries `mainImage` next to `fileCount` per design.
- The order page renders a 56px thumbnail beside the count in each design
  section, falling back to a labelled placeholder for: no files, a main file a
  browser can't draw (an explicitly flagged print template), a null URL, and an
  `onError` from a signed URL that expired after the query resolved.

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
