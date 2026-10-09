# 0004 image previews: next/image over Convex storage (R3-02 redo)

Initiative 0004. Supersedes the "web preview" half of
`docs/architecture/0004-public-form.md` Q2 (option C, sharp in a Convex
action). The 2 MB cap from that doc stays as the rule for files the
optimizer can't resize (GIF, SVG).

Asked by JCC at Gate 2c (2026-10-09): use what Next.js gives us
(`<Image>`, responsive previews of a large image), and make it one module
that other image types and design-page changes can reuse.

## Decision

**Use `next/image`'s built-in optimizer on the Convex storage URL (option A).**
No Convex change, no schema field, no backfill, no new service.

- `next.config.ts` allows exactly one remote host: the Convex deployment from
  `NEXT_PUBLIC_CONVEX_URL`, path `/api/storage/**`, no query string.
- One component, `<StoredImage>`, renders every stored picture. It takes the
  picture (`{ url, contentType }`) and a **preset name**. One file,
  `lib/images.ts`, owns the presets (which widths the browser may ask for,
  per surface) and the "can this type be resized?" rule.
- `getPublic` stops dropping big PNG/JPEG/WebP files. They get resized on the
  way out instead. GIF and SVG keep the 2 MB cap.
- This slice moves only the public form's pictures. The captain's pages render
  through the same component in "original" mode, so their bytes don't change.

Why not the others, in one line each:
- **Convex derivative (old R3-02):** works on any host, but it's 8+ files, a
  native dependency in Convex's runtime that nobody has proven yet, a backfill,
  and it gives one fixed size, not a `srcset`.
- **Hybrid (derivative + `next/image`):** pays for both systems. Only worth it
  if one of the two triggers under "When to add the derivative" fires.
- **Image CDN via a custom loader (Cloudinary, imgix):** a paid service with an
  account, for a problem the framework solves for free. Not proposed.
- **Resize in a Convex HTTP action per request:** no cache in front of it, so
  every view re-encodes. Rejected.

## What Next.js gives us (Next 16.2.6, as installed)

