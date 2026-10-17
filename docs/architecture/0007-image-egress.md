# 0007 Convex file egress: what burned 1 GB, and how stored pictures should be served

Process card `t_457cae59` (2026-10-17). Investigation and design only. Builds on
`docs/architecture/0004-image-previews.md` (R3-02) and does not replace it.

## Answers (A–D)

**A. What burned the GB.** Our own E2E runs. Every Playwright run opens the
captain dashboard `/portal` in a browser context with an empty cache, as the
one test account. That account owns the real demo designs. The dashboard's
56 px design chip renders the **original print file**, and for "Never OK
Design" that file is a 10.6 MB PNG. So each run downloads ~11.1 MB just to
draw two little squares, and runs pull it 1–3 more times in specs that visit
`/portal`. 184 agent Playwright runs between Oct 3 and Oct 17 add up to
**2.0 GB at the least and 6.7 GB at the most**, which is 2–7× the quota.
R3-02's work (the big-PNG fixture, probes, a timing script) adds about
**0.3 GB**. The design tab (JCC's guess) has the same flaw, serving 23 MB of
originals per first view, but no automated run ever opens it. In a normal
browser it is cached for 30 days, so it is not what burned this month.
Nothing reads files inside functions, and nothing exported a backup.

**B. Store small versions?** **Yes, but as step 3, not the unblock.** First
put every captain and admin picture through R3-02's `StoredImage` presets
(IMG-01). That alone stops every page from downloading print files. Then
store one web preview per upload (≤ 2048 px WebP, ~100–300 KB), made once by
an internal Convex Node action with `sharp`, and point the optimizer at it
instead of the original (IMG-03). The reason it's still worth doing: the
optimizer re-fetches the **whole original** from Convex for every
(picture, width) cache miss, so the cost per picture is "widths × original
size" per cache lifetime. A stored preview turns that into "widths ×
200 KB". R3-02 lands as it is. IMG-03 only changes which URL the Convex
reads hand to `StoredImage`.

**C. Should E2E stop hitting the shared dev deployment's storage?** Yes. The
fix is in the tests, not a second deployment. Free-plan limits are
**team-wide**, so a second cloud deployment shares the same 1 GB. A local
backend (`npx convex dev --local`) would isolate it, but costs an M
(loopback/http breaks `convexImagePattern` and the optimizer's private-IP
block, and Clerk env has to be set on the local backend). For now E2E reuses
one stored fixture across runs and fails any test whose browser downloads
more than 1 MB straight from Convex storage (IMG-02). Revisit local backend
if function-call or DB-I/O quotas start to bite too.

**D. Smallest unblock.** **No code change re-enables the deployment.** That
takes JCC: upgrade to Starter, wait for the period to reset, or ask Convex
support (see `needs_decision`). Once it's back:
1. Day 0, no code: on "Never OK Design", set `colors_1.png` (0.8 MB) as
   Main. The dashboard's per-run cost drops from 11.1 MB to 1.3 MB. Agents
   stop running ad-hoc optimizer probes against cloud storage.
2. IMG-01 + IMG-02 (S + M, ~$4.5 of Claude together). With these a warm E2E
   run downloads about 0 MB from Convex storage.

```
                         BEFORE (today)                         AFTER IMG-01 + IMG-02
 Playwright run ─► /portal (fresh context, no cache)      /portal
                     └─ <img src=convex/…/storage/…>        └─ <img src=/_next/image?url=…&w=64>
                          10.6 MB + 0.5 MB  ◄── Convex          └─ Next disk cache (30 d)  ◄── Convex once per (pic,width)
                          every run, every project                  per checkout, then 0
 image-previews spec ─► new 3.2 MB PNG per run              one fixture PNG reused (sha256) ─► warm cache, ~0
```

## Evidence

### What's in storage, and who sees it

```
$ npx convex data _storage                      # dev:elegant-pelican-88
contentType  size
image/png    11635937   front_view_v1.png   (Never OK Design)
image/png      811731   colors_1.png        (Never OK Design)
image/png    10648830   back_view_v1.png    (Never OK Design)
image/jpeg    1382143   llama-head_logo.jpg (Alpacallama Demo Design)
image/png      482591   template.png        (Alpacallama Demo Design)
                        total 24,961,232 B = 25 MB stored (2.5% of the 1 GB storage quota)
```

- `npx convex data designAssets`: all 5 rows have `isMain: false`, so
  `resolveMainAsset` (`lib/designAsset.ts:103-115`) picks the oldest web-safe
  file. For Never OK that is `back_view_v1.png` (createdAt …095), 10,648,830 B.
  For Alpacallama it is `template.png` (…579), 482,591 B. **11,131,421 B
  per dashboard view.**
- `npx convex data users`: **1 user**, admin, owner of all 4 designs. It is
  the E2E account (`SNAP_UID`, `e2e/support/global-setup.ts:11`), so every
  E2E session sees the real demo designs.
- The dashboard chip: `app/portal/page.tsx:231` renders `<DesignThumbnail>`
  with no `preset`. The default is `original` (`DesignThumbnail.tsx:31`), and
  `original` means the plain storage URL (`StoredImage.tsx:26-35`,
  `lib/images.ts:17`). The other captain thumbnails do the same:
  `app/portal/designs/page.tsx:86`, `components/orderList/OrderList.tsx:180`,
  `components/portal/order/OrderDetailsSection.tsx:121`.

### Why it re-downloads every run

- Convex serves storage with `Cache-Control: private, max-age=2592000`
  (measured in `0004-image-previews.md:46`, and the same 30 days as
  `MAX_CACHE_AGE` in convex-backend `storage.rs`). A persistent browser
  downloads each file once per 30 days.
- Playwright contexts start with **no HTTP cache**:
  - `global-setup.ts:22` `browser.newContext()`, then `:31` `goto('/portal')`
    and `:33` `waitForLoadState("networkidle")`. That's once per invocation,
    targeted runs included. Signing in on every run is still main's
    behaviour: the session-reuse work is on the unmerged branch
    `test/e2e-reuse-clerk-session` (`6ae5541`).
  - `e2e/portal.smoke.spec.ts:9` visits `/portal`. So does
    `e2e/retire-flat-fields.r203.spec.ts:111,157`, twice. Both run under the
    2 projects (`playwright.config.ts`, desktop + mobile).
  - `loading="lazy"` doesn't help. The designs section sits well inside
    Chrome's lazy-load distance on a 1280×720 page, and `networkidle` waits
    for it to finish.

### How often it ran

Agent transcripts (`~/.hermes/profiles/*/state.db`), counting terminal calls
that actually ran `npm run e2e` / `playwright test` (mentions inside grep or
echo excluded, `--list` excluded):

```
184 invocations, 2026-10-03 → 2026-10-17   (64 full suite, 120 targeted)
by day: 10-03 12 · 10-04 15 · 10-05 20 · 10-06 5 · 10-07 37 · 10-08 10 · 10-09 50 · 10-10 26 · 10-12 8 · 10-17 1
by profile: ss-sdet 113 · ss-dev 77 (+8 R3-02 probe/timing scripts) · ss-pm 1
```

### Ranking (arithmetic)

| # | Lead | Verdict | GB this month |
|---|---|---|---|
| 1 | **Captain dashboard renders print originals; E2E opens it with no cache** (not on the PM's list, closest to lead 1) | **Confirmed, main cause** | global-setup only: 184 × 11.13 MB = **2.05 GB**. Plus spec visits: 417 more loads × 11.13 MB = 4.64 GB. **Range 2.0–6.7 GB**: the upper bound assumes every load finishes before the test navigates away, and the lower assumes only global-setup's `networkidle` load does |
| 2 | Lead 3: E2E big-PNG fixture + R3-02 probes | Confirmed, second | `image-previews` runs: ~25 × (3.24 MB order-page original + 3.24 MB optimizer source) ≈ 0.17 GB. `r302-probe` ×9 ≈ 2 source fetches × 3.24 MB ≈ 0.06 GB. `r302-timing` ×1: 3 × 3.24 + 3 × 21.6 + 3.24 + 21.6 ≈ 0.10 GB. **≈ 0.3 GB**. Uploads are ingress and not billed as egress. Only 1 spec uses `attachBigPng` (`grep attachBigPng e2e` shows only `image-previews.0004.spec.ts:45`), not 72; the rest use the 1×1 PNG (`attachFile`) |
| 3 | Lead 2: optimizer fetches the full original per (url, width) miss | Confirmed mechanism, small today | `.next/dev/cache/images` holds **27** Convex-sourced variants (2026-10-09: 12, 10-12: 15) and `.next/cache/images` holds **5**. Each one is a full-source fetch, already counted in row 2. The 70 extra 96 B variants are the 1×1 fixtures, ≈ 0. This mechanism is why IMG-03 matters later |
| 4 | Lead 1: design tab serves originals (`DesignAssetPool.tsx:252`, `DesignBlocks.tsx:143`, `GalleryEditor.tsx:140`, plus the lightbox at `DesignBlocks.tsx:133` with no preset) | Confirmed flaw, **ruled out as this month's cause** | No E2E spec opens `/portal/designs/<id>` or `/admin/designs/<id>` (`grep goto( e2e`), and no agent browser session did either (0 matches in transcripts). For JCC it's 23.1 MB per first view of Never OK, cached for 30 days. **Likely < 0.2 GB** unless he browses in incognito or with "disable cache" on. It becomes the main cost once real customers arrive (each new device = full originals) |
| 5 | Lead 4: backups / functions reading files | **Ruled out** | No `ctx.storage.get` in `convex/` (grep: only `getUrl`, `store`, `delete`, `generateUploadUrl`). No `npx convex export` in any transcript. Cloud backups can't be checked from the CLI: JCC can confirm none are scheduled |

What I could not measure: the dashboard's own per-day file-bandwidth split
(`servingEgress` vs `userFunctionEgress`). The CLI doesn't expose it.
`npx convex insights` says "healthy". `npx convex run --inline-query …`
returns "You have exceeded the free plan limits…". The ranking predicts the
dashboard's daily bars track the E2E-day histogram above (peaks 10-07,
10-09, 10-10) and are almost all `servingEgress`. JCC can check that in one
glance (Usage → File Bandwidth, by day). The same page also shows which
metric tripped. If it's Database I/O rather than egress, this doc is still
right about egress but isn't the whole answer.

## B in detail: where should small versions come from?

| | **1. Optimizer from the original** (R3-02 today, extended by IMG-01) | **2. Stored preview, Convex Node action + sharp** (IMG-03, picked as step 3) | 3. Stored preview, resized in the browser before upload | 4. Stored preview, Next route handler + sharp |
|---|---|---|---|---|
| Convex egress per picture | widths used × original, per cache lifetime (30 d) per server cache | **1 × original once** (the action reads it), then widths × ~200 KB | 0 extra (the browser has the bytes) | 1 × original once |
| Storage | 0 extra | +1 file per upload, ~1–3% of the original | same as 2 | same as 2 |
| New runtime risk | none | `sharp` in Convex's Node runtime (`convex.json` `node.externalPackages`). Documented, unproven here, so spike first | iOS canvas area cap (~16.7 MP) vs our 16 MP print PNGs, and Safari's WebP encoding support. Old files can't be backfilled without someone re-uploading them | none (sharp already runs in our Next) |
| Security | n/a | all-internal: scheduled from the upload mutation, writes via `internalMutation`. No new public surface | the client decides what "the preview" is. Low risk (an owner can upload anything anyway) but it's a second upload per file | needs a **public** "attach preview" mutation that takes a storage id from our server. A captain who learned someone else's storage id could attach it and get its URL back. Needs pending-upload bookkeeping |
| Backfill | none | one internal action over assets with no preview | impossible server-side | a script |
| Works on Vercel / serverless | the cache is per instance/region, so misses multiply | yes | yes | yes |

**Picked 2.** It's the only option with no new public function and a
backfill path, and its one risk gets a stop-and-report spike. 1 is kept: the
optimizer stays, but it reads the preview, so `srcset` still works.
3 is rejected because of the iOS limits on exactly the files we care about,
and because there's no backfill. 4 is rejected because of the public
attach-mutation. It's the fallback if `sharp` won't load in Convex.

Storage vs egress, sized for real volume (say 100 print uploads/month at
~10 MB, 3 widths each):

```
option 1 only:  100 × 3 × 10 MB = 3.0 GB/month egress (cache-cold server: worse)
option 2:       100 × 1 × 10 MB = 1.0 GB once + 100 × 3 × 0.2 MB = 0.06 GB/month;  +20 MB storage
```

Effect on R3-02: none. Land it as built. Under IMG-03 the Convex reads return
`previewUrl ?? url` for display, `StoredImage` and the presets don't change,
and download links keep the original. As a bonus, the public form stops
carrying the original's URL in `url=`, which closes 0004 `needs_decision`
Q2 for free.

## C in detail: E2E and the dev deployment

| Option | Isolation from quota | Cost | Verdict |
|---|---|---|---|
| a. Frugal tests on the shared dev deployment (IMG-02) | warm runs ≈ 0 MB of storage egress | S | **Picked** |
| b. A second cloud dev deployment for E2E | **none**: limits are per team | S | Rejected: it doesn't solve the problem |
| c. Local backend (`npx convex dev --local`) | full (files, DB I/O, function calls) | M: `convexImagePattern` pins `https` and the optimizer refuses loopback upstreams unless `dangerouslyAllowLocalIP`. `CLERK_*` / JWT issuer env has to be set on the local backend. A fresh seed is needed per machine | Later, if other quotas bite |
| d. A dedicated E2E user that doesn't own the real demo designs | removes row 1 entirely | S, but it needs a second Clerk test account (`E2E_CAPTAIN_*` exists, optional) and `seedOrder` moves to it | Not needed after IMG-01; noted as an option |

## Moving files off Convex: what it would cost us technically

For the PM's provider question. No provider is picked here.

| Touch point | Today | What changes when files live elsewhere |
|---|---|---|
| Schema | `designAssets.storageId: v.id("_storage")` (`convex/schema.ts:42`), and the validator in `convex/_designAssets.ts:27`, `convex/_e2e.ts:285`, `convex/_schemaSmokeTest.ts:17` | becomes a provider object key (string) plus our own `size`. Migration: copy 5 dev blobs (and prod), rewrite ids |
| Upload | `designs.generateUploadUrl` (`convex/designs.ts:189`), then the client POSTs (`components/portal/DesignForm.tsx:196`, `components/design/DesignAssetPool.tsx:92`) and gets back `storageId` | presigned PUT from an **action** (provider secret in Convex env, which JCC sets). The server must remember which keys it issued, or a client can claim any key |
| Read URL | `ctx.storage.getUrl` in queries (`_designAssets.ts:64,123,149`); stable, no query string | signed GET URLs expire, which fights reactive query caching. A public bucket or custom domain avoids that but makes every file public by URL (same as today) |
| Size check | `ctx.db.system.get("_storage")` (`_designAssets.ts:147`) | stored on our row at upload |
| Delete | `ctx.storage.delete` in a mutation (`_designAssets.ts:236`, `_e2e.ts:230`) | network call, so it moves to a scheduled action |
| Optimizer allow-list | `convexImagePattern` (`lib/images.ts:70`, `next.config.ts:11`): one host, `/api/storage/**`, `search: ""` | the provider host. **Signed URLs carry a query string, and `search: ""` rejects them**: needs a public/custom domain, or the custom-loader seam (`loaderFile`) |
| E2E | `attachBigPng`, `attachFile`, `cleanup` | rewritten against the provider |

Sizes: **Convex Starter = S** (no code). **R2 via Convex's R2 component = L**
(~15–20 files, a data migration, new secrets, the signed-URL/optimizer
mismatch). **UploadThing = L** (its own upload callback route in Next, keys,
webhooks, plus everything above). **ImageKit as a delivery CDN in front of
Convex (files stay put) = M** (a custom `loaderFile`, origin = Convex
storage host; Convex egress happens only on ImageKit cache misses). Moving
the files is the expensive part, and it isn't needed to fix this month's
problem: rows 1–2 are self-inflicted and IMG-01/02 remove them.

## Issues

| id | title | blocked by | size |
|---|---|---|---|
| IMG-01 | Captain and admin pages show stored pictures through `StoredImage` presets, never the print file | R3-02 landed | M (~11 files, ~$3) |
| IMG-02 | E2E reuses one stored big-PNG fixture and fails a test that downloads > 1 MB straight from Convex storage | R3-02 landed | S (~5 files, ~$1.5) |
| IMG-03 | Each uploaded picture gets one stored web preview, and every picture is resized from it | IMG-01; JCC go-ahead | M (~12 files, ~$4) |

Order: land R3-02 unchanged, then IMG-01 and IMG-02 (independent of each
other), then IMG-03.

## Risks and what to test

- **IMG-01 reverses one R3-02 review check** ("captain pages: the order page
  thumbnail's `src` is still the plain storage URL"). That's intentional, and
  the SDET has to update it.
- **The `next dev` image cache** has to actually be reused across runs for
  IMG-01's "≈ 0 MB warm" claim. `.next/dev/cache/images` keeps entries
  across dev-server restarts (it still holds 2026-09-27 entries), which
  suggests yes. But a fresh checkout or worktree starts cold. IMG-02 checks
  `x-nextjs-cache: HIT` on a second request, so we measure it instead of
  assuming.
- **GIF/SVG** can't be optimized and stay originals on captain surfaces.
  An Illustrator SVG export can be large. Out of scope, noted in IMG-01.
- **IMG-03 sharp in Convex:** step 1 is a spike with stop-and-report. The
  fallback is option 4 with the pending-upload guard.
