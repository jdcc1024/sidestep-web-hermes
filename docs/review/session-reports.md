# Session Reports

One entry per completed loop task. This is the human's fast path for UX critique: read "UX surfaces to eyeball", open those routes, judge. Reviewed in batches via `/review-batch`.

---

## 2026-07-19 — 1-05: Fix Mobile Responsive Shell
- What shipped: No code change. Verified the bug was already fixed as a side effect of the shadcn migration (S-05/S-12): `SidebarShell.tsx` (the file with the broken `md:` classes) is gone, replaced by `PortalShell.tsx`/`AdminShell.tsx`, which already use a Sheet-based hamburger at `lg:hidden` and fixed sidebar at `lg:flex` — exactly matching this issue's acceptance criteria (hamburger at both 375px and 768px, fixed sidebar at 1024px+).
- UX surfaces to eyeball: `/portal` and `/` at 375/768/1280, light+dark (screenshots in `docs/review/1-05/`). `/admin/orders` screenshot shows a 403 because the test session isn't an admin user — AdminShell code was reviewed directly instead (structurally identical Sheet/`lg:` pattern to PortalShell).
- Decisions I made that a human may want to veto: closed this as already-fixed rather than re-touching the shell components. If you want an admin-session screenshot too, rerun `node scripts/snap.mjs 1-05 /admin/orders` with an admin test account.
- Follow-ups filed: none

