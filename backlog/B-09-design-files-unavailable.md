# Issue: Design files show "Unavailable" with actions that can't work

## Phase: 1

## Type: bug

## Description

JCC (admin, jcc@sidestep.design) opened his design pages on the dev app on
2026-10-21 and every file tile said "Unavailable" instead of "Download". Two
asks: an admin should see Download, and a file that really is unavailable
should not offer Favorite (set as main), Remove and Download.

### Root cause (proven, not inferred)

**JCC's browser ran a pre-IMG-05 client against the post-IMG-05 Convex
functions.** That client shows Download only when `asset.url` is set
(`006e3d5:components/design/DesignAssetPool.tsx:174`,
`006e3d5:components/design/DesignBlocks.tsx:172`), and IMG-05 (37cc4fa)
deliberately stopped sending `url`. So every tile fell into the "Unavailable"
branch. Nothing was missing and nothing was refused.

How the skew happened: the dev server on :8080 serves whatever branch the
shared checkout `~/sidestep-web-hermes` is on. The Convex dev deployment
(`elegant-pelican-88`) holds whatever branch last pushed functions.

```
Oct 20 23:41  IMG-05 build pushes functions to the dev deployment (no `url` in reads)
Oct 21 01:32  ss-dev leaves the checkout on chore/tailscale-dev-origin
              (006e3d5, cut from 613ec3d: before IMG-04/05, client still reads `url`)
Oct 21 08:17  JCC signs in, opens /portal/designs/j97depab… and …j97d65ys…
              (dev log ~/.hermes/profiles/ss-dev/cache/scratch/img05-dev.log L1242–1299)
Oct 21 08:32  land switches the checkout to main; next.config.ts changes, server restarts (L1301)
Oct 21 09:04  JCC reports "Unavailable" in #office-hours
```

Evidence (2026-10-24, dev deployment):

| Check | Result |
|---|---|
| `users` row for jcc@sidestep.design | `isAdmin: true` (the only user row) |
| Designs he opened | `j97depab4g5t6z9bcwcthk4k6s8f7na5` (Alpacallama), `j97d65ysv8syqe58zgt3aw0y258f6gkr` (Never OK) |
| Their 4 assets' `storageId` in `_storage` | all 4 present (j570…qxk template.png 483 KB, j57a…atn llama-head_logo.jpg 1.4 MB, j57b…htx back_view_v1.png 10.6 MB, j57a…psb front_view_v1.png 11.6 MB); all 4 previews present |
| `npx convex run --identity <jcc> designs:getMyDesign` / `admin:getDesign` | every asset `hasFile: true` |
| Today's client (main code, :8080), both designs, portal + admin | every tile "Download", 0 console errors |
| The 006e3d5 client (`git archive` copy on :8091), same deployment, same session | every tile "Unavailable", Remove and Set-as-main still shown, 0 console errors. Screenshot: `old-portal-designs-j97d65ys….png` (path in the card handoff) |

So the PM's hypothesis (blobs gone from storage) does not hold for JCC's
case.

### Can production lose an original while keeping its row? No.

The only production code that deletes an original is
`deleteDesignAsset` (`convex/_designAssets.ts:313-321`). It runs from
`designs.removeAsset`, deletes the blob and the row in the same mutation, and
a mutation is one transaction. `imagePreviewsDb.setPreview` deletes only the
new preview blob it was handed. `_e2e.cleanup` is internal, only touches
`E2E `-prefixed rows, deletes the row first, and keeps any blob another row
still points at (`by_storage`). No migration touches `designAssets`. So
`hasFile: false` happens only after an out-of-band delete (dashboard, a wiped
or imported deployment).

### What is still wrong, and what this issue fixes

1. **A missing file still offers actions that can't work.** When
   `hasFile` is false the pool tile hides Download, but still shows Set-as-main
   and Remove (`components/design/DesignAssetPool.tsx:175-215`). JCC asked for
   them to be hidden.
