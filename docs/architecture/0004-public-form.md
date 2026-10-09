# 0004 Public order form: the design picture on `getPublic` (architecture)

Card: `[0004] Technical design: public form getPublic main picture + issue` (t_74bd981c).
UX spec: `docs/ux/0004-public-form.md` (§4.5 picture, §6 Done when, §7 notes).
Mini gate: `~/sidestep/docs/gates/0004-minigate-looks.md` (JCC approved looks + copy, 2026-10-09).
Issues: `backlog/R3-01-public-form-redesign.md` (M), `backlog/R3-02-design-picture-web-preview.md` (S/M).

## Decision

**`getPublic` adds one field per design, `mainImage: { url, contentType } | null`.
The server sends it only when the browser can draw it and it is no bigger than
2 MB. Otherwise it sends `null` and the form shows its no-picture state.** No
filename, storage id, file count or any other file from the design.

The 10.6 MB picture gets a web-size copy made at upload (R3-02, its own issue).
Until that ships, a design whose main picture is over the cap shows no picture
on the public form. Once R3-02 lands, `getPublic` sends the copy (~80 KB) and
the cap almost never applies.

```
designs[i] ──► listDesignAssets ──► resolveMainAsset ──► main asset
                                     (isMain, else oldest   │
                                      web-safe; unchanged)  ▼
                          toPublicImage(main, size, url)   (lib, pure)
                            web-safe type?   no ─► null
                            url present?     no ─► null
                            size ≤ 2 MB?     no ─► null      (R3-02: use preview first)
                                             yes ─► { url, contentType }
```

## Measured (dev deployment, 2026-10-09)

| What | Value |
|---|---|
| `_storage` rows | 5 files: 11.6 MB, 10.6 MB, 1.4 MB, 0.8 MB, 0.5 MB |
| Main pictures on dev designs | 10.6 MB PNG (3732×4406, alpha), 0.5 MB PNG |
| 10.6 MB PNG → 1200px WebP q80 | **82 KB** (130× smaller); JPEG 111 KB; PNG 844 KB |
| → 800px / 1600px WebP | 49 KB / 120 KB |
| Encode time, 1200px WebP (sharp, laptop) | ~1 s |
| Storage URL shape | `https://<deployment>/api/storage/<uuid>`, no query string, no expiry |
| `ctx.db.system.get("_storage", id)` in convex-test 0.0.53 | works, returns `size` (probed) |

## Q1: a public storage URL. Decided: send it, for one drawable file only

Options:

- **A. Storage URL in the query result (picked).** Same mechanism as every
  other surface (`orders.ts:146`, `admin.ts:97`).
- B. Proxy through a Convex HTTP action that checks the form is open. It hides
  the storage URL and can stop serving when the form closes. Rejected: a new
  HTTP route, CORS and caching to own, for a picture the player is *meant* to
  see. Once a picture is shown it can be saved anyway, so revoking the URL buys
  nothing.

Why it's safe enough:

- **Who can call it:** anyone with the form link (`getPublic` is
  unauthenticated, `convex/orderForms.ts:100`). Form ids aren't guessable.
- **What they get:** exactly one URL per design on the order, for the file
  `resolveMainAsset` already picks for the captain's pages. Never the design's
  other files, which can be print-ready originals.
- **Non-images get `null`, not a URL.** If the owner flagged a PDF/AI/PSD as
  main, the public form shows "Design: <title>" and sends no URL. A flagged
  print file is the one thing we must not publish, so the type check runs on
  the server, not just in `DesignThumbnail`.
- **No `filename`.** Names like `client_final_v3_DO_NOT_SEND.png` are internal.
  Alt text uses the title.
- **The URL doesn't expire.** Convex storage URLs are capability URLs that stay
  valid while the file exists. So a player keeps a working link after the form
  closes, and deleting the asset revokes it. That's acceptable for a picture
  the captain shared with the team. It's the reason for the "one drawable file"
  rule above.
- SVG is web-safe. Opened directly, it runs on the Convex storage origin, not
  ours, so it can't reach Clerk cookies. No change.

