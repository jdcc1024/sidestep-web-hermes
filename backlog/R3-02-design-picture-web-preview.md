# Issue: Big design pictures show on the public form, resized by next/image

## Phase: 3

## Type: improvement

## Size: M (~11 files, ~$3 Claude)

## Description

Initiative 0004. Design: `docs/architecture/0004-image-previews.md`. It
replaces the earlier plan for this issue (sharp in a Convex action, from
`0004-public-form.md` Q2 option C).
This follows R3-01, which hides any main picture over 2 MB from the public
form. Real print files are bigger than that (dev "Never OK Design" is a
10.6 MB PNG), so those designs show no picture today.

The fix: serve stored pictures through Next's built-in image optimizer
(`next/image` via `getImageProps`), with a `srcset` sized for each surface.
The issue also adds one image module that every stored picture can use
later. **This issue moves only the public form's pictures.** The captain's
pages render through the same component in `original` mode, so their look
and their bytes don't change.

Measured on this machine: the optimizer turns a 3.6 MB PNG into an 82 KB WebP
at 1080w, in 0.45 s cold and 0 ms warm. On an 11.7 MB 3732×4406 PNG, sharp
with the same settings takes 0.53 s at 1200w and gives 96 KB.

### Build steps

1. **Config.** In `next.config.ts`, merge the stray `module.exports`
   (`allowedDevOrigins`) into `nextConfig`. Add `images.remotePatterns`
   (`[convexImagePattern(NEXT_PUBLIC_CONVEX_URL)]`), `deviceSizes`
   (`IMAGE_DEVICE_SIZES`) and `maximumResponseBody`
   (`OPTIMIZABLE_SOURCE_MAX_BYTES`), all imported from `lib/images.ts`. If the
   URL is missing or malformed, throw an error that names the variable. Add
   `sharp` `^0.34.5` as a direct dependency (Next already installs it).
   **Check this step first:** run `npm run build && npx next start -p 3001`,
   then request `/_next/image?url=<a dev storage URL>&w=828&q=75`. It must
   return 200 `image/webp`. If you get 400, stop and report.
2. **`lib/images.ts`** (new). Pure, with relative imports only, because
   `next.config.ts` imports it. Exports:
   - `IMAGE_PRESETS`: `original`, `publicHero`, `publicTile`, `designChip`,
     `lightbox`, with the `sizes` values from the design doc
   - `ImagePreset`
   - `canOptimize(contentType)` and `shouldOptimize(contentType, preset)`
   - `OPTIMIZABLE_SOURCE_MAX_BYTES` (50 MB)
   - `IMAGE_DEVICE_SIZES`
   - `convexImagePattern(url)`
3. **`components/image/StoredImage.tsx`** (new). Props:
   `{ image: { url, contentType }, alt, preset = "original", className,
   loading, onError }`. It calls `getImageProps({ src, alt, fill: true,
   sizes, quality: 75, unoptimized: !shouldOptimize(...) })` and puts only
   `src`, `srcSet` and `sizes` on a plain `<img>`, so the caller's classes
   still size it. This is the one `no-img-element` disable for stored files.
   Its comment says why, and it replaces the old "doesn't apply" comment.
4. **Wire it.** `DesignThumbnail` and `ImageLightbox` get an optional
   `preset` prop (default `original`) and render `<StoredImage>`. When
   `DesignThumbnail` gets any preset other than `original`, it passes
   `preset="lightbox"` to its lightbox. Remove the old comment from both
   files.
5. **The rule.** In `lib/designAsset.ts`, `toPublicImage` lets PNG, JPEG and
   WebP through up to `OPTIMIZABLE_SOURCE_MAX_BYTES`. GIF and SVG keep
   `PUBLIC_IMAGE_MAX_BYTES` (2 MB). Nothing else changes, and `getPublic` /
   `publicMainImagesByDesign` need no code change.
6. **Public form.** In `PublicOrderForm.tsx`, pass `preset="publicHero"` to
   the single picture (`:1161`), `publicTile` to the tiles (`:1187`) and
   `designChip` to the two 40px thumbnails (`:853`, `:932`).

