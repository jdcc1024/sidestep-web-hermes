# Issue: Public order form redesign: one control height, name/number row, pick-your-name list, design picture

## Phase: 3

## Type: feature

## Size: M (~12 files, ~$4)

## Description

Initiative 0004. UX: `docs/ux/0004-public-form.md` (§4 layout, §5 copy, §6
Done when; JCC approved looks + copy at the mini gate, 2026-10-09). Design:
`docs/architecture/0004-public-form.md`.

**Server: `getPublic` returns each design's main picture.** Each entry in
`designs` gains `mainImage: { url, contentType } | null`. Build it with a new
helper `publicMainImagesByDesign(ctx, designIds)` in `convex/_designAssets.ts`,
next to `assetSummariesByDesign`. It uses the same `listDesignAssets` +
`resolveMainAsset`, then a pure `toPublicImage` in `lib/designAsset.ts`, which
returns `null` unless:
- the main file is web-safe (`isWebSafeImage`; a flagged PDF/AI/PSD gives
  `null`, so its URL never leaves the server),
- its URL resolved,
- its `_storage` size (`ctx.db.system.get("_storage", id)`) is
  ≤ `PUBLIC_IMAGE_MAX_BYTES` (2 MB).

Never send `filename`, the storage id, a file count or any other file.

**Client: the layout from the UX spec.**
- Page shell `app/run/[id]/page.tsx`: on a phone the outer card frame goes
  (§4.1).
- One 40px height (§4.2): inputs and Submit are `h-10`. Sizes sit in
  `grid grid-cols-3 gap-1.5 sm:grid-cols-4`, with `SizeCounter` given
  `className="h-10 w-full min-w-0"`. Only the public form passes it; the
  shared component doesn't change.
- Type-your-own-name card (§4.3):
  - Name + Number on one row at every width (`grid-cols-[minmax(0,1fr)_6rem]`),
    with one helper line under both.
  - With 2+ designs, a `radiogroup` of design tiles replaces the `Select`. This
    fixes the raw-id bug and the 379px scroll.
  - The card goes `p-3 sm:p-5`.
- Pick-your-name (§4.4): one 48px `<button aria-expanded>` row per player, as
  number / name / chosen-size chips. One row open at a time, none open by
  default.
- Design picture (§4.5), using `DesignThumbnail`:
  - One design: a big `zoomable` picture under the intro.
  - 2+ designs: a tile per design at the top, plus a 40px thumbnail on each
    design choice and section header.
  - No drawable picture: no picture block. A single-design form shows the
    no-picture line instead.

Copy (JCC-approved, verbatim):
1. `Leave either one blank and we won't print it.` (replaces both "Leave blank…" helpers)
2. `Find your name and tap it to pick sizes.` (pick-your-name, top of each design section)
3. `Tap a size once for each jersey you want.` (pick-your-name size hint; open mode keeps its current line)
4. `Tap to enlarge` (single-design picture caption)
5. `Design: <design title>` (single design, no picture)

## Done when
1. A player opening a single-design form whose design has a PNG/JPEG main picture sees that picture above "Your name", and tapping it opens it full size.
2. A player opening a single-design form whose design has no picture, or only a PDF, sees no picture block and sees "Design: <title>" under the intro.
3. A player on a two-design form sees one picture tile per design at the top, picks "Away Kit" from the Design choices in Jersey 1, and the choice shows the design's title (not an id).
4. In Jersey 1, "Name on jersey" and "Number" sit on the same row (same top edge) at 375 and 1280, and all size buttons in the card are the same width.
5. A player on a pick-your-name form taps "Sidestep" (#72), adds S, M, M, XL, then taps "Avery Quinn"; Sidestep's row closes and shows `S×1 M×2 XL×1`, Avery's opens, the header says 4 jerseys, and Submit sends those 4.
6. On a pick-your-name form with numbers 7, 12 and 72, the numbers' right edges line up, and a 29-character name shows on one line, truncated.

## Logic
- `orderForms.getPublic`: a design whose main is a PNG returns `mainImage` with exactly `url` and `contentType` (no `filename`, no other file's URL); a design with no files, only a PDF, or a flagged-PDF main beside a PNG returns `mainImage: null`; a PNG main over 2 MB returns `mainImage: null`.
- `toPublicImage` (lib/designAsset): a web-safe type at exactly the cap passes; cap + 1 byte, a null url, or a PDF returns `null`.

## Dependencies
- Blocked by: the 0004 size-chips build (card t_d3bf027c, branch `feat/0004-size-chips`). Done when 5 needs `S×1` and "jerseys", and both touch `SizeCounter` users. Branch from it, not from `main`.

## Notes
- Files likely touched: `convex/orderForms.ts`, `convex/_designAssets.ts`,
  `lib/designAsset.ts` (+ `lib/designAsset.test.ts`), a getPublic test in
  `convex/orderForms.test.ts`, `components/run/PublicOrderForm.tsx`,
  `components/design/DesignThumbnail.tsx`, `app/run/[id]/page.tsx`, new pure
  helpers in `lib/orderEntry/` if needed, `e2e/public-form.0004.spec.ts`,
  `convex/_e2e.ts` + `e2e/support/convex.ts` (seed helpers),
  `components/run/PublicOrderForm.test.tsx` (frozen: fix only what breaks;
  `combobox` becomes `radio`, and pick-mode tests open the row first).
- `DesignThumbnail`:
  - Widen its `mainImage` prop to `{ url: string | null; contentType: string } | null`.
    It never reads `filename`, so existing callers still type-check.
  - Add `fit?: "cover" | "contain"` (default `cover`). The big picture and
    tiles use `contain`, because a jersey mustn't be cropped.
  - The single-design picture is above the fold, so don't lazy-load it.
- E2E seeding (SDET): `_e2e:seedOrder` makes one design with no files. A
  mutation can't write storage, so attaching a picture needs an internal
  action that `ctx.storage.store`s a tiny generated PNG or PDF and inserts the
  `designAssets` row through an internal mutation. Tests also need a second
  design and `namesMode: "fixed"` with players (`seedItems` already seeds
  players). `_e2e:cleanup` already deletes asset blobs.
- Review checks (read the diff):
  - `getPublic` takes no new args and no identity or privilege argument.
  - No URL is built for anything except the resolved main.
  - The existing picker-privacy tests (`convex/orderForms.test.ts:696+`)
    still pass unchanged.
  - Validation and `submitOrder` don't change.
  - The captain's player sheet still renders `SizeCounter` at 44px.
  - New derived logic (e.g. a roster row's chips or accessible name) lives in
    `lib/`, not in the 1,027-line component (R-09 direction).
- Pictures over 2 MB show the no-picture state until
  `R3-02-design-picture-web-preview.md` ships a ~80 KB web copy. The dev
  design "Never OK Design" (10.6 MB main) is one. For review screenshots of
  Done when 1, use "Alpacallama Demo Design" (0.5 MB PNG main). The Snap Demo
  fixture kits have no files.
