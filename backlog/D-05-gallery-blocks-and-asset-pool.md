# Issue: Gallery Blocks and Asset Pool

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none (galleries reference `designAssets` from D-01, stored in `designs.blocks`)
- [ ] API: asset upload/delete (owner-or-admin, admin-delete-only for admin uploads), set-main; gallery block create/update with `assetIds`
- [ ] Frontend: asset pool manager (upload, set main, delete) + gallery block editing (hand-pick images, caption) in the shared editor
- [ ] Tests: asset permission mutations; gallery editor interaction tests

## Description
The heaviest slice: manage the design's uploaded image pool and build captioned galleries from hand-picked images. Owner/admin upload to the pool, set a main image, delete under permission rules, then create gallery blocks that reference a chosen subset of assets with a caption. One image may appear in more than one gallery.

## Acceptance Criteria
- [x] Asset pool UI lists uploaded assets with thumbnails (web-safe) / typed cards (other), supports upload, set-main, and delete
- [x] Delete respects permissions: owner deletes own uploads, admin deletes any, admin-uploaded assets are admin-delete-only
- [x] Gallery block: create with a caption and a hand-picked set of `assetIds`; edit selection + caption; multiple galleries per design
- [x] The same asset can be referenced by more than one gallery; removing an asset from the pool removes its references gracefully
- [x] Set-main reflects through the D-01 resolver
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: D-01, D-03
- Blocks: D-06

## PRD Reference
See: docs/prd/design-page-blocks.md — Section 2, Section 5 (gallery blocks + asset pool), Appendix slice 5

## Implementation Notes
- Reuse the existing two-phase upload UI from `DesignForm` for the pool; the asset rows + resolver come from D-01.
- Gallery editing plugs into the `DesignBlockEditor` (D-03) as the gallery block-type. Image hand-pick can be a checkbox grid over the pool.
- Guard against dangling references: when an asset is deleted, strip its id from any gallery `assetIds` in the same mutation (or filter at render) — pick one and test it.

## TDD Approach
1. Write test: upload creates asset + provenance; delete permission matrix; gallery create/edit persists caption + assetIds; deleting a referenced asset leaves galleries valid.
2. Implement: asset pool manager + gallery block-type editor + set-main.
3. Verify: convex + component tests green; manual mixed-type gallery check.