| Feature | What it does for us |
|---|---|
| `srcset` + `sizes` | The browser picks the smallest width that fills the box at its pixel ratio. A 375px phone at 3× asks for 1200w for a full-width hero (1125 device px), 640w for a half-width tile, 128w for a 40px chip. |
| On-demand resize + format | `/_next/image?url=…&w=…&q=75` runs `sharp` (Next's own dependency, 0.34.5): `.rotate().resize(w, {withoutEnlargement}).webp({quality})`. AVIF is opt-in (`images.formats`). |
| `remotePatterns` | An allow-list of remote sources. Anything else gets a 400. Measured: a non-listed host returns 400. |
| Disk cache | `.next/cache/images`, keyed by url + width + quality + Accept. TTL = max(`minimumCacheTTL` 4 h, upstream `max-age`). Convex storage sends `Cache-Control: private, max-age=2592000` (measured), so a variant lives 30 days. |
| `getImageProps()` | Returns the `src`/`srcSet`/`sizes` that `<Image>` would put on its `<img>`. We spread them on our own `<img>`, so we don't need `fill` or known width/height, and the existing `object-contain`/`object-cover` boxes keep working as they are. |
| `unoptimized` | Same component, original URL, no optimizer. Used for GIF/SVG and for surfaces not moved yet. |
| Limits | `maximumResponseBody` 50 MB (source fetch), sharp `limitInputPixels` 268 MP, 7 s encode timeout, `qualities` allow-list `[75]` (`q=80` → 400, measured), SVG refused unless `dangerouslyAllowSVG`. |
| Custom `loader` / `loaderFile` | One config line to send every `<Image>` to a CDN or to stored derivatives later. This is our future seam. |

### Is the old code comment still true?

Five components say *"Convex storage serves short-lived signed URLs from a
per-deployment host, so next/image optimization doesn't apply."* It's out of
date:

- **"Short-lived signed URLs": false.** The URL shape is
  `https://<deployment>.convex.cloud/api/storage/<uuid>`, with no query string
  and no expiry (measured in `0004-public-form.md`, and again today: 200,
  `max-age=2592000`).
- **"Per-deployment host": true, but no longer a blocker.** Each Next build
  talks to exactly one Convex deployment, and `next.config.ts` can read
  `NEXT_PUBLIC_CONVEX_URL` when it loads. So the allow-list is built from the
  same variable the Convex client uses, and it's one exact host, not a
  `*.convex.cloud` wildcard. A wildcard would turn our server into a free
  resizer for anyone's Convex files.

The build replaces those five comments with one comment in `<StoredImage>`.

## Tradeoff table

| | **A. next/image optimizer (picked)** | B. Convex derivative (old R3-02) | C. Hybrid: derivative + next/image |
|---|---|---|---|
| Where the resize runs | Next server (`next start` / `next dev`), or Vercel's image service on Vercel | Convex Node action, once per upload | Both: Convex once, then Next per width |
| Sizes served | Every width the browser asks for (`srcset`), WebP (AVIF optional) | One: 1200px WebP | Every width, from a smaller source |
| Files to build | ~12, no schema change | ~10 + schema field + backfill + `convex.json` | A + B |
| New runtime risk | None new: optimizer already ships with Next (`sharp` in `node_modules`) | `sharp` must load in Convex's Node runtime (`externalPackages`). Unproven | B's risk |
| Old uploads | Work on day one | Need a backfill run per deployment | Need a backfill |
| Cold first view of a 10 MB file | Fetch 10.6 MB from Convex + encode. Encode measured 0.53 s at 1200w (est. 1–2 s total). Then cached 30 days per width | None at view time (~1 s once, at upload) | Small: source is ~100 KB |
| Warm view | ~0 ms (HIT, measured) | Direct from Convex | HIT |
| Cost self-hosted (this machine / Hostinger VPS) | $0. CPU ~0.5 s per new (design, width). Convex egress: one source fetch per cache miss (~4 widths × 10 MB per design per 30 days) | $0 + Convex storage for previews (KBs) | Both, tiny |
| Cost on Vercel | Pro plan needed anyway (Hobby is non-commercial). $0.05 per 1K transformations after included usage. We'd make < 1K/month → < $0.05 | $0 (images served straight from Convex) | Same as A |
| Source limits | Self-host: 50 MB, 268 MP. **Vercel: 8192 px per side**, JPEG/PNG/WebP/AVIF only | Whatever fits in a Convex action's memory (64 MB+) | Derivative is small, so none |
| Over Tailscale Funnel | Phone gets ~80 KB through JCC's home uplink instead of 10 MB. The optimizer fetches from Convex cloud (public IP, so `dangerouslyAllowLocalIP` stays off) | Phone fetches straight from Convex | As A |
| Who can download the original | Anyone with the form link (the storage URL is in `url=`). Already true for ≤ 2 MB pictures since R3-01 | Only the preview is public | Only the preview is public |
| Other image types later | Add a preset, pass its name | New derivative per size, per type | Add a preset |

What decided it: A is the smallest change that meets the "done when", it
works on dev, on `next start` behind Funnel, on Vercel and on a VPS, and it is
the feature JCC asked about. B's real advantages (original never public,
no 8192 px limit, no cold encode) are reasons to add a derivative later, not
reasons to build it first.

### When to add the derivative (R3-03, not filed)

Add a stored derivative and point `<StoredImage>` at it (hybrid C) only if
one of these happens:
1. Hosting goes to Vercel **and** main pictures are over 8192 px on a side
   (a 300-DPI full-jersey export can be). On Vercel those come back as errors,
   and the form shows the placeholder.
2. JCC decides players must not be able to download the original main picture
   (see `needs_decision` Q2).

Either way only `lib/images.ts` and the Convex read change. No caller does.

## The module

