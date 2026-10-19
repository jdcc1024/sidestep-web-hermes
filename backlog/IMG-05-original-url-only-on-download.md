# Issue: The original's URL leaves Convex only when an owner or admin clicks Download

## Phase: 3

## Type: improvement

## Size: M (~12 files, ~$3.5 Claude)

## Description

Design: `docs/architecture/0004-image-previews.md` § "Original-file rule",
gaps G3 and G4, option A under "Bearer URLs". JCC's rule (Discord
#office-hours, 2026-10-19): "The original should only be accessible with a
download link. The download link is only accessible to the owners of the
design and the admin." Owner = the captain who created the order (whose
designs it links); no co-owners (register 0007, parked).

Today every asset read puts the original's storage URL (`url`) in the query
payload: `resolveDesignAssets` (design page, admin design, admin order) and
`assetSummariesByDesign` (dashboard, designs list, order page, none of which
has a Download link). Convex storage URLs are bearer URLs with no expiry, so
a URL in a payload is the file. Measured: `/portal` ships 2 original URLs
over the websocket with no Download link on the page.

### Build steps

1. **One gate.** `canAccessOriginal(ctx, designId, user)` in
   `convex/_designAssets.ts`: true when `user.isAdmin` or
   `design.ownerId === user._id`, false for a missing design. Every path
   that hands out an original URL goes through it and nothing else (0007
   widens this one function later).
2. **One way out.** New public query `designs.originalUrl({ assetId })`:
   `requireCurrentUser`, load the asset (missing → `null`),
   `canAccessOriginal` (false → `ConvexError("You don't have access to this
   file.")`), return `ctx.storage.getUrl(asset.storageId)`. No other
   argument; it never takes a user id or a storage id.
3. **Payloads stop carrying it.** Drop `url` from `ResolvedAsset`,
   `DesignMainImage` and the summaries. Where the UI needed `url` to tell
   "file is gone" (the "Unavailable" text), return `hasFile: boolean` from
   `ctx.db.system.get("_storage", asset.storageId)` instead.
4. **Download becomes a button that asks on click.** One small client
   component, e.g. `components/design/DownloadOriginal.tsx`: same look as
   today's link. On click it opens a blank tab synchronously (so popup
   blockers allow it), awaits `convex.query(api.designs.originalUrl, {
   assetId })` via `useConvex()`, then points the tab at the URL. If the
   query throws or returns null it closes the tab and shows the existing
   error toast. Use it in `components/design/DesignAssetPool.tsx:174`,
   `components/design/DesignBlocks.tsx:172` and
   `app/admin/orders/[id]/page.tsx:208`.

## Done when
1. A captain clicks Download on a file on their design page and the original opens in a new tab; until that click, no Convex response on the page contains the original's storage URL.
2. Staff open an order in admin, click Download on a linked design's file, and get the original.

## Logic
- `designs.originalUrl`: the design's owner and an admin get the original's URL; a different signed-in captain and a signed-out caller are refused; a deleted asset returns null.
- Asset reads (`designs.getMyDesign`, `designs.listMyDesigns`, `orders.getMyOrder`, `admin.getOrder`, `admin.getDesign`, `orderForms.getPublic`): the returned JSON never contains the original's storage URL, with or without a preview.

## Dependencies
- Blocked by: IMG-04-pictures-only-from-preview.md (same files; IMG-04 removes the display fallback this issue relies on).
- Needs JCC's OK on option A (the Download control becomes a button; see `needs_decision` on the 0004 audit card).

## Notes
- Files likely touched: `convex/_designAssets.ts`, `convex/designs.ts`,
  `convex/orders.ts`, `convex/admin.ts`, `lib/designAsset.ts`,
  `components/design/DownloadOriginal.tsx` (new), `DesignAssetPool.tsx`,
  `DesignBlocks.tsx`, `app/admin/orders/[id]/page.tsx`,
  `components/orderList/shared.ts`, and the Convex tests that assert
  `typeof asset.url === "string"` (`convex/designs.test.ts:436,526`,
  `convex/orders.test.ts:473`, `convex/admin.test.ts:1082`,
  `convex/imagePreviews.test.ts:268-294`), which SDET rewrites.
- E2E for Done when 1: tag the test `@original-download` (IMG-02's egress
  guard opt-out). Check payloads the way the audit did: collect websocket
  frames, match `/api/storage/<uuid>` against the file's id. The id comes
  from the tab the click opens.
- Review checks (read the diff):
  - `rg "storage.getUrl\(.*storageId\)" convex` → only `originalUrl` builds
    an original URL. Preview URLs are fine.
  - `originalUrl` validates `assetId` with `v.id("designAssets")` and takes
    nothing else.
  - The admin order page and admin design page still work for a design the
    admin doesn't own (the `isAdmin` branch).
- Still true after this, and accepted: once Download is clicked, the URL is
  a bearer URL that owner/admin could pass on. Streaming through an
  auth-checked Next route (option B) would hide it, at the cost of every
  print file going through our host. Not built.
