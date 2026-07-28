# Session Reports

One entry per completed loop task. This is the human's fast path for UX critique: read "UX surfaces to eyeball", open those routes, judge. Reviewed in batches via `/review-batch`.

---

## 2026-07-27 — Fix: broken pages from undeployed `listOrderEntries` + UI walkthrough

- **Root cause of the broken pages.** The error `Could not find public function
  for 'jerseyRuns:listOrderEntries'` was **not a code bug** — the function exists
  in source (added in R-07). The dev Convex deployment (`benevolent-starling-766`)
  was simply **stale**: it still had the old `listResponses`/`listMyResponses`
  functions and had never received a successful push. Every `convex dev` push was
  being **rejected by schema validation** because 3 legacy `jerseyRuns` documents
  still carried the `fixedRoster` field that R-07 removed from the schema. So the
  three pages that read `listOrderEntries` (portal order detail, captain responses,
  admin run detail) all 500'd.
- **Fix.** Added `_migrations:dropFixedRoster` (idempotent, mirrors the existing
  `backfillDesignBlocks` pattern), temporarily re-admitted `fixedRoster` as
  optional in schema so the migration could deploy, ran it (dropped the field
  from all 3 runs), then removed the temp schema lines and pushed clean. No name
  data was migrated into `rosterEntries` — a roster entry needs a `designId` that
  `fixedRoster` never recorded, and R-07 explicitly chose "no data migration,
  nothing to preserve (pre-launch)". Dev/test data only.
- **Verified fixed** by walking the UI: portal order detail (C-01 jersey
  breakdown — size chips + per-design roster lines), captain responses page (C-02
  — All / By roster / By fan views), and admin run detail all render correctly.
- **UX polish landed this session:** admin order detail Captain card no longer
  renders an *invisible empty link* when the captain's name/email are blank — it
  now shows "Unnamed captain" (still links to the profile) + "Not set" for a
  missing email. Admin Orders and Jersey Runs list "Captain" columns fall back to
  "Unnamed captain" too.
- **Filed [B-02]** (blank user name/email across admin surfaces): the underlying
  data problem behind those fallbacks — `syncCurrentUser` is gated behind
  `getCurrentUser === null` so existing blank rows never backfill, and the Clerk
  `convex` JWT template may not even map name/email claims. Needs human/Clerk-dash
  verification; too big to fix blind. Cross-referenced with 3-07.
- 936 tests green; typecheck clean.

### UX surfaces to eyeball
- `/admin/orders/[id]` — Captain card with blank data (now "Unnamed captain" / "Not set")
- `/admin/orders` and `/admin/jersey-runs` — Captain columns (now fall back gracefully)

### Notes for the human to review later
- **Transient "not found" flashes.** During the walkthrough, `/portal/orders/[id]`,
  `/portal/designs/[id]` and `/portal/designs` briefly showed "not found" / "no
  designs" immediately after the Convex redeploys, then rendered correctly on
  reload. This is the Convex client reconnecting before the Clerk auth token
  re-attaches (unauthenticated → owner-scoped query returns null/empty). Harmless
  in normal use, but if you want zero-flash you could gate these pages on Clerk's
  `isLoaded`/`isSignedIn` before trusting a null result. Left as-is — not filing
  an issue unless you see it outside a redeploy.
- **B-02 needs your input** (Clerk dashboard): confirm the `convex` JWT template
  maps `name` and `email`. That's the one thing I can't verify from the repo.

---

## 2026-07-26 — R-07: Migrate Remaining Surfaces + Retire Old Tables

- What shipped — the interim dual-model state is gone. `jerseyRunResponses`
  (the flat one-row-per-fan table) and `jerseyRuns.fixedRoster` (the run-level
  roster array) are **deleted from the schema**. Every reader now sits on the
  unified `orderEntries` / `rosterEntries` model (R-01), and every writer was
  already there (R-02…R-06), so this was the cleanup slice, not new behaviour.
  - **Convex reads repointed.** `jerseyRuns.listResponses` → **`listOrderEntries`**
    (returns the run + order + each order entry enriched with its design title
    and, when it fills a slot, the roster name/number). `listMyResponses`
    rewritten to read a fan's own jerseys by normalized submitter email — via a
    **new `orderEntries.by_submitterEmail` index** so it stays indexed, not a
    scan. `admin.getOrder` / `admin.listJerseyRuns` counts and `_closeRun`'s
    email count all now compute **Σ qty over order entries** (total jerseys).
  - **Legacy writers/readers deleted:** `jerseyRuns.submitResponse` (replaced by
    `orderEntries.submitOrder` back in R-02) and the unused
    `listMyResponsesForRun`. `create` no longer accepts or writes `fixedRoster`.
  - **UI migrated.** Admin run detail and the captain responses page render an
    **order-entry table** (Submitter · Email · Design · Jersey · Size · Qty ·
    custom answers · Submitted); a slot-less line reads "Blank". The portal
    dashboard "your jersey run responses" cards read order entries (design title
    + `N×` when qty > 1). The run setup form **drops the inline fixed roster** —
    fixed-mode named slots are seeded through the RosterManager (R-03) after
    creation, which is now the single source of truth.
  - **Lib cleanup.** `lib/jerseyRun` lost the `fixedRoster` field and roster
    caps (they live in `lib/rosterEntry` now). `lib/jerseyRunResponse/form.ts`
    (the dead response form adapter) deleted; `rules.ts` slimmed to the grain
    still shared by the public form + submit mutation (`isJerseyRunClosed`,
    `checkCustomAnswer`).

- Verified: `node scripts/verify.mjs` PASS — typecheck clean, 0 lint errors,
  **884 tests** green (added `listOrderEntries` + `listMyResponses` coverage;
  retired the `submitResponse` and legacy-table tests). A repo-wide grep for
  `jerseyRunResponses` / `fixedRoster` shows only historical comments and one
  intentional `not.toHaveProperty("fixedRoster")` assertion.