```
 WHO ASKS                     WHO DECIDES                          WHERE BYTES COME FROM
 ────────                     ───────────                          ─────────────────────
 Convex getPublic ──────────► lib/designAsset.ts toPublicImage      _storage.size (indexed read)
   (server)                   "may this file be shown at all?"
                              web-safe? source ≤ cap for its type?
                                     │ { url, contentType } | null
                                     ▼
 PublicOrderForm ───────────► DesignThumbnail / ImageLightbox
   preset="publicHero"          (design-level: alt text,
   | "publicTile"               placeholder, tap to enlarge)
   | "designChip"                    │ image + preset
                                     ▼
                              components/image/StoredImage.tsx     the only <img> for stored files
                                     │ asks lib/images.ts:
                              lib/images.ts                        ◄── next.config.ts reads the
                                IMAGE_PRESETS[preset] → sizes          same file: allow-list,
                                canOptimize(contentType)               deviceSizes, source cap
                                     │ getImageProps({src, sizes, fill, unoptimized})
                                     ▼
 browser ─ picks a width from srcset ─► /_next/image?url=…&w=828&q=75
                                     │
                              Next optimizer (sharp) ── disk cache .next/cache/images
                                     │ MISS only
                                     ▼
                              Convex storage https://<deployment>.convex.cloud/api/storage/<uuid>
```

