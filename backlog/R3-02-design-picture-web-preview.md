# Issue: Design pictures get a web-size preview at upload; the public form uses it

## Phase: 3

## Type: improvement

## Size: S/M (~8 files, ~$3)

## Description

Initiative 0004. Design: `docs/architecture/0004-public-form.md` (Q2, option C).
Follows R3-01, which caps the public form's picture at 2 MB. Without this, a
design whose main picture is a print-size export shows no picture to
players.

Measured on dev: the 10.6 MB main PNG (3732×4406) becomes **82 KB** as a
1200px-wide WebP at q80, and encoding takes about 1 s.

- **Schema:** `designAssets.previewStorageId: v.optional(v.id("_storage"))`.
  Optional, so no migration is needed.
- **Make the preview:** add `convex/designAssetPreviews.ts` (`"use node"`,
  actions only) with `internalAction makePreview({ assetId })`:
  - Load the asset through an internal query. Skip unless it's PNG, JPEG or
    WebP (GIF can be animated and SVG is already small, so neither gets a
    preview).
  - `ctx.storage.get` the blob, then `sharp` resize to width 1200
    (`withoutEnlargement`), WebP q80, and `ctx.storage.store` the result.
  - Save it with `internalMutation setPreview({ assetId, previewStorageId })`.
    If the asset was deleted in the meantime, that mutation deletes the new
    blob instead of orphaning it.
- **Hook:** `insertDesignAssets` (`convex/_designAssets.ts:135`) schedules
  `makePreview` with `ctx.scheduler.runAfter(0, …)` for each row. Both upload
  paths (`designs.ts:230`, `:292`) already go through it, so this is the only
  hook needed.
- **Delete:** `deleteDesignAsset` (`_designAssets.ts:207`) and `_e2e:cleanup`
  (`_e2e.ts:210`) also delete `previewStorageId`.
- **Backfill:** `internalMutation backfillPreviews` schedules `makePreview`
  for every raster asset that has no preview yet. It's idempotent, and it runs
  once per deployment with `npx convex run designAssetPreviews:backfillPreviews`
  (JCC runs it on prod at deploy).
- **Use it:** `publicMainImagesByDesign` (from R3-01) sends the preview's URL
  and `image/webp` when the main asset has a preview. Otherwise it falls back
  to the original under the same 2 MB cap.
- **Config:** add `sharp` as a direct dependency (it's already in the tree
  through Next, Apache-2.0, free). Add `convex.json`
  `{ "node": { "externalPackages": ["sharp"] } }` so Convex installs the
  native binary on its side instead of bundling it.

Out of scope: the captain's pages, which keep showing the original. Moving
them to the preview is a one-line follow-up per surface once this has run for
a while.

## Done when
1. A player opening a single-design form whose design's main picture is a print-size PNG (over 2 MB) sees the picture, the browser downloads under 300 KB for it, and tapping it opens it full size.

## Logic
- `setPreview`: saves the preview id on the asset; when the asset no longer exists, it deletes the given blob and writes nothing.
- `deleteDesignAsset`: deletes the asset row, its original blob and its preview blob.
- `orderForms.getPublic`: a main asset with a preview returns the preview URL and `image/webp`; one without a preview behaves as in R3-01 (over 2 MB returns `null`).
- `makePreview`: a PDF asset stores nothing and sets nothing.

## Dependencies
- Blocked by: R3-01-public-form-redesign.md

## Notes
- Files likely touched: `convex/schema.ts`, `convex/designAssetPreviews.ts`
  (new), `convex/_designAssets.ts`, `convex/_e2e.ts`, `convex.json` (new),
  `package.json` / `package-lock.json`, `convex/designAssetPreviews.test.ts`,
  `e2e/public-form.0004.spec.ts`.
- Guidelines (`convex/_generated/ai/guidelines.md`):
  - Never mix `"use node"` with queries or mutations in one file, so
    `setPreview` and the internal loader live outside the node file (e.g. in
    `convex/designAssetPreviewsDb.ts`).
  - `ctx.storage.store` is action-only.
- Risk: `sharp` has to load in Convex's Node runtime. Check it first with
  `npx convex dev` on the dev deployment: one upload, then confirm
  `previewStorageId` gets set. If `externalPackages` can't load it, stop and
  report back. Don't swap in a WASM encoder without asking.
- E2E seeding needs a raster PNG over 2 MB. Generate it in the seed action
  with `sharp` (e.g. 3000×3000 noise) rather than committing a large file.
- Review checks: every function here is `internal*` (no public entry point
  can start an image encode). Backfill has no `rm`-style bulk delete. The
  original file is never modified.