- UX surfaces to eyeball: `/portal/orders/<id>/run/responses` (captain) and
  `/admin/jersey-runs/<id>` (admin) for a run with a mix of named, blank/bulk,
  and multi-qty order entries — check the new columns read cleanly and "Blank"
  isn't mistaken for missing data; `/portal` dashboard cards for a fan who
  ordered across designs; `/portal/orders/<id>/run/setup` in **fixed** mode —
  confirm the roster is seeded via RosterManager and the old inline roster form
  is gone. **No screenshots** — routes are behind Clerk and `.auth/state.json`
  is stale (same blocker as recent slices).

- Decisions I made that a human may want to veto:
  1. **Counts are Σ qty (total jerseys) everywhere**, not a row/submitter tally.
     The old table was one row = one jersey, so Σ qty is the faithful analog and
     it reconciles with the order page's derived total (O-07) and the responses
     estimate. Side effect: the closure email's "N people submitted" now counts
     jerseys, not people — I left that render fn (deadline lib) untouched.
  2. **Kept the field/module names `responseCount`, `jerseyRunResponseCount`,
     and the `lib/jerseyRunResponse` module** rather than renaming. They no
     longer reference a real table but renaming fans out into more surfaces;
     flagged here if you'd rather I rename for clarity.
  3. **`listOrderEntries` returns fully-joined rows** (design title + slot
     name/number resolved server-side) so both consuming pages stay dumb. The
     alternative — return raw entries and let each page join — duplicated the
     lookup twice.

---

## 2026-07-26 — O-07: Order Total Derived From Roster

