# Issue: On-screen pictures only ever come from the stored preview

## Phase: 3

## Type: improvement

## Size: M (~10 files, ~$3 Claude)

## Description

Design: `docs/architecture/0004-image-previews.md` § "Original-file rule",
gaps G1 and G2. JCC's rule (Discord #office-hours, 2026-10-19): "NO IMAGES
loaded onto our webapp are the original."

Today it holds for every file on dev, but only because all 5 dev files are
PNG/JPEG with a preview. When an asset has no `previewStorageId`, the reads
fall back to the original: `displayUrlOf` (`convex/_designAssets.ts:49`),
`pictureUrl` (`lib/designAsset.ts:67`) and `publicMainImagesByDesign`
(`convex/_designAssets.ts:160`, the public form, **unauthenticated**). That
happens for a few seconds after every upload, forever when the preview
action fails, and always for GIF and SVG (no preview is ever made).

### Build steps

1. **Previews for GIF and SVG too.** Add a `canMakePreview(contentType)` in
   `lib/images.ts`: PNG, JPEG, WebP, GIF, SVG. `insertDesignAssets`,
   `imagePreviews.generate` and `imagePreviewsDb.assetsNeedingPreview` use it
   instead of `canOptimize`. In `generate`, GIF uses the first frame
   (`sharp(buf, { animated: false })`), SVG is rasterised (`density` high
   enough that the 2048 box is filled, then the same resize + WebP q80).
   `canOptimize` (what the Next optimizer may resize) stays as it is.
   First step: run `generate` once on dev against a small GIF and SVG. If
   sharp in Convex can't read one of them, keep that type out of
   `canMakePreview` (it falls to the placeholder below) and say so in the
   handoff. Don't stop the issue for it.
2. **No fallback to the original, anywhere.** `displayUrlOf` returns the
   preview's URL or `null`. `pictureUrl` returns `displayUrl` only.
   `publicMainImagesByDesign` returns `null` when the main has no preview
   (or its preview blob is gone), and never calls `getUrl(main.storageId)`.
   With a null display URL every surface already draws its placeholder
   (`DesignThumbnail`, the pool tile's typed file card, the gallery file
   card). Convex queries are reactive, so the tile swaps to the picture by
   itself when `setPreview` patches the row: no polling.
3. **The preview always goes through the optimizer.** It is always WebP, so
   the display shape carries the preview's content type (`image/webp`), not
   the asset's. A GIF/SVG design then renders through `/_next/image` like
   any other picture instead of `unoptimized`. Put the display content type
   wherever `displayUrl` lives (`ResolvedAsset`, `DesignMainImage`,
   `PublicDesignImage`). Keep `contentType` as the asset's own for labels
   and "is this an image?" checks.
4. **Re-run the backfill** for existing GIF/SVG assets: `npx convex run
   imagePreviews:backfill` on dev (dev has none today, so expect 0).

## Done when
1. A captain uploads an SVG to a design and, within 30 s, its pool tile shows the picture, and no image on the page (an `<img>` src or a `/_next/image` source) is the uploaded file's own storage URL.
2. A player opens an order form whose design's main picture has no preview yet and sees the placeholder, and no request or Convex response on the page contains that picture's original storage URL.

## Logic
- `imagePreviews.generate`: a GIF gets a WebP preview from its first frame and an SVG a rasterised one, both ≤ 2048 px; a file sharp can't read leaves no preview and doesn't throw; a PDF is skipped.
- `designs.getMyDesign`: an asset without a preview has `displayUrl` null, never the original's URL; with one, the preview's URL and `image/webp`.
- `orderForms.getPublic`: a main without a preview gives `mainImage` null and the payload never contains the original's URL; with a preview, the preview's URL.

## Dependencies
- Blocked by: none (IMG-03 landed).

## Notes
- Files likely touched: `lib/images.ts`, `lib/designAsset.ts`,
  `convex/_designAssets.ts`, `convex/imagePreviews.ts`,
  `convex/imagePreviewsDb.ts`, `components/design/DesignThumbnail.tsx`,
  `components/design/DesignBlocks.tsx`, `components/design/DesignAssetPool.tsx`,
  `components/design/GalleryEditor.tsx`, plus the Convex tests below.
- Existing tests that pin the old fallback and must flip (SDET rewrites
  them, they are not new lines): `convex/imagePreviews.test.ts:288`
  ("falls back to the original for displayUrl"),
  `convex/orderForms.previewImage.img03.test.ts:104` ("falls back to the
  original's URL"), and `convex/imagePreviews.img03.test.ts` if it asserts a
  GIF is skipped.
- E2E fixture for Done when 2: `_e2e:insertAsset` inserts a row without
  scheduling a preview, so `attachFile`/`attachBigPng` with `isMain` gives a
  preview-less main.
- Review checks (read the diff):
  - No `getUrl(asset.storageId)` / `getUrl(main.storageId)` left in any
    display path. `rg "getUrl\(" convex` shows only the download path(s)
    and the preview.
  - `generate` stays `internalAction`; `canMakePreview` adds no public
    surface.
  - SVG rasterising gets a buffer with no base path, so librsvg can't
    resolve `file:` or remote references. Confirm `sharp` is called on the
    buffer, not a path.
- `url` (the original) stays in the payloads for now. IMG-05 removes it.
  This issue touches display only.
- Product effect (accepted by the rule): an animated GIF shows its first
  frame, and a picture shows the placeholder for the second or two after
  upload until its preview exists.
