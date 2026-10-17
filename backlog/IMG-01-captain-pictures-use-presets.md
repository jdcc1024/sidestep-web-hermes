# Issue: Captain and admin pages show stored pictures through StoredImage presets, never the print file

## Phase: 3

## Type: improvement

## Size: M (~11 files, ~$3 Claude)

## Description

Design: `docs/architecture/0007-image-egress.md` (answers A, B, D). It
extends R3-02's module (`lib/images.ts`, `components/image/StoredImage.tsx`).

Every captain and admin surface still renders the **original** file
(`preset="original"` by default, or a raw `<img src={asset.url}>`). The test
account's dashboard downloads 11.1 MB per view for two 56 px chips, and every
Playwright run opens it with an empty cache. That is what used up the Convex
team's 1 GB/month file egress. This issue moves every stored picture onto a
resized preset, so a page never downloads a print file just to display it.
Download links (`href={asset.url}`) keep the original. That's the point of a
download.

### Build steps

1. **Presets** in `lib/images.ts`. Add these (`sizes` matches each box's real
   CSS width, `optimize: true`):
   - `captainChip` for the 40–56 px squares: `"56px"`
   - `designCard` for the designs-list card band (`aspect-[4/3] w-full`, a
     2-column grid from `sm`): `"(min-width: 640px) 50vw, 100vw"`
   - `poolTile` for asset-pool, gallery-block and gallery-editor tiles
     (2 / 3 / 4 columns): `"(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"`
   - Reuse `lightbox` for every full-size view.
2. **Summary thumbnails.** Pass a preset to `<DesignThumbnail>` at
   `app/portal/page.tsx:231` (`captainChip`), `app/portal/designs/page.tsx:86`
   (`designCard`), `components/orderList/OrderList.tsx:180` (`captainChip`)
   and `components/portal/order/OrderDetailsSection.tsx:121` (`captainChip`;
   its lightbox then becomes `lightbox` through the existing
   `DesignThumbnail` rule).
3. **Design tab.** Replace the three raw `<img>` with `<StoredImage>` and
   remove their "doesn't apply" comments:
   `components/design/DesignAssetPool.tsx:252`,
   `components/design/DesignBlocks.tsx:143`,
   `components/design/GalleryEditor.tsx:140`, all with `poolTile`. The
   `ImageLightbox` at `DesignBlocks.tsx:133` gets `preset="lightbox"` and the
   asset's `contentType`.
4. **Keep the originals reachable.** The download/open links at
   `DesignBlocks.tsx:170` and `DesignAssetPool.tsx:174` stay on `asset.url`.

Out of scope: GIF/SVG (can't be resized; they keep the original through
`shouldOptimize`), a stored derivative (IMG-03), any Convex change.

## Done when
1. A captain opening their portal dashboard and then a design with a 10 MB PNG picture sees every picture, and the browser downloads under 1 MB of images, none of it straight from Convex storage.
2. On that design's page, tapping a gallery picture opens it full size (≤ 2048w) and the file's download link still gives the original.

## Logic
- `shouldOptimize`: `captainChip`, `designCard` and `poolTile` with PNG/JPEG/WebP are true; with GIF or SVG they are false.

## Dependencies
- Blocked by: R3-02-design-picture-web-preview.md (built, landing on main)

## Notes
- Files likely touched: `lib/images.ts`, `app/portal/page.tsx`,
  `app/portal/designs/page.tsx`, `components/orderList/OrderList.tsx`,
  `components/portal/order/OrderDetailsSection.tsx`,
  `components/design/DesignAssetPool.tsx`, `components/design/DesignBlocks.tsx`,
  `components/design/GalleryEditor.tsx`, plus the E2E spec.
- E2E fixture: use `attachBigPng` (after IMG-02, the reused fixture) on a
  seeded design. Measure the way `e2e/image-previews.0004.spec.ts:92-121`
  does: sum `response.body()` over `image` responses, and assert that no URL
  matches `/api/storage/` without `/_next/image`.
- This **reverses** an R3-02 review check ("order page thumbnail's `src` is
  still the plain storage URL"). Update that note; don't treat it as a
  regression.
- Review checks:
  - `grep -rn "<img" components app --include=*.tsx` shows no stored-file
    `<img>` outside `StoredImage.tsx` (the marketing `OptionPanel` is static,
    and fine).
  - No `href` to a file was switched to `/_next/image`.
  - No Convex file changed.