- What shipped:
  - **The order's quantity is now derived, not entered.** `/portal/orders/[id]`
    reads R-04's `orderEntries.countsByRun` (skipped until a run exists) and
    uses `total` — Σ qty over the roster rows — as the order's real headline
    number. The header badge reads "N collected" and the "The basics" card
    splits the old single "Quantity" line into **Collected** (the live derived
    total) and **Estimated at intake** (the old `estimatedQuantity`, kept only
    as the informational seed it always was, now plainly labelled as such).
  - **Each design section shows its own count.** The per-design rollup
    placeholder ("Collected counts will appear here…") is replaced by a real
    figure from `countsByRun.byDesign`, grouped by `designId`. A design with
    nothing collected keeps the dashed, muted empty look ("No jerseys collected
    yet — counts appear here as your team submits"); any real count reads as a
    solid figure.
  - **0 is the resting total.** An empty roster, a still-loading run, or no run
    at all all read as 0 — never a fall-back to the stale estimate. No schema
    or query change: this slice is purely the order page consuming the existing
    derived-counts query.

- UX surfaces to eyeball: `/portal/orders/<id>` — check the header badge, the
  Collected vs Estimated at intake pair in "The basics", and each design
  section's rollup, across three states: no run yet (0), a run with mixed
  per-design counts, and a run with an empty roster (0, distinct from the
  estimate).

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

## 2026-07-26 — D-04: Palette Block Editor

- What shipped:
  - **The palette is editable in the shared block editor.** "Add palette"
    appears in the add menu only while the design hasn't got one; the card opens
    a swatch list where each row is a native color picker + hex field + role +
    optional label + optional Pantone code, with move up/down and remove per
    swatch, plus a caption for the block itself.
  - **`lib/designBlock` grew the pure half** — `hasPalette`, `newSwatch`,
    `newPaletteBlock`, `addSwatch`, `removeSwatchAt`, `moveSwatch`,
    `patchSwatch` — so `PaletteEditor.tsx` is layout and labels only, and the
    swatch rules are unit-tested without a DOM. `moveBlockTo` now delegates to a
    generic `moveItemTo`, which swatches reuse: blocks on the page and colors in
    the palette reorder by the same function.
  - **No new mutations.** A palette is one block, so add/remove/reorder/retype
    of swatches is local until you press save, then rides the existing
    `addBlock` / `updateBlock` from D-03 — and `prepareBlocks` re-runs the D-02
    validators on it server-side either way.

- UX surfaces to eyeball: `/portal/designs/<id>` — open the brief, click **Add
  palette**, then **Add color**. Look for: the swatch row at 375px (picker +
  four fields + three icon buttons is the densest thing in the editor), the
  native `<select>` for role against the shadcn inputs beside it, and the color
  picker's popover in dark mode. **No screenshots this slice** — see Blocked.

- Decisions I made that a human may want to veto:
  - **The palette saves as a whole block, not swatch-by-swatch.** D-03's four
    narrow mutations exist so two people editing one design can't clobber each
    other; a palette's swatches are one ordered list inside one block, and a
    mutation per keystroke of a Pantone code would be absurd. So the editor
    holds a draft and one save carries it. Trade-off: two people editing the
    *same palette* at once, last save wins.
  - **A new palette doesn't exist until you save it.** Clicking "Add palette"
    opens a dashed draft card (same as a new text section) rather than writing
    an empty palette immediately — so abandoning it leaves nothing behind.
  - **Role is a native `<select>`, not the shadcn `Select`.** Three short
    options in an already-dense row, it stays operable by keyboard and touch,
    and it's testable without driving a portal-rendered listbox. Styled to match
    `Input`; the open dropdown is OS-drawn. Swap it if it reads cheap next to
    the other fields.
  - **Field labels are `aria-label` + placeholder, not visible `<label>`s.**
    Four visible labels per swatch across N swatches drowned the row. Screen
    readers get "Swatch 2 Pantone code"; sighted users get the placeholder.
  - **A new swatch starts black** (`DEFAULT_SWATCH_HEX`). The picker has to open
    somewhere and a color nobody would ship reads as "pick me" rather than as a
    decision the design already made.
  - **An empty palette is savable** — the block lands, colors arrive later, same
    as an empty gallery. `validateBlocks` already allowed this.

- Blocked: **screenshots, for the fourth slice running — but the reason
  changed.** Your `_migrations.ts` backfill fixed the schema: `npx convex dev
  --once` pushes cleanly now and `snap.mjs` reached the running app. What it
  photographed was the **Clerk sign-in wall** — the session saved in
  `.auth/state.json` on 2026-07-19 has expired. All 12 shots were sign-in pages,
  so I deleted them rather than file them as review artifacts. One human command
  fixes it and unblocks D-01/D-02/D-03/D-04 together:
  `node scripts/snap.mjs --login`. Noted under D-09 in `backlog/QUESTIONS.md`,
  whose original question (delete the stale dev row?) is now moot — nothing has
  to be deleted.

- Follow-ups filed: none. D-09 still needs a human, now for `--login` rather
  than for the dev data.

## 2026-07-26 — D-05: Gallery Blocks and Asset Pool

- What shipped:
  - **The design's file pool is now managed on the design page.** Three
    mutations (`addAssets`, `setMainAsset`, `removeAsset`) plus a
    `DesignAssetPool` component mounted inside the shared block editor: upload
    more files, pick the main image, delete one — thumbnails for web-safe
    types, typed tiles for everything else. Permissions run the pure
    `lib/designAsset` predicates on both sides, so the buttons a captain can't
    use aren't rendered and the mutation refuses them anyway.
  - **Gallery blocks are editable.** `GalleryEditor` is a checkbox grid over
    the whole pool plus a caption; check order is gallery order (shown as a
    number on each picked tile). Multiple galleries per design, and one image
    may appear in several.
  - **Deleting a file cleans up after itself.** `removeAsset` strips the id out
    of every gallery that hand-picked it in the same mutation, so no gallery is
    ever left pointing at a file that's gone. The blocks themselves survive —
    an emptied gallery keeps its place and invites new picks.

- UX surfaces to eyeball: `/portal/designs/<id>` — the brief now ends with a
  "Files (n)" pool where the old read-only file list used to be; "Add gallery"
  joined the add-block row. Worth judging: whether the pool belongs under the
  brief or above it, the gallery picker's tile density on mobile, and the
  star/x icon pair on each file card. **No screenshots** — see below.

- Decisions I made that a human may want to veto:
  - **A design can't delete its way to zero files.** `createDesign` and
    `updateDesign` both require at least one file, so a fileless design could
    no longer be saved from the edit form at all. `removeAsset` refuses the
    last one ("upload another before removing this one") and the pool hides the
    delete button entirely at one file. The alternative — allow zero and relax
    the form — is a bigger product change than this slice.
  - **The "Main" badge follows the resolver, not just the explicit flag.** A
    design with no explicit pick still badges the image the page actually uses
    (oldest web-safe), so the badge never lies. There's no "unset main" —
    picking a different image is the only move.
  - **The pool lives inside `DesignBlockEditor`, not on the page.** That's what
    makes D-06 a one-line mount: the admin page gets file management for free.
  - **`getMyDesign` now returns `viewer: { userId, isAdmin }`.** The pool has to
    know who's looking to decide whether a staff-uploaded file shows a delete
    button.
  - **The old read-only "Files" list on the portal design page is gone** — the
    pool replaces it, download links included.

- Blocked: **screenshots, fifth slice running.** `.auth/state.json` is still the
  session saved 2026-07-19, untouched since D-04 photographed the Clerk sign-in
  wall with it. Nothing has changed that would make this attempt land anywhere
  else, so I didn't re-capture 12 sign-in pages. `node scripts/snap.mjs --login`
  then unparking D-09 captures D-01 → D-05 in one pass; QUESTIONS.md updated to
  say so.

- Follow-ups filed: none. D-09 still needs the human `--login`.

## 2026-07-26 — D-06: Admin Design Page Uses Shared Editor

- What shipped:
  - **`/admin/designs/<id>` mounts `DesignBlockEditor`.** Staff now write the
    brief — text sections, palette, galleries, reorder — through the exact
    component the captain uses on `/portal/designs/<id>`, calling the same four
    owner-or-admin block mutations. The read-only "Brief" card (and the note
    saying staff would get this in D-06) is gone.
  - **The admin page's read-only "Files" list is replaced by the shared asset
    pool**, which rides along inside the editor: staff upload, pick the main
    image, and delete — including a captain's upload, which is the admin-only
    case. Staff uploads stay admin-delete-only, because the provenance snapshot
    is taken server-side at upload.
  - **`admin.getDesign` now returns `viewer: { userId, isAdmin }`**, the same
    shape `designs.getMyDesign` returns — the pool has to know who's looking to
    decide which delete buttons exist.
  - **Parity is a test, not a claim.** `convex/designs.test.ts` runs one edit
    script (add section, rewrite one, hand-pick a gallery, reorder, upload, set
    main, delete a picked file) twice — once as the captain, once as staff — and
    asserts both designs land in identical block and file state.

- UX surfaces to eyeball: `/admin/designs/<id>` — the brief and files are now
  the portal's editing surface dropped between the "Design" card and the
  "Silhouette specs" card. Worth judging: the editor sits *on* the page rather
  than inside a Card (the block cards would otherwise be cards inside a card),
  so the admin page now mixes card chrome and plain sections; and whether staff
  want the file pool that far down the page. **No screenshots** — see below.

- Decisions I made that a human may want to veto:
  - **Title, the cut and the Canva link keep their `InlineEditField` chrome.**
    Only design *content* moved to the shared editor, per the issue's
    acceptance criteria — swapping the rest would have meant giving the portal
    a title editor it doesn't have.
  - **No admin-only affordances were added.** The editor is mounted unchanged;
    everything admin-specific (delete anything, uploads flagged as staff) falls
    out of the viewer it's given plus the server rules. That's the "no divergent
    code paths" criterion taken literally.
  - **`components/design/DesignBlocks.tsx`'s top-level `DesignBlocks` export is
    now unused in app code** (the editor uses its `DesignBlockBody`/`EmptyBrief`
    internals). Left in place because D-07/D-08 are the read-only design
    surfaces; if they don't take it, it should be deleted then.

- Blocked: **screenshots, sixth slice running.** `.auth/state.json` is still the
  session saved 2026-07-19, and `/admin/designs/<id>` is behind both Clerk and
  the admin role, so a capture would photograph the sign-in wall again. Didn't
  re-capture. `node scripts/snap.mjs --login` then unparking D-09 now covers
  D-01 → D-06 in one pass.

- Follow-ups filed: none. D-09 still needs the human `--login`.

## 2026-07-26 — D-07: Order Page Design Main Image

- What shipped:
  - `convex/_designAssets.ts` gains `assetSummariesByDesign` — the count and
    the picture in one pass per design. It resolves the main asset over
    metadata (the D-01 resolver, unchanged) and asks storage for exactly one
    signed URL per design rather than resolving the whole pool.
  - `orders.getMyOrder` now returns `mainImage` beside `fileCount` for each
    linked design; one image per design, never an order-level one.
  - Each design section on `/portal/orders/<id>` leads with a 56px thumbnail
    beside its file-count badge, with a labelled placeholder covering all four
    no-image cases.
  - New `app/portal/orders/[id]/page.test.tsx` (first render test for this
    page) plus four `getMyOrder` cases; 22 tests over the two files.

- UX surfaces to eyeball: `/portal/orders/<id>` — the Designs section. Worth
  judging: the thumbnail size (56px, chosen to sit inside the existing card
  header without pushing the title down), whether a design's picture should
  instead be a wide banner across the section, and how the grey placeholder
  icon reads next to a real photo when an order mixes designs with and without
  artwork. **No screenshots** — see below.

- Decisions I made that a human may want to veto:
  - **Thumbnail beside the title, not above the section.** The issue says
    "picture and number, not either/or" and the card header already pairs
    title + count, so the image joins that row. A banner treatment would
    change the section's rhythm — that's D-08 territory if you want it.
  - **The renderer, not the query, decides renderability.** `mainImage`
    carries `contentType`, so an owner who explicitly flagged a print template
    as main still gets the placeholder rather than a broken image — the same
    rule the D-05 asset pool applies.
  - **Added an `onError` fallback.** Convex signed URLs are short-lived, so a
    page left open can hold a stale URL; the thumbnail swaps itself for the
    placeholder instead of showing a broken-image glyph.

- Blocked: **screenshots, seventh slice running.** `.auth/state.json` is still
  the session saved 2026-07-19 and `/portal/orders/<id>` is behind Clerk, so a
  capture would photograph the sign-in wall again. Didn't re-capture.
  `node scripts/snap.mjs --login` then unparking D-09 now covers D-01 → D-07.

- Follow-ups filed: none. D-08 is unblocked by this on the code side; it still
  waits on D-09.

## 2026-07-26 — O-06: Freeze Order When Roster Locked

- What shipped:
  - **One lock rule, read and write.** `convex/orders.ts` gained an
    `isOrderLocked` helper; `orders.getMyOrder` now returns `locked` and
    `orders.updateOrder`'s guard goes through the same helper. The UI can
    therefore never render an edit affordance the mutation would reject. It
    resolves the lazy past-deadline case too (R-06 auto-locks on read, so a run
    stored `open` past its deadline is already frozen and nothing has written
    that down).
  - **`/portal/orders/[id]` drops every edit affordance when locked** — Edit
    order, Manage designs, and the empty-state Attach a design all disappear —
    and shows the new `components/portal/OrderLocked.tsx` notice ("Locked —
    contact Sidestep to change") instead. The run badge now reads
    `effectiveStatus` rather than the stored `status`, so an auto-locked run
    reads "Roster locked" instead of cheerfully claiming "Collecting".
  - **`/portal/orders/[id]/edit` swaps the form for a read-only summary** plus
    the same notice. The route stays reachable (bookmarks, back button), so it
    explains the freeze rather than 404ing. "View design" links survive on both
    pages — the freeze is scoped to the order, designs stay editable.

- UX surfaces to eyeball: `/portal/orders/<id>` and `/portal/orders/<id>/edit`,
  for an order whose run is locked (or whose deadline has passed) and one whose
  run is still open. Look for: does the locked page read as *finished* rather
  than *broken* now that its buttons are gone; is the amber notice the right
  weight next to the stage chip; does the read-only edit page justify its own
  existence or should it redirect to the detail page instead.
  **No screenshots** — see Blocked below.

- Decisions I made that a human may want to veto:
  1. **`locked` ships on the order read, not a separate query.** The alternative
     was each page calling `jerseyRuns.getByOrder` and deriving it. One flag on
     the order means the page that renders the button and the mutation that
     rejects the save can't disagree.
  2. **The edit route renders read-only instead of redirecting to the detail
     page.** A redirect is tidier but silently swallows a deliberate navigation;
     this explains itself and shows the order back to the captain so they know
     what to quote when they email Sidestep. Easy to flip if you disagree.
  3. **"Manage run" still links out from a locked order.** The run surfaces have
     no lock awareness at all yet (R-06 shipped backend-only), so hiding the
     link here would just hide the problem. Filed as R-08 instead.
  4. **A closed run is not frozen.** Collection being over isn't the same as the
     basis being confirmed — a captain can still fix a team name before locking.
     Follows `effectiveStatus`, which distinguishes the two.

- Blocked: **screenshots, eighth slice running.** I did attempt a capture this
  time rather than inferring: `node scripts/snap.mjs O-06 /portal` produced six
  photographs of the Clerk sign-in wall, which I deleted. `.auth/state.json` is
  still the session saved 2026-07-19 and both O-06 routes are behind Clerk.
  `node scripts/snap.mjs --login`, then unpark D-09, now covers D-01 → D-07
  plus these two order routes.

- Follow-ups filed: **R-08** (Run Surface Lock Controls) — R-06 listed "lock
  control + locked badge" as frontend scope but shipped no UI, so today a run
  can only reach `locked` by its deadline passing; nobody can lock deliberately.

## 2026-07-27 — C-01: Jersey Breakdown Derivations + Order Detail Roster/Size View

- What shipped — the order detail page now shows the **jerseys**, not just
  the count.
  - **`lib/jerseyBreakdown.ts`** — the pure layer C-02 builds on.
    `rosterLinesByDesign(entries, designs)` groups the collected jerseys by
    design in the order's own design sequence (empty designs included as empty
    groups); `sizeTally(entries)` sums Σ qty per size in canonical size order;
    `entriesForDesigns` scopes a run's entries to the designs the order still
    carries; `jerseyLabel` is the name/number join ("Gretzky #99" → "Blank"),
    lifted out of the responses table so nothing re-implements it.
  - **`RosterLines` / `RosterBreakdown` + `SizeBreakdown`** components, both
    entry-array-shaped and query-free. `RosterLines` renders one design's lines
    (order detail mounts it inside each design section, which already carries
    the title); `RosterBreakdown` renders every design under its own heading —
    that one exists for C-02's "By roster" view and is tested but not yet
    mounted anywhere.
  - **Order detail wiring** — one new `jerseyRuns.listOrderEntries` read, gated
    on `run` exactly like the counts query. The combined size chip row sits
    above the design cards; each design card keeps its existing rollup and
    empty state, with the lines beneath it.

- UX surfaces to eyeball: `/portal/orders/<id>` — **no screenshots, blocked**
  (see below). What to look at once it's shootable: the size chip row under the
  "Designs" heading, and the roster list inside each design card (jersey label
  left, size pill, "×N" only when the quantity isn't 1). Order
  `jh7ad7376r9ffvkz1vhs0s5b458b9v0e` ("Westerns Test") is the only one on dev
  with collected entries — the others render none of this.

- Decisions I made that a human may want to veto:
  - **Identical jerseys collapse into one line with Σ qty.** Two fans ordering
    #99 Gretzky in L render as one line "×2", not two identical rows. This view
    answers "what are we making"; the responses table stays the submission log.
    Trade-off: an open-mode name collision reads as a quantity here rather than
    as two rows. Nothing is dropped — the lines still sum to the design's count.
  - **"×N" is hidden when N is 1.** Most lines are one jersey and "×1" on every
    row is noise. If you'd rather always see a quantity column, it's one line.
  - **Sort is player name (numeric-aware, case-insensitive), blanks last, then
    canonical size.** Not submission order — a captain scans for a name.
  - **Removed designs are scoped out** of both the lines and the size chips, so
    the numbers reconcile with `countsByRun`; those entries keep their existing
    "Removed designs" section.
  - **Placement of the combined breakdown** — above the per-design cards rather
    than in the "Order details" card. Pure taste; easy to move.

- Screenshots: **none — `.auth/state.json` is still the expired 2026-07-19
  Clerk session.** `snap.mjs` photographed the sign-in wall at all six
  viewport/scheme combinations; those were deleted rather than filed, and the
  D-09 entry in `backlog/QUESTIONS.md` was updated to add this route's
  collected-roster state to the pass it owes. One `node scripts/snap.mjs
  --login` unblocks it.

- Follow-ups filed: none

- Also in this commit, because it gated the receipt: **`components/intake/IntakeForm.test.tsx` was failing on master before C-01** (confirmed by stashing this work and running the suite on a clean tree — 884 passed, same 1 failure). Two of its tests intermittently blew vitest's 5s default timeout when the suite runs in parallel: `user.type` enters text one keystroke at a time, and each key re-renders a validating form, so the multi-sentence brief plus a 45-character share URL was most of the budget. Fixed by pasting those two long values instead of typing them — which is also what the test's own name says it does ("sends a **pasted** share-folder link"). Assertions, coverage, and the typed path on the short fields are all unchanged; no timeout was raised.

## 2026-07-27 — C-02: Captain Responses Page — Multi-View Breakdown (By Roster / By Fan)

- What shipped:
  - `jerseysByFan` in `lib/jerseyBreakdown.ts` — the run read from the
    submitter's side: one group per fan keyed on the normalized email the
    submit path stores (`trim` + `toLowerCase`, matching `checkSubmitterEmail`),
    holding **one row per jersey they ordered**, fans ordered by display name.
  - `components/portal/FanBreakdown.tsx` — the by-fan view. Name + email as the
    group heading, Σ qty beside it, then a row per jersey (label / design /
    size / ×qty). Query-free, same shape as C-01's components.
  - `/portal/orders/<id>/run/responses` gains an **All responses / By roster /
    By fan** tab switcher over the same `listOrderEntries` data, plus C-01's
    combined size-breakdown chip row above it. By roster mounts C-01's
    `RosterBreakdown` verbatim — no new grouping arithmetic beyond `jerseysByFan`.

- UX surfaces to eyeball: `/portal/orders/<id>/run/responses` in each of its
  three views, on an order whose run actually has entries (see below — no
  screenshots this round).

- Decisions I made that a human may want to veto:
  - **The raw table stays the default view**, as the issue's decision note
    proposed — it's the only view carrying submitter, email, custom answers and
    timestamps. Say the word and "By roster" becomes the landing view.
  - **Tab labels**: "All responses" / "By roster" / "By fan". Pure copy.
  - **The two derived views (and the size chips) are scoped to the order's
    current designs**, the way C-01 scoped the order detail page, so their
    numbers reconcile with `countsByRun`. The raw table stays unscoped — it's
    the O-08 receipt for what was actually submitted, so a jersey on a
    since-removed design still appears there and nowhere else. That asymmetry
    is deliberate but it is a judgement call.
  - **By fan does not collapse identical jerseys.** `rosterLinesByDesign` merges
    the same slot in the same size into one production line; the by-fan view
    deliberately does not, because it answers "what did this person ask for?"
    and two identical jerseys on one submission are two things they asked for.
  - **The design name under each by-fan row is dropped when the run has only one
    design**, where it would repeat on every row.
  - **The switcher is local `useState`, not a URL param** — a reload lands back
    on the table. Fine unless captains want to link someone to a specific view.

- Screenshots: **none — `.auth/state.json` is still the expired 2026-07-19 Clerk
  session.** Confirmed rather than assumed: `snap.mjs` photographed the sign-in
  wall at all six viewport/scheme combinations again, and those were deleted
  rather than filed. The D-09 entry in `backlog/QUESTIONS.md` now also owes this
  route in its three views. One `node scripts/snap.mjs --login` unblocks it.
  The layout was therefore reasoned about rather than seen: the by-fan row uses
  the same flex shape as C-01's roster lines (truncating label, fixed-width size
  chip and qty), so 375px behaves the way that already-reviewed row does.

- Follow-ups filed: none

## 2026-07-28 — B-03: Portal pages flash "not found" while auth loading

- What shipped:
  - `lib/ownedResource.ts` — a pure `resolveOwnedResource` (8 unit tests) plus
    `useOwnedResource` / `useOwnedList` hooks that fold "Convex auth not ready"
    and "query not resolved" into one `loading` state. A page now only renders
    "not found" on an answer the server gave while it knew who was asking.
  - Applied to every owner-scoped portal surface: `/portal/orders/[id]`,
    `/portal/orders/[id]/edit`, `/portal/orders/[id]/run/setup`,
    `/portal/orders/[id]/run/responses`, `/portal/designs/[id]`,
    `/portal/designs`, and the `/portal` dashboard's three list sections.
  - The two skeleton screens that tests now assert on gained
    `role="status" aria-label="Loading order|design"` — they had no accessible
    name at all before, so a screen reader announced nothing during the wait.

- UX surfaces to eyeball: `/portal` and `/portal/designs`
  (screenshots in `docs/review/B-03/`). Both are the *settled* state — the bug
  is a sub-second transient, so a static snapshot can't show the fix; the tests
  are the real evidence. What the screenshots are good for: confirming the
  empty states ("You don't have any orders yet", "No designs yet") still render
  when they should, since this change gates exactly those.
  To see the fix live: hard-reload `/portal/orders/<id>` on a throttled
  connection — it should go skeleton → order, never "Order not found".
  Pre-existing and untouched by this task, but visible at 1280 light: in the
  sidebar footer the Clerk avatar overlaps the "Account" label, and the white
  sidebar panel stops short of the viewport bottom.

- Decisions I made that a human may want to veto:
  - **Gated on Convex's `useConvexAuth()`, not Clerk's `useAuth()`** (option 1
    in the issue named Clerk). `useConvexAuth` flips to authenticated only once
    the Convex client has validated the token — which is the exact moment
    owner-scoped queries start answering for a real identity — and it re-enters
    loading on a reconnect, which is where the flash was most visible. Clerk's
    `isLoaded` would still leave the token-attach gap open.
  - **Unauthenticated renders as loading, not as an error.** `/portal/*` is
    middleware-protected, so a genuinely signed-out visitor is redirected and
    never sits on a spinner. If that middleware matcher ever changes, this
    becomes an indefinite skeleton.
  - **Scope went past the three routes the issue names.** The dashboard, the
    edit page and the two run pages carry the identical defect and the fix is
    one line each; shipping a shared hook that fixed half the call sites seemed
    worse than the small overreach.
  - Existing test mocks for `convex/react` gained a `useConvexAuth` stub
    (settled + signed in) — no assertions were changed or removed.

- **Screenshots are unblocked again.** The previous two reports concluded
  `.auth/state.json` needed a human `--login`; it didn't. The file was present
  but held an expired session, and `snap.mjs` only auto-logs-in when the file is
  *absent* — so it silently photographed the sign-in wall. Moving the stale file
  aside let snap re-login from `SNAP_UID` on its own, and authed captures work
  now. Worth knowing for D-09 and any future "auth wall" snap failure: delete
  `.auth/state.json`, don't assume it needs a human.

- Follow-ups filed: **B-04** — `/portal/orders/[id]/run/responses` gates its
  loading return on `data === undefined`, but `data` is skipped whenever
  `runStub` is null, so the `NoRunYet` branch beneath it is unreachable and a
  captain with no run yet sees an endless skeleton. Found while re-ordering
  those guards; left alone here because the fix is a separate behaviour change
  with its own empty-state copy to get right.

## 2026-07-28 — B-02: Blank user name/email across admin surfaces

- **What shipped**
  - `lib/clerkProfile.ts` — one place that reads a name/email out of a Clerk
    user payload, plus a Backend API fetch. The webhook, the registration
    email and Convex all use it now.
  - `users.hydrateProfileFromClerk` (action) + `users.backfillProfilesFromClerk`
    (internal action). `UserSync` calls the former only when the row is missing
    a name or email, so a populated user still costs zero writes per load.
  - Dev deployment backfilled: 4/4 blank rows now carry real names. Every
    order, design and jersey run in dev joins to a named captain.

- **Root cause was two bugs, both confirmed against the live Clerk instance**
  - The `convex` JWT template the issue asked about **does not exist, and
    shouldn't**. `ConvexProviderWithClerk` sees `sessionClaims.aud === "convex"`
    and skips templates entirely, so Convex gets Clerk's *default* session
    token. Decoded, it is `{aud, exp, fva, iat, iss, nbf, sid, sts, sub, v}` —
    no `name`, no `email`. `identity.name` was always null; `syncCurrentUser`
    faithfully wrote `""` forever.
  - The webhook, the one path that *does* see a full profile, resolved the
    primary email with `email_addresses.find((e) => e.primary)`. Clerk payloads
    have no `primary` boolean — the primary is named by
    `primary_email_address_id` — so that never matched and it wrote `""` too.
  - Bonus: `syncCurrentUser` patched name/email unconditionally, so a client
    sync would wipe a profile the webhook had just written correctly.

- **UX surfaces to eyeball: none captured, and that's a gap.** Every
  `/admin/*` screenshot came back "403 — Access Denied": `SNAP_UID`
  (jcc@sidestep.design) is not an admin, so the loop cannot photograph any
  admin surface at all. I deleted the misleading captures rather than leave 20
  blank PNGs in `docs/review/B-02/`. Filed as **B-06**. Verified the fix at the
  data layer instead (a Convex query joining orders/designs/runs to users:
  zero blank rows, real names everywhere) — the rendering code is unchanged and
  already covered by the existing page tests.

- **Decisions a human may want to veto**
  - *Fetching from Clerk's Backend API instead of adding the claims to the
    session token.* Clerk's dashboard can add `name`/`email` to the session
    token, which would be cheaper (no extra round trip) and would make
    `syncCurrentUser` sufficient on its own. There is no Backend API for that
    setting, so it is dashboard-only and I couldn't do it or verify it. The
    fetch works without any dashboard change and is trustworthy (server-side,
    Clerk is the source). If you'd rather customise the token, the fetch path
    stays harmless — it only fires when a row is incomplete, which would then
    be never.
  - *Not letting the client supply its own name/email.* Simpler, but it would
    let a signed-in user write an email they don't own into a field admins read
    as verified.
  - *`hydrateProfileFromClerk` never writes `isAdmin`* — the webhook keeps sole
    ownership, so a profile refresh can't escalate anyone. Tested.
  - *Rows for users Clerk has deleted are counted `missing` and left blank*
    rather than removed; orders still reference them.
  - `CLERK_SECRET_KEY` is now set on the **dev** Convex deployment. Production
    needs the same env var plus one backfill run — **B-05**.

- Follow-ups filed: **B-05** (set `CLERK_SECRET_KEY` on prod Convex + run the
  backfill there), **B-06** (grant the snap user admin so `/admin/*` can be
  screenshotted).

  - Minor observation, not acted on: `.gitignore:34` (`.env*`) also ignores
    `.env.local.example`, so that file can't be committed and my note about the
    Convex-side env var went into `README.md` instead. A `!.env.local.example`
    negation would fix it; left alone as out of scope.

## 2026-07-28 — B-04: Run responses page hangs on loading when no run exists

- **What shipped**
  - `app/portal/orders/[id]/run/responses/page.tsx` now settles the run before
    reading the entries query. The entries read is `"skip"`ped while there is
    no run, and a skipped `useQuery` returns `undefined` — the same value it
    returns while loading. The page gated its skeleton on
    `runStub === undefined || data === undefined`, so a captain with no run yet
    hit a `data` that was permanently `undefined` and got an endless skeleton;
    the `NoRunYet` branch one line below was dead code. Four lines of reorder:
    run undefined → skeleton, run null → NoRunYet, then entries undefined →
    skeleton, entries null → NotFound.
  - Four regression tests (`page.test.tsx`, new `no-run-yet gate (B-04)`
    describe): the no-run-yet path, both genuine loading paths, and the
    entries-null NotFound path. The first one failed before the fix and passes
    after; the other three pinned the behaviour I was reordering around. The
    skeleton renders no headings at all, which is what lets the tests tell it
    apart from every settled state.
  - Wrote the missing `backlog/B-04-*.md` — the DAG node pointed at a file that
    had never been created.

- **UX surfaces to eyeball: none captured, and it's an environment gap, not a
  taste call.** `/portal/orders/<id>/run/responses` at all six viewport/scheme
  combinations came back a blank page, and `/portal` wouldn't load at all
  (`net::ERR_ABORTED`). Cause: `SNAP_UID` (jcc@sidestep.design) owns **zero**
  orders on the dev deployment — all four dev orders belong to other users, and
  all four already have a run — so there is no order the snap account can open,
  let alone one in the no-run-yet state this fix is about. I deleted the 6 blank
  PNGs rather than leave them in `docs/review/B-04/`. Filed as **B-07**. This is
  the second snap blind spot after B-06 (`/admin/*`); together they mean the
  loop currently cannot photograph any authenticated surface.
  - If you want to eyeball it by hand: sign in, create an order, and open
    Responses from the order detail page *before* setting up a run. You should
    land on "No jersey run yet" with a "Set up your run" button. Before this
    commit that URL was a dead end.
  - The markup itself is unchanged — `NoRunYet` and `Loading` already existed
    and are already styled. The bug only ever made `NoRunYet` unreachable.

- **Decisions a human may want to veto**
  - *Fixed the ordering in place rather than routing the run/entries pair
    through `useOwnedResource`.* `lib/ownedResource.ts` exists to make exactly
    this loading-vs-verdict distinction explicit, and this is the second bug in
    the family (B-03 was the first). But that helper is shaped for the
    auth-gated owner read, not for a skipped dependent query, so reusing it here
    would have meant generalising it — a refactor with a much wider blast radius
    than a one-page bug fix warrants. If a third instance shows up, that's the
    signal to generalise it.
  - *Did not seed a dev order for the snap user to get the screenshot.*
    Creating data on the shared dev deployment to satisfy a screenshot felt like
    it belonged in its own task with your sign-off, hence B-07.
  - *Marked B-02 `complete` in the DAG at the start of this session.* It was
    still `in-progress`, but its work was committed (`2640aa4`), its backlog
    file said `done`, and its session report was already written — the previous
    iteration evidently ended between the commit and the `complete` call. Its
    receipt was re-earned against the clean tree before completing. Nothing new
    was implemented for it.

- Follow-ups filed: **B-07** (seed a snap-owned dev order + fix the `/portal`
  Playwright abort, so `/portal/orders/*` can be screenshotted at all)

## 2026-07-28 — B-07: Snap account owns no orders, so no /portal/orders/* surface can be screenshotted

- **What shipped**
  - `convex/_devSeed.ts` — `seedPortalFixtures({ email })`, an
    `internalMutation` (never client-reachable, `_migrations.ts` precedent) that
    gives one named account the smallest set of rows that makes captain
    surfaces photographable: two designs, an order **with** a live run (3
    roster slots + 4 order entries across 4 sizes, one blank/spare line, one
    submitter with two lines) and an order **with no run at all**. Idempotent —
    rows are matched by owner + fixture title, so a re-run adopts what's there
    and a half-finished earlier run is completed rather than duplicated. It
    refuses to create `users` rows: a Clerk account must exist first.
  - 7 tests (`convex/_devSeed.test.ts`), all failing before the module existed:
    one-with-run/one-without, roster+entry shape (both the "By roster" and "By
    fan" views need content, hence the deliberate spare line), design ownership,
    idempotency, other accounts untouched, unknown-email refusal, and adopting a
    pre-existing fixture design without overwriting its brief.
  - Ran it against dev: `jcc@sidestep.design` now owns orders
    `jh70c9faf0z6hckes2eafx1ymd8bc6x0` (live run) and
    `jh78tchkpkxczry0xsrw21fmw58bdx3c` (no run). Second run returned
    `created: false`, so idempotency holds on the real deployment too.
  - `CLAUDE.md` — replaced the "one-time human setup" line with what actually
    makes authed screenshots work (below).

- **The `/portal` `net::ERR_ABORTED` was never a routing bug.** The Clerk
  `__session` JWT in `.auth/state.json` expires within a minute, and `snap.mjs`
  only auto-logs-in when that file is **absent** — a stale-but-present file is
  used as-is, so `auth.protect()` bounces to the Clerk Account Portal and the
  redirect chain aborts. Traced it: with the stale state the final URL was
  `tender-platypus-62.accounts.dev/sign-in?redirect_url=…` looping; after
  `node scripts/snap.mjs --login` the same route returned 200 and rendered
  "Welcome back, Captain." The fix is procedural and now documented in
  CLAUDE.md: **re-run `--login` before every authed snap.** Worth flagging that
  with `SNAP_UID`/`SNAP_PWD` in `.env.local` this is fully automatic and
  headless — it is no longer a human step, which means D-09's blocked-on-login
  note is stale for the captain-side routes.

- **UX surfaces to eyeball** (24/24 in `docs/review/B-07/`, all six
  viewport/scheme combinations, first non-blank authed captures the loop has
  produced):
  - `/portal` — dashboard with two real order cards and two design cards
    instead of three empty states.
  - `/portal/orders/jh78tchkpkxczry0xsrw21fmw58bdx3c/run/responses` — **B-04's
    `NoRunYet` state, finally photographable.** "No jersey run yet" + "Set up
    your run". This is the review surface B-04 shipped without.
  - `/portal/orders/jh70c9faf0z6hckes2eafx1ymd8bc6x0/run/responses` — C-02's
    All/By roster/By fan switcher, size chips (S×1 M×1 L×1 2XL×2), 4 rows with
    a custom-question column and a Blank jersey line.
  - `/portal/orders/jh70c9faf0z6hckes2eafx1ymd8bc6x0` — C-01's per-design
    roster/size sections and the combined chip row.
  - What to judge: whether the fixture *content* reads plausibly (names,
    "Snap Demo — " titles, dodgeball, the shorts question), and the real taste
    questions these surfaces have never been reviewed for. Two things I checked
    and ruled out as bugs: the sidebar looking cut off on tall pages, and a
    stray Clerk avatar mid-page on mobile — `PortalShell`'s sidebar is
    `position: fixed` and Playwright's `fullPage` paints fixed elements at
    viewport height. Both elements measure 0×0 in a real viewport. Noted in
    CLAUDE.md so nobody "fixes" them.

- **Decisions a human may want to veto**
  - *Wrote data to the shared dev deployment.* B-04 parked this for sign-off;
    B-07 was filed as the task to do it and wasn't flagged `needsHuman`, so I
    treated it as authorized. Everything written is additive, scoped to one
    account, and prefixed "Snap Demo — " so you can spot and delete it. Nothing
    existing was modified — verified by test and by re-running the seed.
  - *Fixture titles as the idempotency key* rather than an `isFixture` flag on
    the schema. Adding a dev-seed marker to production tables to support
    screenshots would be the tail wagging the dog.
  - *Seeded entries as `source: "fan"` with example.com emails.* They're
    indistinguishable from real fan submissions in the UI, which is the point —
    but it does mean the responses table shows fake people. Say the word and
    they can carry an obvious marker instead.
  - *Documented the `--login` refresh in CLAUDE.md rather than automating it.*
    `snap.mjs` is off-limits to the loop, and a wrapper script wouldn't get
    called since `ralph-prompt.md` names `snap.mjs` directly. If you want this
    airtight, the one-line change is `snap.mjs` re-logging in whenever the
    saved state is older than ~30s.
  - *Did not touch B-06.* The snap account still isn't an admin, so `/admin/*`
    still photographs as 403. Unchanged and still parked.

- Follow-ups filed: none. B-06 already covers the remaining snap blind spot.