2. **Remove on a missing file fails.** `deleteDesignAsset` calls
   `ctx.storage.delete` on the gone original first. Under convex-test this
   throws `Delete on non-existent doc` and the row stays (probe run on
   2026-10-24). So the one action that could clean up a dead entry is broken.
3. **The label suggests a permission problem.** "Unavailable" reads as "not
   for you", and that is exactly how JCC read it.

## The fix

| Where | When `hasFile` is false |
|---|---|
| `DesignAssetPool` tile | Show the missing-file label instead of Download. Hide Set as main. **Keep Remove** (open point, below) |
| `DesignBlocks` gallery file card (non-picture) | Show the missing-file label instead of Download (the card has no other actions) |
| Admin order page file badges (`app/admin/orders/[id]/page.tsx:209`) | Already hides a missing file. No change |

Server side:

- `deleteDesignAsset`: delete each blob (original, preview) only if
  `ctx.db.system.get("_storage", id)` still finds it, then delete the row.
  Same order and same transaction as today.
- `designs.setMainAsset`: refuse a file whose original is gone (`ConvexError`,
  "That file is missing, so it can't be the main image."). It's
  defence in depth for the hidden button, and a missing original can't be the
  print file.

Label: **"File missing"** in both render sites (plain text, muted, as
today). It says what happened without implying access. The wording is JCC's
call (customer-facing), so the final word is pending.

## Done when
1. An admin opens a design whose files are all in storage. Every file tile shows Download, and clicking one opens the original in a new tab.
2. An admin opens a design with one file whose original is missing. That tile shows the missing-file label with no Download and no Set as main. Clicking Remove takes it off the page, and the other files keep their Download.
3. A captain opens a design whose gallery holds a non-picture file with its original missing. The gallery card shows the missing-file label and no Download.

## Logic
- `designs.removeAsset`: removes a file whose original is already gone (row and preview deleted, galleries stripped); a different captain is refused; the design's last file still can't be removed.
- `designs.setMainAsset`: sets a present file as main; a different captain is refused; a file whose original is gone is refused.

## Dependencies
- Blocked by: none

## Notes

- **Open point (JCC, via PM):** does Remove stay on a missing file? This issue
  keeps it (PM's recommendation) so a dead entry can be cleaned up. If JCC says
  hide it, drop Remove from the `!hasFile` tile and drop the first Logic line's
  happy path. Nothing else changes.
- Likely files: `components/design/DesignAssetPool.tsx`,
  `components/design/DesignBlocks.tsx`, `convex/_designAssets.ts`
  (`deleteDesignAsset`), `convex/designs.ts` (`setMainAsset`), new
  `convex/*.b09.test.ts`, new `e2e/*.b09.spec.ts`, and `convex/_e2e.ts` for a
  test-only helper.
- E2E fixture: Done-when 2 and 3 need a test-only internal function in
  `convex/_e2e.ts` that deletes an E2E asset's original blob and keeps its row
  (guarded like the others: `E2E ` design title, named account). Existing
  `attachFile(designId, "pdf", false)` gives the non-picture file for line 3,
  and a gallery block can be seeded the same way the block tests do.
- Done-when 3 runs as the captain only if `E2E_CAPTAIN_*` is configured.
  Otherwise SNAP_UID (admin and owner) is fine: the gallery card has no
  role-dependent controls.
- Review checks (read the diff, not tests):
  - No public function gains an argument. `hasFile` stays derived server-side
    from `_storage`, and no storage id or URL enters any read (IMG-05 holds).
  - `deleteDesignAsset` still deletes blob(s) and row in one mutation; the
    existence check only skips a blob that's already gone.
  - `resolveMainAsset` is untouched. A missing original that is already
    the main file stays main until someone picks another; the tile still shows
    the label. Changing that fallback is out of scope.
- Not in this issue (environment, filed as a follow-up card): the dev server
  JCC browses shares a checkout that agents switch branches in, so a feature
  branch's functions can meet another branch's client. Also, the Tailscale
  host from `chore/tailscale-dev-origin` (006e3d5, SDET PASS) never landed:
  dev JS over the Tailscale URL is 403 again on today's checkout.