Two decisions, two places:
- **Whether** a picture may be shown, and which URL: `toPublicImage` in
  `lib/designAsset.ts` (server-side, so a PDF's URL never leaves Convex).
- **How big** it's fetched: the preset in `lib/images.ts`. Callers name a
  preset. They never write `sizes` strings or widths.

### `lib/images.ts` (new, pure)

| Export | What |
|---|---|
| `IMAGE_PRESETS` | `{ original, publicHero, publicTile, designChip, lightbox }`, each `{ sizes: string; optimize: boolean }`. `original` has `optimize: false` and is the default, so a caller that names no preset gets today's bytes |
| `ImagePreset` | `keyof typeof IMAGE_PRESETS` |
| `canOptimize(contentType)` | `true` for PNG, JPEG, WebP. `false` for GIF (may be animated), SVG (vector; the optimizer refuses it) and anything else |
| `OPTIMIZABLE_SOURCE_MAX_BYTES` | 50 MB, the same number `next.config.ts` passes as `images.maximumResponseBody`, so the server never sends a URL the optimizer will refuse with 413 |
| `IMAGE_DEVICE_SIZES` | `[640, 750, 828, 1080, 1200, 1920, 2048]`. Next's default minus 3840: a 2048 WebP of a jersey is ~250 KB and plenty for a lightbox, and it caps the most expensive encode |
| `convexImagePattern(convexUrl)` | `URL` → `{ protocol: "https", hostname: <exact host>, pathname: "/api/storage/**", search: "" }`. Returns `null` for a missing or malformed URL |

Preset values (the box sizes come from `PublicOrderForm.tsx` and
`app/run/[id]/page.tsx`, container `max-w-2xl` = 672px):

| Preset | Box | `sizes` |
|---|---|---|
| `publicHero` | `h-48 w-full` (`sm:h-64`) | `(min-width: 672px) 672px, 100vw` |
| `publicTile` | 2 across, 3 from `sm` | `(min-width: 640px) 224px, 50vw` |
| `designChip` | `size-10` (40px) | `40px` |
| `lightbox` | up to `min(90vw, 64rem)` | `(min-width: 640px) 90vw, 100vw` |

"Tap to enlarge" opens the `lightbox` preset: as sharp as the screen can
show (1200w on a 375px phone at 3×, ~100 KB; 2048w max, ~250 KB), not the
10 MB print file. The print file is for the factory, not for a phone. If
JCC wants players to pinch-zoom into the print file, the lightbox passes
`preset="original"` instead (see `needs_decision` Q3).

### `components/image/StoredImage.tsx` (new)

```tsx
<StoredImage image={{ url, contentType }} alt="…" preset="publicHero"
             className="size-full object-contain" loading="eager" onError={…} />
```

- `optimize = IMAGE_PRESETS[preset].optimize && canOptimize(contentType)`.
- `getImageProps({ src: url, alt, fill: true, sizes, quality: 75,
  unoptimized: !optimize })`. It spreads only `src`, `srcSet`, `sizes` onto a
  plain `<img>` and drops `fill`'s absolute-position style, so the caller's
  box still sizes the picture. It's the one `eslint-disable no-img-element`
  for stored files.
- `DesignThumbnail` and `ImageLightbox` get an optional `preset` prop and
  render `<StoredImage>`. When no preset is passed they use `original`, which
  keeps today's DOM and bytes on the captain's pages.

### Config (`next.config.ts`)

Merge the stray `module.exports` (`allowedDevOrigins`) into `nextConfig`. It's
a latent bug: with both exports, only one wins. Then add
`images: { remotePatterns: [convexImagePattern(convexUrl)], deviceSizes: IMAGE_DEVICE_SIZES, maximumResponseBody: OPTIMIZABLE_SOURCE_MAX_BYTES }`.
If the variable is missing or malformed, `next.config.ts` throws with a
message that names it. Every page already needs that variable for the Convex
client, and the alternative is worse: in dev, `next/image` throws at render
for a host that isn't configured. `lib/images.ts` must use relative imports
only (no `@/`), because `next.config.ts` imports it.
`formats` stays `['image/webp']`. AVIF is ~33% smaller here but twice as slow
to encode cold (1.1 s vs 0.53 s at 1200w, measured), and WebP already fits
the budget.

Add `sharp` as a direct dependency (`^0.34.5`, already installed through
Next's `optionalDependencies`, Apache-2.0, free). Then an install with
`--omit=optional` on a host can't silently drop the optimizer.

## Data model and functions

| Change | Where | Auth |
|---|---|---|
| None to the schema | | |
| `toPublicImage(main, sizeBytes, url)`: PNG/JPEG/WebP pass up to `OPTIMIZABLE_SOURCE_MAX_BYTES`; GIF/SVG keep `PUBLIC_IMAGE_MAX_BYTES` (2 MB); the rest is unchanged (not web-safe → null, url null → null, size unknown → null) | `lib/designAsset.ts:73` | Pure |
| `getPublic`, `publicMainImagesByDesign` | unchanged code, new rule via `toPublicImage` | Public, args unchanged (`orderFormId`). Still sends `url` + `contentType` only, still only for the one main picture |

Security review:
- No new Convex function and no new argument.
- `/_next/image` is a public endpoint that does CPU work. It's bounded by the
  one-host allow-list (only our deployment's storage paths, no query strings),
  the `qualities` allow-list `[75]`, and the width allow-list
  (`deviceSizes` + `imageSizes`, 14 widths). The worst case is 14 encodes per
  stored file per 30 days, most of them small. Someone could still
  request widths for every file id they know. File ids are random v4 UUIDs
  that only reach a browser through a query that already decided to show
  that file.
- `dangerouslyAllowSVG` and `dangerouslyAllowLocalIP` stay `false`.
- What's newly public: the storage URL of a main picture over 2 MB (it rides
  in `url=`). See `needs_decision` Q2.

## Open questions for JCC (also in the card's `needs_decision`)

1. **Hosting cost.** Nothing to decide now: this costs $0 self-hosted and
   well under $1/month on Vercel Pro at our volume. It doesn't change which
   host to pick, so it's not asked. It's recorded so the hosting decision
   can see it, along with the 8192 px Vercel limit.
2. **Is a public print file OK?** A player who has the form link can copy
   the `url=` out of the image request and download the full print file.
   That's already true today for pictures ≤ 2 MB. Recommend **yes, accept
   it**: the same people get the picture anyway, and the link only reaches a
   team. If not, the hybrid (stored derivative, R3-03) is the fix, ~$3 more.
3. **Lightbox size.** Recommend **screen-sized (≤ 2048w, ~250 KB)** over the
   10 MB original. Players check their kit; they don't inspect print detail.

## Surfaces that move later (named, not built)

| Surface | File | What it takes |
|---|---|---|
| Order list design chip | `components/orderList/OrderList.tsx:183` | Pass `preset="designChip"` (box 40px). 1 line |
| Order detail thumbnail | `components/portal/order/OrderDetailsSection.tsx:124` | New preset `thumb56` (`56px`), pass it. 2 lines |
| Portal dashboard card | `app/portal/page.tsx:234` | `thumb56`. 1 line |
| Designs list card | `app/portal/designs/page.tsx:91` | New preset `card` (`(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw`). 2 lines |
| Gallery block + its lightbox | `components/design/DesignBlocks.tsx:143` | Swap `<img>` for `<StoredImage preset="galleryTile">`, pass `preset="lightbox"` to `ImageLightbox`. ~10 lines |
| Gallery editor tiles | `components/design/GalleryEditor.tsx:140` | `<StoredImage preset="galleryTile">`. ~5 lines |
| Asset pool tiles | `components/design/DesignAssetPool.tsx:252` | `<StoredImage preset="galleryTile">`. ~5 lines |
| Mockups, logos, new image kinds | wherever they appear | A preset entry plus a caller. Nothing new on the server unless a new "may this be shown?" rule is needed, and then it goes beside `toPublicImage` |
| Marketing carousel (`public/` files) | `components/marketing/JerseyCarousel.tsx` | Already `next/image` with local files. Leave it |

The captain-side moves fit one small follow-up issue (~$1.5) once R3-02
has run for a while. File it when JCC wants it.

## Risks and what to test

| Risk | Test / check |
|---|---|
| A PDF or a flagged non-image gets a URL | Logic: `toPublicImage` still returns null for a PDF at any size (existing tests stay) |
| A huge PNG is sent and the optimizer refuses it | Logic: PNG at `OPTIMIZABLE_SOURCE_MAX_BYTES` passes, +1 byte → null |
| A big GIF/SVG reaches a phone unresized | Logic: GIF over 2 MB → null |
| Allow-list too wide (wildcard, query strings) | Logic: `convexImagePattern` returns the exact host, `/api/storage/**`, `search: ""`; null for an empty or non-URL string |
| Phone still downloads the original | E2E: total image bytes on the player page < 300 KB with a > 2 MB PNG main |
| Captain pages change | Review check: screenshot the order page thumbnail and designs list before/after. Same look, `src` is still the storage URL |
| `NEXT_PUBLIC_CONVEX_URL` not visible to `next.config.ts` at load | Build step 1: `npm run build` and confirm `/_next/image?url=<storage url>` returns 200, not 400 |
| Cold first view is slow on a 10 MB source | Accepted (est. 1–2 s, once per width per 30 days). Re-check if real traffic complains |
| Self-host memory (glibc + sharp) | Next's self-hosting guide flags it. Note for the hosting card, not this one |
| E2E fixture > 2 MB | Can't go through `npx convex run` args (Linux caps one argv string at 128 KB). Test-only `_e2e:uploadUrl` (internalMutation → `ctx.storage.generateUploadUrl()`); the test builds a ~3 MB PNG in Node (`zlib.deflateSync(raw, { level: 0 })`, 1200×900 RGB), POSTs it there, then `_e2e:insertAsset` attaches it as main. Same path a real upload takes |
| An existing test asserts the old rule | `convex/orderForms.mainImage.test.ts:123` expects a PNG over 2 MB → `null`. The SDET card rewrites that case to the new rule (PNG over 2 MB → URL; GIF over 2 MB → null) |

Measured on this machine, 2026-10-09 (dev server `next dev -p 8080`, sharp 0.34.5):

```
next optimizer, source public/images/carousel/05-snoop-dodge.png (3.6 MB, 2000×2310 PNG)
  w=640  cold 0.46 s → 40 KB webp   warm 0.00 s (x-nextjs-cache: HIT)
  w=828  cold 0.36 s → 56 KB        w=1080 cold 0.45 s → 82 KB
  w=1200 cold 0.48 s → 96 KB        w=2048 cold 0.81 s → 250 KB
  q=80 → 400 (qualities allow-list)   non-listed remote host → 400
sharp, same settings as Next, on an 11.7 MB 3732×4406 PNG (the dev "Never OK" size)
  webp 1080 0.48 s 83 KB · 1200 0.53 s 96 KB · 2048 0.98 s 218 KB
  avif 1080 0.99 s 56 KB · 1200 1.11 s 64 KB · 2048 2.38 s 135 KB
Convex storage GET (0.48 MB file): 200 in 0.34 s, Cache-Control: private, max-age=2592000
getPublic on dev today: "Never OK Design" mainImage null (10.6 MB main, over the 2 MB cap)
```
