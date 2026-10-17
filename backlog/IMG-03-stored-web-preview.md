# Issue: Each uploaded picture gets one stored web preview, and every picture is resized from it

## Phase: 3

## Type: improvement

## Size: M (~12 files, ~$4 Claude)

## Description

Design: `docs/architecture/0007-image-egress.md` (answer B, option 2). JCC
asked (2026-10-17): "Should we be storing small versions of the image in
convex?" Yes. One preview per picture, made once at upload.

Even after IMG-01, Next's optimizer fetches the **whole original** from
Convex for every (picture, width) it hasn't cached. A 10 MB print file shown
at 3 widths costs 30 MB of egress per server cache lifetime, and every new
server or instance repeats it. With a stored preview (≤ 2048 px on the long
side, WebP q≈80, typically 100–300 KB) the optimizer resizes from that
instead, and Convex serves the original only for downloads.

### Build steps

1. **Spike first, stop and report if it fails.** Add a `"use node"` internal
   action that loads `sharp` (add it to `node.externalPackages` in
   `convex.json`), then `npx convex dev --once` and run it on the dev 10.6 MB
   PNG. Record the time, memory and output size. If `sharp` won't load, stop:
   the fallback is a Next route handler (doc option 4), and that needs a new
   design.
2. **Schema.** `designAssets.previewStorageId: v.optional(v.id("_storage"))`.
   Optional, so no migration is needed to deploy.
3. **Generate.** `insertDesignAssets` (`convex/_designAssets.ts:160`)
   schedules `internal.imagePreviews.generate({ assetId })` for each
   PNG/JPEG/WebP row (`ctx.scheduler.runAfter(0, …)`). The action reads the
   original (`ctx.storage.get`, the one deliberate file read), resizes with
   `.rotate().resize({ width: 2048, height: 2048, fit: "inside",
   withoutEnlargement: true }).webp({ quality: 80 })`, stores it, and calls an
   `internalMutation` that sets `previewStorageId`. If the asset was deleted
   in the meantime, it deletes the new blob instead.
4. **Delete.** `deleteDesignAsset` (`_designAssets.ts:232`) also deletes
   `previewStorageId`. So does `_e2e:cleanup`.
5. **Read.** Every query that builds a display URL (`resolveDesignAssets`,
   `assetSummariesByDesign`, `publicMainImagesByDesign`) returns
   `url` = original (downloads) and `displayUrl` = `getUrl(previewStorageId)
   ?? url`. Components pass `displayUrl` to `StoredImage` and keep `url` on
   download links. `publicMainImagesByDesign` sends **only** `displayUrl`
   when a preview exists, so the public form no longer exposes the original.
6. **Backfill.** `internalAction imagePreviews.backfill`: pages through
   assets with no preview and a resizable type, and schedules `generate` for
   each. JCC runs it once per deployment (`npx convex run`).

## Done when
1. A captain uploads a 10 MB PNG to a design and, within a few seconds, its tile and the dashboard chip show the picture while the browser and the Next server between them download under 1 MB from Convex storage.
2. A player opening that design's order form sees the picture, and the page's HTML and image URLs never contain the original's storage URL.

## Logic
- `imagePreviews.generate`: a PNG asset gets a WebP preview no wider or taller than 2048 px and `previewStorageId` set; an asset deleted before it runs leaves no orphan blob; a PDF asset is skipped.
- `designs.removeAsset`: deletes both the original and the preview blob; a non-owner non-admin call is refused and deletes neither.
- `orderForms.getPublic`: with a preview, `mainImage.url` is the preview's URL; without one (not generated yet), it falls back to today's rule.

## Dependencies
- Blocked by: IMG-01-captain-pictures-use-presets.md
- Needs JCC's go-ahead (see `needs_decision` on the 0007 card). The
  unblock doesn't depend on this issue.

## Notes
- Files likely touched: `convex.json`, `convex/schema.ts`,
  `convex/imagePreviews.ts` (new, `"use node"`),
  `convex/imagePreviewsDb.ts` (new, the internal mutations; a Node file
  can't define mutations), `convex/_designAssets.ts`, `convex/designs.ts`,
  `convex/_e2e.ts`, `lib/designAsset.ts` (types), and the components from
  IMG-01 that pass the display URL.
- Security review checks:
  - `generate`, `backfill` and the patch mutation are all `internal*`. No
    public function takes a storage id it didn't issue.
  - The patch mutation sets `previewStorageId` only on the asset it was
    scheduled for.
  - `getPublic` returns no filename and no original URL when a preview
    exists.
- Egress accounting: each upload costs one original read (counted as
  "accessing user files inside functions"). The backfill on dev reads 25 MB
  once.
- Read `convex/_generated/ai/guidelines.md` (actions, `"use node"`,
  scheduler) before building.