The E2E seed also needs support, and it's small enough for the same run:
- Add a test-only `_e2e:uploadUrl` as an `internalMutation` that returns
  `ctx.storage.generateUploadUrl()`, like the other `_e2e` helpers.
- In `e2e/support/convex.ts`, add `attachBigPng(designId)`. It builds a PNG
  of about 3.2 MB in Node: a 1200×900 RGB **gradient**, stored uncompressed
  with `zlib.deflateSync(raw, { level: 0 })`. The file is big, but its WebP
  is tiny. Noise would make the WebP heavy and the byte budget flaky. The
  helper POSTs the PNG to the upload URL, then calls `_e2e:insertAsset` with
  `isMain: true`.
- Don't send it through `_e2e:attachFile`. A 4 MB base64 argument overflows
  the 128 KB argv limit of `npx convex run`.

Out of scope:
- The captain's surfaces: order list, order detail, dashboard, designs list,
  gallery block, gallery editor and asset pool. The design doc lists them
  with what each takes.
- AVIF.
- A stored derivative (R3-03, filed only if a trigger in the design doc fires).
- Any Convex schema change.

## Done when
1. A player opening a single-design form whose design's main picture is a print-size PNG (over 2 MB) sees the picture, the browser downloads under 300 KB of images for the page, and tapping the picture opens it full size.

## Logic
- `toPublicImage`: a PNG over 2 MB but within `OPTIMIZABLE_SOURCE_MAX_BYTES` returns its url + contentType; one byte over that cap returns null; a GIF over 2 MB returns null.
- `convexImagePattern`: a Convex URL gives https, its exact hostname, pathname `/api/storage/**` and `search: ""`; an empty or malformed string gives null.
- `shouldOptimize`: PNG/JPEG/WebP (any casing or parameters) with a non-`original` preset is true; GIF, SVG and PDF are false; any type with `original` is false.
- `orderForms.getPublic`: a 3 MB PNG main returns its URL; a 3 MB GIF main returns `mainImage: null`.

## Dependencies
- Blocked by: R3-01-public-form-redesign.md (done, on main)

## Notes
- Files likely touched: `next.config.ts`, `package.json`, `package-lock.json`,
  `lib/images.ts` (new), `components/image/StoredImage.tsx` (new),
  `components/design/DesignThumbnail.tsx`, `components/design/ImageLightbox.tsx`,
  `lib/designAsset.ts`, `components/run/PublicOrderForm.tsx`, `convex/_e2e.ts`,
  `e2e/support/convex.ts`.
- Existing tests the SDET card changes, besides adding new ones:
  - `convex/orderForms.mainImage.test.ts:123` ("a PNG over 2 MB returns null")
    becomes the GIF case.
  - `lib/publicImage.0004.test.ts` keeps its 2 MB cases, rewritten for GIF.
- Measuring "under 300 KB" in the E2E: add up `(await response.body()).length`
  for every `image` response on the player page, after the picture has loaded
  and the lightbox has opened. At a 375px viewport and DPR 1, the hero and the
  lightbox each ask for 640w. Staying far under a 3 MB source proves the
  original was never fetched.
- "Opens it full size" means the lightbox dialog shows the picture as large as
  the screen can use (`lightbox` preset, ≤ 2048w). It doesn't download the
  print file. See `needs_decision` Q3 on the design card.
- The E2E `webServer` is `npm run dev`. The optimizer works in dev (measured on
  `next dev -p 8080`); it just sends `max-age=0` to the browser.
- Review checks:
  - `next.config.ts` allows one exact host, not `*.convex.cloud`.
    `dangerouslyAllowSVG` and `dangerouslyAllowLocalIP` are not set.
  - `qualities` stays at the default `[75]`.
  - Captain pages look and load the same: the order page thumbnail's `src` is
    still the plain storage URL (no `/_next/image`).
  - No new public Convex function. `_e2e:uploadUrl` is an `internalMutation`.
  - Every `<img>` for a stored file on the public form comes from
    `StoredImage`.
