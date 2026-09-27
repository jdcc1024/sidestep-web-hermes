# Issue: Design Assets Metadata Table

## Phase: 1

## Type: infrastructure

## Vertical Slice
This issue touches:
- [x] Database: new `designAssets` table (`by_design` index); remove `designs.fileIds`
- [x] API: `designs.createDesign` / `updateDesign` create asset rows with `filename` + `contentType`; `getMyDesign` + admin `getDesign` return resolved assets; shared main-image resolver
- [x] Frontend: `DesignForm` upload path sends filename + content type; detail pages read assets from the new shape
- [x] Tests: resolver unit tests (all fallback branches), web-safe content-type predicate, upload/permission smoke tests

## Description
Replace the bare `designs.fileIds: v.array(v.id("_storage"))` with a dedicated `designAssets` table carrying one row per file — `filename`, `contentType`, uploader provenance, and an `isMain` flag — so the rest of the feature can render real thumbnails and tell an image from a PDF/AI file. Adds a shared main-image resolver used by later slices and the order page. Foundation slice for the whole PRD.

## Acceptance Criteria
- [x] `designAssets` table exists with `designId`, `storageId`, `filename`, `contentType`, `isMain`, `uploadedByUserId`, `uploadedByAdmin` (snapshot), `createdAt`, indexed `by_design`
- [x] `designs.fileIds` is removed from the schema; **the one dummy design in the dev deployment still has to be deleted by hand** before `npx convex dev` will accept the new schema (see session report)
- [x] Upload flow persists `filename` + `contentType` per asset (client sends them; server records provenance)
- [x] `getMyDesign` and admin `getDesign` return assets with resolved storage URLs, handling `null` URLs gracefully
- [x] Shared main-image resolver: explicit `isMain` → first web-safe image by `createdAt` → none
- [x] Web-safe predicate covers `image/png|jpeg|webp|gif|svg+xml`
- [x] Permission helpers: upload = owner or admin; delete = owner for own uploads, admin for any; admin uploads are admin-delete-only
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: none
- Blocks: D-02, D-05, D-07

## PRD Reference
See: docs/prd/design-page-blocks.md — Section 5 (Scope), Section 6 (Implementation Decisions), Appendix slice 1

## Implementation Notes
- Follow the `lib/design/rules.ts` + `form.ts` grain; Convex imports from `rules`. Add a small `lib/designAsset` module for the resolver + web-safe predicate + permission helpers so they're unit-testable in isolation.
- `getMyDesign` already resolves per-file URLs via `ctx.storage.getUrl` (convex/designs.ts:120) — keep that pattern, now per asset row.
- `DesignForm` (components/portal/DesignForm.tsx) already does the two-phase upload; it just needs to pass `file.name` + `file.type` when creating asset rows.
- Existing consumers of `design.files` / `fileIds`: portal detail page, admin detail page (`fileUrls`), order/admin queries — update them to the asset shape so the build stays green (minimal read-side edits; rich rendering is D-02).
- `uploadedByAdmin` must be a snapshot (admin status can change) — mirror the superseded design-assets.md decision.

## TDD Approach
1. Write test: resolver returns explicit main, then first web-safe image, then none; web-safe predicate boundaries; permission helpers (owner/admin/non-owner); create asset row persists filename+contentType.
2. Implement: schema swap, `lib/designAsset` module, mutation arg + handler changes, query resolution.
3. Verify: convex-test + tsc clean, all smoke + unit tests green.