## 2026-07-19 — R-06: Lock & Freeze
- What shipped: Manual lock (captain or admin) + lazy auto-lock on deadline (no scheduler — `lib/jerseyRun/lock.ts:effectiveStatus`), a Σ-qty confirmed-count snapshot taken at lock time, unlock permissions (admin always; captain only pre-deadline), and freeze guards on `rosterEntries.create/update/remove`, `orderEntries.create`, and `orders.updateOrder` (design-link changes). `jerseyRuns.getByOrder`/`getPublic` now expose `effectiveStatus` for O-06 to consume.
- UX surfaces to eyeball: none — this is a pure Convex/backend task (new `lock`/`unlock` mutations + guards on existing mutations). No frontend UI was touched, so no screenshots were captured.
- Decisions I made that a human may want to veto:
  1. **`closed` vs `locked` precedence** (the PRD's own open question, §10): only a stored `status: "open"` run auto-locks lazily past its deadline. An admin unlocking a past-deadline run reverts it to `status: "closed"` rather than `"open"` — this is deliberate, so the unlock actually sticks instead of instantly re-locking on the next read (since `"open"` + past deadline = lazily locked again). The tradeoff: an admin-unlocked, past-deadline run stays editable indefinitely until someone manually re-locks it — it does not silently re-lock later. Documented in `lib/jerseyRun/lock.ts`.
  2. **"Design-link mutations" scope**: interpreted as `orders.updateOrder` (the mutation that actually changes `designIds`, per R-05's own note that removal is "via `orders.updateOrder`"). I did *not* gate `designs.updateDesign` (relabel/rename) on lock, since a design can be linked to multiple orders/runs and blocking a rename globally because one linked run is locked felt like a separate, unrequested product call — flagged rather than guessed.
  3. Admin remains subject to the freeze guards too (locked means read-only for everyone, including admin — admin's power is to unlock, not to bypass the freeze while locked). Not explicit in the PRD table but consistent with "everything goes read-only" (§2).
- Follow-ups filed: none — the `designs.updateDesign` relabel-while-linked-to-a-locked-run gap noted above is real but small; happy to file a node if a human wants it closed rather than left as noted behavior.

## 2026-07-19 — O-08: Relabel / Remove Design Warning
- What shipped:
  - `lib/designRemoval.ts` — pure diff + copy helpers (`pendingDesignRemovals`, `describeSubmitters` with a 3-name cap and "and N others" overflow, `jerseyCount`).
  - `components/portal/DesignRemoval.tsx` — the two UI surfaces over R-05's queries: `DesignRemovalWarning` (pre-save, in `OrderForm`, one per unchecked design; names who ordered it and the jerseys that would drop) and `RemovedDesigns` (post-save, on the order detail page; keeps each dropped design visible with a "Removed" badge, its submitters, and the uncounted total).
  - Wired into `components/portal/OrderForm.tsx` (edit mode only) and `app/portal/orders/[id]/page.tsx`. The submit path is untouched — the warning is never a gate.
- UX surfaces to eyeball: **no screenshots — `snap.mjs` cannot reach any authenticated route right now.** Every `/portal/*` capture times out at `page.goto` (public routes like `/` capture fine), so the saved Clerk session in `.auth/state.json` has gone stale. This is pre-existing and blocks the screenshot review surface for *all* portal work, not just this task. **Human action: re-run `node scripts/snap.mjs --login`**, then `node scripts/snap.mjs O-08 /portal/orders/<id> /portal/orders/<id>/edit`.
  - What to look for once that works: on `/portal/orders/<id>/edit`, uncheck a design that has submissions — an amber alert should appear inside the "Link designs" step naming the submitters, and "Save changes" must stay enabled. On `/portal/orders/<id>`, a "Removed designs" section should sit between the Designs section and Collect.
  - Note the dev deployment currently has **zero `orderEntries`**, so both surfaces render nothing until someone submits to a run. Seeding is needed to see them at all — I did not seed, since there's no delete path to clean up afterwards.
- Decisions I made that a human may want to veto:
  1. **Copy/format of the warning** — "Removing “Home kit” drops 4 jerseys from your count" + "Ana Ruiz (2) and Ben Chu (2) already picked it. Their entries stay saved…". Name-first with a per-person qty in parentheses, capped at 3 names. Taste call; easy to retune in `lib/designRemoval.ts`.
  2. **Removed indicator lives on the order detail page, not per-row on the responses page.** `/portal/orders/[id]/run/responses` still reads the legacy `jerseyRunResponses` model; per-row "removed" flags there would be written against a table **R-07** deletes. Deferred to R-07 as a rider rather than built twice.
  3. **Relabel got no UI at all** — entries key off `designId`, so a rename carries submissions over and renders under the new title automatically. R-05's convex relabel test already covers the data behaviour; adding a relabel warning would have been a warning about nothing.
  4. Warning is scoped to **edit mode with an existing run** — a new order, or an order that never started collecting, can't orphan anyone, so the run lookup is skipped entirely.
- Follow-ups filed: none as DAG nodes. Two things noted above need a human, not an agent: re-running `snap.mjs --login`, and deciding whether the stale-session breakage deserves its own tracked task.

## 2026-07-19 — 3-03: Admin Data Export

- What shipped:
  - `lib/orderExport.ts` — pure CSV builder (RFC 4180 escaping, spreadsheet
    formula neutralization, ISO dates, filename slug).
  - `convex/admin.ts` `exportOrder` — admin-only join over order / captain /
    designs / roster + order entries; excludes entries on removed designs so
    the file reconciles with `countsByRun`.
  - `components/admin/ExportOrderButton.tsx` — fetch-on-click, Blob download,
    wired into the admin order detail header.
- UX surfaces to eyeball: `/admin/orders/<id>` — the "Export CSV" button now
  sits right-aligned in the header next to the team name (header became a
  flex row on `sm:`). **No screenshots this time** — see below.
- Decisions I made that a human may want to veto:
  - **Convex query instead of the specced `/api/admin/export/[orderId]` route
    handler.** The spec gated on Clerk `privateMetadata.isAdmin`, but admin
    here is `users.isAdmin` in Convex and every other admin surface uses
    `requireAdmin`. A route handler would have been a second, divergent authz
    source. Rationale written up in the backlog file under "Deviations".
  - **Two new columns, Design and Quantity**, forced by the R-track model (an
    order spans designs; an order entry carries a qty). Silhouette specs are
    per-row now, not per-order, because O-01 moved them onto the design.
  - **Removed-design entries are excluded** from the export, matching R-05
    count semantics. Arguable — a supplier arguably wants everything ordered,
    but the production basis is the current design list.
  - **Values starting with `= + - @` get an apostrophe prefix** so a fan-
    supplied name can't execute as a formula when the supplier opens the file.
    Visible as a leading `'` in a raw text editor; spreadsheets strip it.
  - **UTF-8 BOM** prepended so Excel doesn't mangle accented names.
- Screenshots: **none — blocked, needs human setup.** `snap.mjs` renders
  `/admin/orders` as "403 — Access Denied": the saved Clerk session in
  `.auth/state.json` is not an admin account. Even with admin access the
  detail route needs a real order id. To get review screenshots of this
  surface, re-run `node scripts/snap.mjs --login` signed in as an admin.
  I deleted the captured 403 image rather than leave a misleading artifact.
- Follow-ups filed: none

## 2026-07-19 — 2-14: Intake form — inspiration links (no anonymous uploads)

- What shipped:
  - Optional "Link us to your inspiration" field on the public intake form
    (`/intake`, step 03): up to 5 rows, add/remove, `https://`-only, 500-char
    per-URL cap. No file uploads — per the human's 2026-07-19 decision that an
    open-write storage endpoint on a public form is an abuse surface we don't
    want to own.
  - Validation lives once in `lib/intake.ts`
    (`validateInspirationLinks` / `normalizeInspirationLinks` /
    `isKnownShareHost`) and is imported by both the zod form schema and the
    Convex `submitIntake` mutation, so client and server can't drift. Links are
    trimmed, blank rows dropped, deduped, order preserved.
  - `intakes.inspirationLinks` added to the schema as `v.optional(v.array(v.string()))`;
    a submission with no links writes no field at all, so existing rows and
    existing behaviour are untouched.
- UX surfaces to eyeball: `/intake` — step 03, below the brief. Screenshots in
  `docs/review/2-14/` (375/768/1280, light + dark). Look at: the field's
  explanatory copy ("We don't take file uploads here." — is that the tone you
  want, or too blunt?), the "Add another link" button styling next to the
  outline/ghost buttons elsewhere, and the soft hint text that appears under an
  unrecognized host.
- Decisions I made that a human may want to veto:
  - **Host recognition is a hint, not a gate.** An unlisted but well-formed
    `https` URL submits fine; the visitor just sees "Not a share host we
    recognize — that's fine, we'll still take a look." This follows the issue's
    "don't hard-block an unrecognised-but-valid https URL", but the wording is
    yours to change.
  - **`http://` is rejected, not upgraded.** Every real share host is https;
    accepting plain http buys nothing and mixed-content-warns if we ever render
    these.
  - **One error message per list**, shown under the whole field rather than
    per-row. Simpler than per-index zod issues and the caps are low enough that
    "which row" is obvious.
  - **The admin-rendering acceptance criterion was carried forward to 2-13,
    not built here.** `/admin/leads` doesn't exist yet (2-13 is still blocked on
    2-11), so there is nowhere to render them. I added an explicit criterion to
    `backlog/2-13-admin-customer-management.md` instead of inventing an admin
    surface inside this issue.
- Follow-ups filed: none (2-13 criterion amended in place rather than a new node)

## 2026-07-19 — 3-06: Registration Email Notification

- What shipped:
  - `lib/registrationNotification.ts` — decides whether a Clerk `user.created`
    event deserves an ops email, renders it, and sends via an **injected**
    sender. Returns a result string (`sent` / `skipped-invite` /
    `skipped-no-email` / `skipped-unconfigured` / `failed`) instead of throwing,
    so the webhook always answers Clerk with a 200. 15 tests in
    `lib/registrationNotification.test.ts`.
  - `app/api/webhooks/clerk/route.ts` — after the existing Convex `syncUser`,
    `user.created` (not `user.updated`) fires the notification with a
    Resend-backed sender, or `null` when `RESEND_API_KEY` is unset.
  - `app/(auth)/sign-up/[[...sign-up]]/page.tsx` — now an async server
    component; reads the `sidestep_invite_token` cookie that middleware sets on
    `/invite?token=…` and passes `unsafeMetadata={{ registeredViaInvite: true }}`
    to `<SignUp>`. That is what distinguishes an invited captain from a walk-in.
- UX surfaces to eyeball: none visually. `/sign-up` renders the stock Clerk
  component exactly as before — the change is a metadata prop. (I ran
  `snap.mjs` on `/sign-up` and deleted the output: the saved auth session
  redirects `/sign-up` → `/`, so it screenshotted the homepage, which would be a
  misleading review artifact.) The real surface to eyeball is the **email**:
  subject `New Sidestep registration: <name>`, body lists name + email.
- Decisions I made that a human may want to veto:
  - **`unsafeMetadata` at sign-up, not `publicMetadata` after it.** The issue
    suggested setting `publicMetadata.registeredViaInvite` on the user after an
    invite sign-up, but that races `user.created` — the webhook usually fires
    first and would email on every invited captain. `unsafeMetadata` is part of
    the sign-up request, so it is already on the payload. It is client-writable,
    which here only means someone could suppress their own notification email —
    no security consequence. The webhook still honours `publicMetadata` if we
    ever promote the flag server-side.
  - **From-address.** The criterion says `noreply@sidestep.design`; I made that
    the *default* but kept the existing `RESEND_FROM_EMAIL` override that
    `jerseyRunActions.ts` already uses. `.env.local.example` currently sets that
    to `hello@sidestep.design`, so in a real deployment this mail will come from
    `hello@` unless you change the env. One verified sender identity seemed
    better than hardcoding a second — say the word and I'll pin it to `noreply@`.
  - **No email when the user has no primary email address** (`skipped-no-email`)
    rather than mailing ops a blank row.
  - Not verified end-to-end against a live Clerk + Resend — the issue's step 4
    (register a real account, confirm the mail lands) still needs a human with
    the production keys.
- Follow-ups filed: none

## 2026-07-20 — A-06: Extract Admin Join Users By Id Helper

- What shipped:
  - New `convex/_users.ts` with `joinUsersById(ctx, rows, keyOf)` — dedupes the
    referenced user ids, fetches each once in parallel, returns a
    `Map<Id<"users">, Doc<"users"> | null>` lookup. Sits next to `_auth.ts`.
  - `admin.listOrders`, `admin.listDesigns`, and `admin.listJerseyRuns` now
    collect → join → map synchronously instead of each hand-rolling a
    `Promise.all` with its own `captainCache`/`ownerCache` and an inline
    `undefined`-means-unfetched branch. `listJerseyRuns` keeps a `Promise.all`
    only because it still counts responses per run.
  - Characterization tests first: the three list queries had zero coverage, so
    `convex/admin.test.ts` gained an "admin list-view user joins" block (joined
    shape, deleted-user fallbacks, non-admin rejection) plus a new
    `convex/_users.test.ts` for the helper itself.
- UX surfaces to eyeball: none — no UI touched, no route changed, no query
  return shape changed. Admin orders/designs/jersey-runs lists render exactly
  the same payload. No screenshots.
- Decisions I made that a human may want to veto:
  - **Returns a lookup, not merged rows.** The helper hands back a `Map` and
    leaves the `"Unknown"` / `""` fallbacks at the call site, per the issue's
    criterion. That keeps presentation strings out of the data-access layer and
    lets each caller name its field (`captainName` vs `ownerName`) freely.
  - **Missing user is `null` in the map, not an absent key** — so a caller can
    tell "no such user row" from "never asked for it".
  - **`listJerseyRuns`' order join stayed inline.** It's the same dedupe-then-
    fetch shape but on the `orders` table; generalizing to a `joinDocsById<T>`
    for one caller felt like the wrong amount of abstraction today. If 2-13
    wants an order join too, promote it then.
- Follow-ups filed: none

## 2026-07-20 — 2-13: Admin Customer Management

- What shipped:
  - **Customer management**: `/admin/customers` (list with registration date,
    order count, "New" badge for sign-ups inside 7 days) and
    `/admin/customers/[id]` (profile with their orders and designs, plus inline
    editing of name and email). Backed by new `admin.listCustomers`,
    `admin.getCustomer`, `admin.updateUser`.
  - **Leads**: `/admin/leads` lists every intake submission newest-first;
    expanding a row shows the full brief, questions, contact details,
    `inspirationLinks` as plain `target="_blank" rel="noreferrer"` anchors (no
    fetching or previewing), and a "Send invite link" button that copies
    `/invite?token=<intakeId>`.
  - **Inline record editing everywhere**: one `InlineEditField` primitive
    (pencil → input → Save/Cancel, injected validation, toast on both
    outcomes) now drives the order detail page (team name, sport, quantity) and
    a new `/admin/designs/[id]` page (title, brief, silhouette specs), via
    `admin.updateOrder` / `admin.updateDesign` / `admin.updateUser` — all
    partial-update mutations, all `requireAdmin`-gated.
  - **Security fix found on the way**: `intakes.listIntakes` had no auth gate at
    all — anyone could read every lead's name, email, phone and brief. It now
    requires admin, with tests for anonymous and signed-in-non-admin callers.
- UX surfaces to eyeball: `/admin/customers`, `/admin/customers/<id>`,
  `/admin/leads`, `/admin/designs/<id>`, `/admin/orders/<id>`. Look for: the
  inline-edit affordance (is a bare pencil discoverable enough?), the leads
  expand-row vs. a modal, and whether "New" deserves more prominence.
  **No screenshots this run** — `.auth/state.json` has gone stale (Clerk logs
  "Refreshing the session token resulted in an infinite redirect loop", every
  authed route 404s in the browser), so `snap.mjs` times out on every
  `/admin/*` route. Public routes still snap fine, so this is the saved
  session, not the app. Fix is the one-time human step:
  `node scripts/snap.mjs --login`. I also had to kill a two-day-old stale
  `next dev` (PID 52128) holding port 8080 — Next refuses a second dev server
  for the same directory — and started a fresh one.
- Decisions I made that a human may want to veto:
  - **"Jersey specs" on the order detail page are edited on the design, not the
    order.** The issue's acceptance criteria predate O-01, which moved
    silhouette specs onto `designs`. Rather than resurrect order-level specs I
    linked each design from the order page to `/admin/designs/[id]`, where the
    specs are editable. The order page still edits team name, sport, quantity.
  - **Mutations are named `admin.updateUser` / `updateOrder` / `updateDesign`**,
    not the issue's `adminUpdateUser` etc. — they're already namespaced by the
    `admin` module, matching `admin.updateOrderStages`.
  - **`updateUser` writes only the Convex row.** Clerk stays the identity source
    of truth and its webhook can overwrite an admin's correction on the
    customer's next profile edit. The profile card says so in copy. Properly
    resolving this is 3-07 (User Sync Architecture Revisit).
  - **Admin edits are not blocked by a locked roster.** O-06 will decide what
    freezing means; admin override felt like the right default for a
    correction tool, but that's a product call.
  - **Leads expand inline rather than opening a dialog** — one open at a time.
  - **`listCustomers` returns every user including admins** (badged as such)
    rather than filtering staff out.
  - Empty-name users exist in the dev data, so both customer surfaces fall back
    to "Unnamed customer" instead of rendering a blank link.
- Follow-ups filed: none

## 2026-07-25 — D-01: Design Assets Metadata Table
- What shipped:
  - New `designAssets` table (one row per uploaded file: `filename`,
    `contentType`, `isMain`, uploader provenance snapshot, `createdAt`,
    indexed `by_design`) replacing `designs.fileIds`, which is gone from the
    schema. `convex/_designAssets.ts` owns every read/write of the table
    (list, resolve signed URLs, per-design file counts, insert-on-upload).
  - `lib/designAsset.ts` — the pure rules the rest of the PRD builds on:
    web-safe image predicate, main-image resolver (explicit `isMain` → first
    web-safe image by `createdAt` → none), upload/delete permission helpers,
    filename/content-type normalizers. 26 unit tests cover every branch.
  - `DesignForm` now sends `filename` + `contentType` with each upload;
    `getMyDesign` and admin `getDesign` return resolved `assets` (+ the
    resolved `mainAsset`); list surfaces get `fileCount` from the query
    instead of counting an array on the design doc. Portal and admin file
    lists show real filenames instead of "File 1 / File 2".
- **Blocking one-time human step before the app runs again:** the dev
  deployment still holds one dummy design (`j572994ahcdr7mzg6h8aycd9sh877eb4`,
  "TOC 2026 Jersey") carrying the removed `fileIds` field, so `npx convex dev`
  will refuse the new schema until that row is deleted in the Convex dashboard
  (this is the "wipe dummy designs once" step from the PRD). Three dev orders
  reference it; that's fine — order queries already drop missing design ids.
  I did not delete it myself: it's an irreversible write to a shared
  deployment, and nothing in the loop's contract covers deploying.
- UX surfaces to eyeball: **no screenshots this run** — every design surface
  reads through the Convex backend, which can't be pushed until the wipe
  above, so a snap would have photographed the old backend, not this change.
  After the wipe + `npx convex dev`, worth a look:
  `/portal/designs/[id]` and `/admin/designs/[id]` (file rows now read
  "crest.png" rather than "File 1" — check long filenames truncate rather
  than blow out the row), `/admin/orders/[id]` (file badges, same change),
  and the file counts on `/portal`, `/portal/designs`, `/admin/designs`,
  `/admin/customers/[id]`.
- Decisions I made that a human may want to veto:
  - **Resolver honours an explicit `isMain` even on a non-image asset.** The
    PRD's chain reads literally that way; render surfaces gate on
    `isWebSafeImage`, so an odd pick degrades to a download card. The
    alternative (ignore the flag unless web-safe) silently overrides the
    owner, which felt worse.
  - **`_schemaSmokeTest:run` takes an optional `storageId` arg.** A mutation
    can't create a storage id (`ctx.storage.store` is action-only), so the
    `designAssets` round-trip only runs when you hand it one from a real
    upload; the other eight tables are unchanged.
  - **Asset rows are appended in batch order via `createdAt + index`.**
    `Date.now()` is identical across a batch, and the resolver's "first by
    createdAt" needs a stable order.
  - **Filenames are shown as-is in the read-side lists** (D-02 owns the rich
    rendering); a blank name normalizes to "Untitled file" server-side.
- Follow-ups filed: none

## 2026-07-25 — D-02: Design Blocks Model and Read Rendering

- What shipped:
  - `designs.blocks` — an ordered discriminated union (`text` / `gallery` /
    `palette`) on the design doc, replacing the single `brief` string. Rules
    live in `lib/designBlock.ts` (fixed text sections used at most once,
    Overview required, one palette per design, hex/role/caption validation,
    `withOverview` merge); `convex/_designBlocks.ts` owns the stored shape and
    the one `prepareBlocks` gate every mutation runs a payload through.
  - `components/design/DesignBlocks.tsx` renders a brief read-only on both the
    portal and admin design pages: text sections headed by their field name,
    gallery grids that inline web-safe images by content type and fall back to
    typed download cards (or "Unavailable" on a null URL), and palette swatches
    with hex chip, role and Pantone label.
  - `brief` is gone everywhere: the design form's textarea now writes the
    Overview block, and every list/card/admin summary reads `overviewOf(blocks)`.

- **Screenshots: none — blocked, needs a human action.** The dev Convex
  deployment still holds one pre-D-01 dummy design (`TOC 2026 Jersey`, id
  `j572994ahcdr7mzg6h8aycd9sh877eb4`) carrying the *old* `brief` + `fileIds`
  shape, so `npx convex dev` refuses to push: *"Object is missing the required
  field `blocks`"*. With no backend matching the code, `snap.mjs` can't reach
  network-idle on any authenticated route and times out (0/18). D-01's report
  raised the same wipe and it hasn't happened yet, so **D-01's UI is also
  unscreenshotted**. Delete that one document in the Convex dashboard (PRD §6:
  "Migration: none — schema swap, wipe dummy data once") and both slices become
  reviewable.

- UX surfaces to eyeball once the wipe unblocks the deployment:
  `/portal/designs/[id]` (the brief is now blocks — check gallery grid density
  at 375px and that a long filename truncates in the download card),
  `/admin/designs/[id]` (new read-only "Brief" card above Silhouette specs),
  `/portal/designs/new` + edit (the "Brief" textarea is now "Overview"),
  and the summary lines on `/portal`, `/portal/designs`, `/admin/orders/[id]`.

- Decisions I made that a human may want to veto:
  - **Overview is required by the validator, not just on create.** Every list
    surface reads it, so a design without one has no summary anywhere. The
    editor simply won't offer to remove it (D-03).
  - **Admin lost inline brief editing.** `admin.updateDesign` no longer takes
    `brief` — the block editor writes blocks, and that lands for admin in D-06.
    Staff can still edit title, specs and files in the meantime.
  - **Hex is stored canonicalized as uppercase `#RRGGBB`** (shorthand expanded,
    bare digits accepted) so a swatch reads like a spec token next to its
    Pantone code.
  - **Text bodies keep the old 2000-char cap** (`TEXT_BODY_MAX_LENGTH`), now
    owned by `lib/designBlock` rather than `lib/design/rules`.
  - **Galleries allow the same asset in two galleries but not twice in one**,
    and an empty gallery/palette is storable — those are normal mid-edit states
    that D-05 needs.
  - **I killed a stale `next dev` process** (PID 145928, started 2026-07-20)
    that was squatting on :8080 with an outdated route manifest — Next 16
    refuses a second dev server for the same directory. A fresh one is running.

- Follow-ups filed: none

## 2026-07-25 — D-03: Shared Block Editor: Text Sections and Reorder

- What shipped:
  - **Four narrow block mutations** in `convex/designs.ts` — `addBlock`,
    `updateBlock`, `removeBlock`, `moveBlock` — all behind one
    `requireBlockEditAccess` gate (owner **or** admin, because portal and admin
    mount the same editor) and all writing through `patchBlocks`, the only
    function that ever touches `designs.blocks`. So every operation re-runs the
    D-02 validators; there is no path that half-applies a change.
  - **`components/design/DesignBlockEditor.tsx`** — the shared editing surface:
    add a text section from the fixed menu, edit a body in place, remove,
    reorder by drag or by move up/down. Prop surface is `designId` / `blocks` /
    `assets`; it holds no draft of the brief, only what isn't committed yet.
  - **Portal design page edits the brief in place.** `DesignForm` keeps the
    Overview on **create** only (PRD §10: authored where the design is born),
    and `updateDesign.blocks` is now optional — the edit form sends no blocks at
    all, so saving a title can't overwrite a section the editor just changed.
  - `DesignBlocks.tsx` split: `DesignBlockBody` renders one block with no
    chrome, so the editor and the read-only page share one renderer.

- UX surfaces to eyeball: **no screenshots — see "Blocked" below.** When the dev
  deployment can push, look at `/portal/designs/[id]` (the brief is now a stack
  of cards with a grip, move arrows, edit and remove; check the header row
  doesn't crowd at 375px with four buttons and a long heading), the "Add
  Concept / Inspiration / Notes" button row, the dashed draft card, and
  `/portal/designs/[id]` in edit mode (the Overview textarea is gone from step
  01 — confirm that section doesn't read oddly with only Title + Canva left).

- Decisions I made that a human may want to veto:
  - **The add menu is a row of visible buttons, not a dropdown.** There are at
    most four sections; showing which are still open beats hiding them behind a
    click. Taste call — a `DropdownMenu` is a small change if you disagree.
  - **Reorder affordance (resolves PRD §10):** a grip handle is the drag source
    on desktop, and **move up / move down buttons are the real path** for
    keyboard and touch. HTML5 drag-and-drop doesn't fire on touch at all, so
    shipping only a handle would have left mobile with no way to reorder. The
    grip is `aria-hidden` — it's a pointer-only affordance and shouldn't
    announce itself as a control that can't be operated.
  - **A new section isn't stored until it has a body.** `validateBlocks` refuses
    an empty text block (D-02), so picking "Concept" opens a draft card and the
    mutation fires on save. The alternative was relaxing that rule to allow
    blank headings — worse.
  - **Gallery and palette are reorderable and removable here, but not
    editable.** The add menu offers text sections only; palette and gallery
    entries arrive with D-04/D-05, which own those editors. Adding an
    unfillable empty palette now would be a half-feature.
  - **`updateBlock` refuses to change a block's kind**, which would silently
    discard a text body. Position is `moveBlock`'s job, not an edit's.
  - **The editor validates with `validateBlocks` itself** rather than a
    parallel zod schema, so the message the user reads is the message the
    server would have sent.
  - **I did not delete the stale dev document** (below). It looks like your
    hand-made test record, on your deployment.

- Blocked: **screenshots, for the third slice running.** `npx convex dev`
  refuses to push because one design (`TOC 2026 Jersey`) predates D-01/D-02 and
  has no `blocks` field, so `snap.mjs` has no live backend to point at. Filed as
  **D-09** (needs-human) with the exact error and three options in
  `backlog/QUESTIONS.md`. The whole design-page track — D-01, D-02, D-03 — now
  has no visual review surface, and D-08 can't start without one; D-09 re-snaps
  all three once it's unblocked. Code is unaffected: 789 tests green.

- Follow-ups filed: D-09 (wipe the pre-D-01 dev design, then capture the
  missing D-01/D-02/D-03 screenshots) — flagged needs-human, blocks D-08.
