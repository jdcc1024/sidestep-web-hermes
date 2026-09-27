# Issue: Order Links Many Designs

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [x] Database: `orders` keeps `designIds: array` (already exists); `estimatedQuantity` retained but treated as informational
- [x] API: `orders.create` / `orders.update` accept 0..many `designIds`; remove the single-design / spec assumptions
- [x] Frontend: `OrderForm` drops spec fields, supports linking 0..many designs
- [x] Tests: order mutation smoke (zero-design + multi-design), form tests

## Description
Decouple the order from silhouette specs (now on designs) and let one order link **zero to many** designs. The order total stops being a frozen estimate — `estimatedQuantity` becomes informational only. This is the core data change behind the "season kit = one order, many designs" flow.

## Acceptance Criteria
- [x] `orders.create` / `orders.update` accept an array of `designIds` of length 0 or more
- [x] An order can be created with **zero** designs and persists successfully
- [x] `OrderForm` no longer collects `jerseyStyle` / `neckline` / `sleeveStyle`
- [x] `OrderForm` links multiple existing designs from "My Designs"
- [x] `estimatedQuantity` is retained on the record but no longer presented as the binding quantity
- [x] Convex smoke tests cover zero-design and multi-design create paths
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: O-01, O-02
- Blocks: O-04

## PRD Reference
See: docs/prd/new-edit-order-page.md — Section 4 (P0 stories), Section 6 (Implementation Decisions)

## Implementation Notes
- `orders.designIds` is already `v.array(v.id("designs"))` (schema.ts:32) — the change is mostly removing the spec fields and relaxing the "needs a design" assumption.
- Inline design creation from a slot is **out of scope here** (P2 / fast-follow); this issue links existing designs only.
- Keep using `buttonVariants` on `<Link>` for any navigation CTA (CLAUDE.md).

## TDD Approach
1. Write test: `orders.create` with `designIds: []` succeeds; with two ids persists both; spec args are gone.
2. Implement: mutation arg changes; OrderForm field removal + multi-link UI.
3. Verify: smoke + form tests green.
