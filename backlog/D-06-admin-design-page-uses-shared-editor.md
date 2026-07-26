# Issue: Admin Design Page Uses Shared Editor

## Status: pending

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none
- [ ] API: admin block + asset mutations reuse the same owner-or-admin guards
- [ ] Frontend: mount the shared block editor on the admin design detail page (replacing `InlineEditField` for design content); admin upload
- [ ] Tests: admin can edit blocks/assets; permission parity tests

## Description
Wire the shared block editor into the admin design detail page so staff edit a design's blocks, palette, galleries, and asset pool through the exact same surface the owner uses. Replaces the admin page's current `InlineEditField` pattern for design *content* while keeping admin-only affordances (e.g. admin uploads, admin-delete rules).

## Acceptance Criteria
- [ ] Admin design detail page renders the shared `DesignBlockEditor` (text, palette, gallery editing + reorder)
- [ ] `InlineEditField` usage for design *content* is removed in favor of the shared editor (title/specs/Canva may keep their existing admin affordances)
- [ ] Admin can upload assets; admin uploads are admin-delete-only; admin can delete captain assets
- [ ] Owner and admin edits produce identical block/asset state (no divergent code paths)
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: D-04, D-05
- Blocks: D-08

## PRD Reference
See: docs/prd/design-page-blocks.md — Section 3, Section 4 (P0 admin story), Section 6 (editor decision), Appendix slice 6

## Implementation Notes
- `app/admin/designs/[id]/page.tsx` currently uses `InlineEditField` + `api.admin.updateDesign`. Point block/asset editing at the shared editor + the same block/asset mutations from D-03/D-04/D-05 (guarded owner-or-admin), so there's one code path.
- Keep the admin chrome (badge, "used by orders" card, owner info). Only the design-content editing swaps to the shared editor.
- Confirm permission guards already admit admins (they should, from D-01/D-03) — this slice is mostly UI wiring + parity tests.

## TDD Approach
1. Write test: admin edits blocks/swatches/galleries via shared mutations; admin upload + admin-delete-only enforced; owner-vs-admin produce same state.
2. Implement: mount shared editor on admin page; remove content `InlineEditField`s.
3. Verify: convex + component tests green; manual admin-page pass.