## Q2: weight. Decided: 2 MB cap now, web preview as R3-02

Options:

- A. Ship as-is. A player on cell data downloads 10.6 MB before seeing the
  form, and a 16-megapixel decode costs ~66 MB of phone memory per tile.
  Rejected.
- **B. Cap now, preview next (picked).** `getPublic` reads `size` from the
  `_storage` system table (one indexed read per design) and drops pictures over
  `PUBLIC_IMAGE_MAX_BYTES = 2 MB`. 2 MB is ~1–2 s on LTE, and it lets every
  small upload on dev through (0.5 / 0.8 / 1.4 MB). This is a few lines, and it
  stays as the safety net after R3-02.
- C. Web preview in this issue. Measured result is great (82 KB), but it needs
  `sharp` in a Node action (`"use node"`, `convex.json` `externalPackages`),
  a schema field, a hook on both upload paths (`designs.ts:230`, `:292`),
  delete cleanup and a backfill for files already uploaded. That's 6–8 files
  plus a native dependency in Convex's Node runtime, so R3-01 would pass M.
  Split out as **R3-02**, per the card's rule.
- D. Resize in the browser before upload (canvas). No server dependency, but
  it only fixes new uploads, needs a backfill anyway, and alpha PNG → WebP via
  canvas varies by browser. Rejected in favour of C.
- E. A third-party image CDN (Cloudinary, imgix) or Next's image optimizer on
  the host. Both are a service/hosting decision, and hosting isn't picked
  yet. Not proposed.

**Cost of B:** the dev design "Never OK Design" (10.6 MB main) shows no
picture on the public form until R3-02 ships. JCC's real artwork will often be
print-resolution exports, so R3-02 should land before or with Gate 2 (see
`needs_decision` in the card handoff).

## Data model and functions

| Change | Where | Auth |
|---|---|---|
| `getPublic` designs gain `mainImage: { url: string; contentType: string } \| null` | `convex/orderForms.ts:100` | Public, unchanged. Args unchanged (`orderFormId`). No identity or privilege argument. |
| `publicMainImagesByDesign(ctx, designIds)` → `Map<Id<"designs">, PublicDesignImage \| null>` | `convex/_designAssets.ts`, beside `assetSummariesByDesign` (:107) | Plain helper, not a Convex function. Only called by `getPublic`. |
| `PublicDesignImage` type, `PUBLIC_IMAGE_MAX_BYTES`, `toPublicImage(...)` (pure) | `lib/designAsset.ts` | n/a |
| `DesignThumbnail` accepts `{ url: string \| null; contentType: string } \| null` (it never read `filename`) and a `fit: "cover" \| "contain"` prop, default `cover` | `components/design/DesignThumbnail.tsx:20,54` | n/a |

Why a sibling helper, not `assetSummariesByDesign` as-is: that one resolves a
URL even for a flagged non-image, returns `filename` and `fileCount`, and
doesn't carry the storage id needed for the size read. Both helpers call the
same `listDesignAssets` + `resolveMainAsset`, so "which picture" still has
one answer.

No schema change in R3-01. R3-02 adds an optional `previewStorageId` to
`designAssets` (see that issue).

## Risks and what to test

| Risk | Test |
|---|---|
| A flagged PDF's URL leaks to the public | Logic: flagged PDF main → `mainImage: null`, and the payload contains no URL for it |
| Filename or other files leak | Logic: `mainImage` keys are exactly `url`, `contentType`. A second picture's URL doesn't appear |
| Big picture slips through | Logic: over-cap main → `null`. `toPublicImage` at exactly the cap passes, cap + 1 byte fails |
| Picture removed from storage between upload and read | `toPublicImage` with `url: null` → `null` |
| Existing picker privacy (`orderForms.test.ts:696`) | Unchanged: the roster still exposes `_id`, name, number only. Keep those tests green |
| `PublicOrderForm.tsx` is 1,027 lines and gains layout | Review check: new pure logic (e.g. "which designs have a picture", roster row label) goes to `lib/`, not the component (R-09 direction) |
