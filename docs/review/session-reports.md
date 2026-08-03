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

## 2026-07-28 — M-01: Unified Roster Read + Design-Card Roster Preview

- What shipped:
  - `rosterEntries.listForRun` now carries, per slot, the **sizes ordered
    against it** (`{size, qty}[]` in canonical order) and their `total`, plus
    each design's **blank/bulk lines** (`blankSizes`) — the order entries with
    no slot behind them. All of it rides on the single order-entry scan the
    query already did for `filled` / `collision`; no extra reads.
  - New pure derivation `rosterRowsByDesign` in `lib/jerseyBreakdown.ts` turns
    that read into render-ready rows — slots and the design's blank line in one
    list — and a `DesignRosterPreview` component renders it on each design card
    of `/portal/orders/[id]`.
  - The order page's design cards **stop reading order entries** for their
    roster. A captain-seeded player nobody has ordered for is now visible on
    the card as a muted "Not yet filled" row instead of being invisible — the
    disagreement between this page and the roster editor (PRD §1) is gone.

- UX surfaces to eyeball (screenshots in `docs/review/M-01/`):
  - `/portal/orders/<live-run order>` — **Home Kit** is the interesting card:
    2 filled slots (M, L), 4 muted unfilled, then "+ 9 more". Look at whether
    the muted rows read as "seeded, waiting" rather than as an error, and
    whether "+ 9 more" reads as *there's more* rather than *that's all*.
  - Same page, **Away Kit** — one filled slot plus the italic `Blank` row
    carrying `2XL ×2`, i.e. a spare nobody's name is on.
  - `/portal/orders/<no-run order>` — a design with no run at all: dashed
    "No jerseys collected yet", no roster list, no crash and no "0 jerseys"
    where "not started" is meant.

- Decisions I made that a human may want to veto:
  - **Preview cap = 6 rows** (PRD §10 open question, decided against a real
    15-player card — see the Home Kit capture). Six is enough to recognise the
    roster as yours and read the first few names without the card growing
    taller than the order it summarises; the full list is the sheet's job
    (M-02). The alternative in the PRD, scaling to available height, would make
    two cards on one page disagree about how much roster they show.
  - **Slots keep creation order**, not the alphabetical production-line sort
    `rosterLinesByDesign` uses. The card and the editor have to list the same
    people in the same sequence, and creation order is what the editor (and,
    per PRD §4, the roster generally) uses today.
  - **Blank lines aggregate into one `Blank` row per design**, sizes as chips
    (`2XL ×2`), rather than one row per size. Keeps a bulk order from eating
    the cap.
  - **`collision` is carried in the row type but not rendered on the card.**
    PRD §5 puts collisions in the sheet; a warning badge on a summary the
    captain can't act from would be noise. M-02 renders it.
  - **Kept `jerseyRuns.listOrderEntries` on the page** (the impl note asked me
    to consider dropping it). It's still the only feed for the order-wide
    `SizeBreakdown`, whose props C-01 deliberately froze as entry-array-shaped
    for reuse by the responses page. Dropping it would mean reshaping a
    component two pages share to save one query.
  - **Added `_devSeed:seedLargeRoster`** (dev-only `internalMutation`, tested,
    idempotent) and ran it against the dev deployment. It tops the fixture
    order's home kit up to 15 slots, leaving the extras unordered — the cap
    question is unanswerable against B-07's 3-slot, fully-filled fixture. It
    only ever *adds* unfilled slots; existing slots and every jersey are
    untouched (asserted by test and by the screenshots).
  - `RosterLines` / `rosterLinesByDesign` are **untouched** — the responses
    page (C-02) still reads them, per the issue's instruction.

- Follow-ups filed: none.

- Verification pass (2026-07-28, follow-up session): `node scripts/verify.mjs`
  green — typecheck, lint (0 errors, 3 pre-existing warnings), 1011 tests
  across 56 files, build. Screenshots for both the live-run and no-run orders
  are present in `docs/review/M-01/` at 375/768/1280, light + dark.

- Defect found and fixed while verifying: `lib/jerseyBreakdown.ts` contained a
  **raw NUL control character** in its source — `rosterLinesByDesign` used one
  as the separator in its merge key (`\`${label}<NUL>${entry.size}\``). Git
  classified the file as binary, so M-01's own ~3.5KB change to it showed up
  as "Binary files differ" and was unreviewable by `git show` or
  `/review-batch`. Replaced with the escape `\u0000` — identical byte at
  runtime — plus a comment on why the separator exists and why it must stay
  escaped. Pre-existing since C-01, not an M-01 regression; fixed here because
  it blocked review of M-01. Committed separately (`811ee3a`).

## 2026-07-28 — M-02: Roster Sheet on Design Cards

- What shipped:
  - `components/portal/RosterSheet.tsx` — the per-design roster editor, opened
    from a **Manage roster** button on each design card of
    `/portal/orders/[id]`. Inline add / edit / remove, the `filled` /
    `not yet filled` treatment, each filled slot's ordered sizes, and the
    **collision** flag M-01 computed and the UI dropped ("Two people claimed
    this"). No query of its own: the page hands it the slots it already read
    for the card preview, so preview and editor cannot drift apart again.
  - **Locked runs open read-only** — no add row, no edit/remove, and the
    description says why. Read from the run's `effectiveStatus`, so a run that
    auto-locked past its deadline (R-06's lazy lock, reachable with no lock
    control anywhere) renders correctly.
  - **`RosterManager` is deleted.** Its mount in `JerseyRunSetup` is replaced
    by a link back to the order page; Run Setup keeps only the share link,
    summary, and custom questions.

- UX surfaces to eyeball (screenshots in `docs/review/M-02/`):
  - `roster-sheet-open-w{375,768,1280}-{light,dark}.png` — **the review
    surface for this slice**: the sheet open on the 15-player Home Kit. Judge
    the row density (name on one line, state/size badges under it), whether
    the pencil/× pair reads as edit/remove without labels, and whether the
    375px add row (`Player name` / `No.` / `Add`) is typeable one-handed.
  - `portal-orders-jh70c9...-w*.png` — the cards themselves: **Manage roster**
    sits under the 6-row preview on both designs.
  - `portal-orders-jh78tc...-w*.png` — the no-run order: "Set up a run below to
    start building this design's roster" where the button would be.
  - `portal-orders-jh70c9...-run-setup-w*.png` — Run Setup with the roster
    editor gone, ending in "Manage rosters on your order page →".
  - The Clerk avatar overlapping the 375px add row is the artifact CLAUDE.md
    already documents (fixed-position element, 0×0 in a real viewport).

- Decisions I made that a human may want to veto:
  - **The trigger reads "View roster" when the run is locked**, not "Manage
    roster". The issue's criterion says Manage roster; on a locked run that
    would promise an editor the sheet deliberately doesn't offer.
  - **One sheet width, `w-full` under `sm` and a right-side panel above it**,
    rather than the PRD's "bottom sheet at 375px". Base UI's `side` is static,
    so a true bottom sheet needs a media-query hook; full-bleed from the right
    gives the same 375px working width for free. Both width classes carry the
    `data-[side=right]` prefix — the primitive's own width is variant-prefixed
    and tailwind-merge only overrides across matching variants. The first pass
    without the prefix silently rendered at 3/4 width; caught in the captures.
  - **Collision copy: "Two people claimed this."** Amber, no resolve action —
    PRD §6 says surfaced-only.
  - **The sheet takes slots as props instead of querying.** Deliberate, per the
    issue: a second `listForRun` subscription is exactly the drift M-01 exists
    to prevent.
  - **Screenshots of the open sheet were captured with a throwaway Playwright
    script** (temp dir, not committed) mirroring `snap.mjs`'s contexts —
    `snap.mjs` only navigates, and this slice's whole surface is behind a
    click. `snap.mjs` itself is untouched.

- Follow-ups filed: none.

## 2026-07-28 — M-03: Bulk Paste Roster Import

- What shipped:
  - `lib/rosterEntry/paste.ts` — a pure, DOM-free `parseRosterPaste(text,
    existing)`. TSV, CSV, and single-column trailing-number all land; the
    `Name⇄Number` order is decided **per row** by which cell is digits, so a
    block with the columns swapped halfway through still parses. Rows come
    back classified `new` / `existing` / `duplicate` / `invalid`, each excluded
    one carrying its own user-facing reason. `rosterSlotKey(name, number)` was
    extracted from `rosterMatchKey` so paste dedupe, fan attach, and M-04's
    mirror share one normalization.
  - `rosterEntries.createMany` — the commit. Same gates as `create`
    (ownership, lock, design-on-order, per-row name/number rules), plus a
    200-row bound. Validates the whole batch before writing any of it.
  - **Paste preview in the roster sheet.** "Paste a list" swaps the sheet body
    for a textarea + a row-by-row preview + a confirm button that states the
    real count ("Add 3 players", disabled and reading "Nothing to add" when
    there's nothing new). Nothing is written until it's pressed; there is no
    undo, per PRD §6.

- UX surfaces to eyeball (screenshots in `docs/review/M-03/`):
  - `paste-preview-w{375,768,1280}-{light,dark}.png` — **the review surface**:
    one paste exercising every state at once (a row already on the roster, a
    row repeated inside the paste, a number-only row, and both column orders).
    Judge whether the excluded-row treatment (dashed, muted, reason badge)
    reads as "skipped, not lost", and whether the summary line
    ("3 to add · 1 already there · 1 repeated · 1 couldn't be read") is the
    right density at 375px, where it wraps to two lines.
  - `roster-sheet-w{375,1280}-{light,dark}.png` — the sheet's normal state,
    for where "Paste a list" sits relative to the add row.
  - `portal-orders-jh70c9...-w*.png` — the cards, unchanged by this slice.
  - The Clerk avatar over the 375px footer is the artifact CLAUDE.md documents.

- Decisions I made that a human may want to veto:
  - **Paste replaces the sheet body rather than sitting above the roster.** A
    textarea plus fifteen preview rows plus the roster underneath is a scroll
    nobody reads at 375px, and the preview is a decision the captain has to
    finish before anything else matters.
  - **"Paste a list" is a ghost button under the add row**, not a tab or a
    header action — it reads as the alternative to the row above it. It is the
    lowest-emphasis thing in the footer, which may be too quiet for the feature
    the PRD calls out as the reason this slice exists.
  - **`createMany` does not dedupe server-side.** The client previewed this
    exact array against the design's roster and the captain approved a count;
    silently dropping rows server-side would make the mutation disagree with
    the button they pressed. Two tabs racing can therefore produce a duplicate
    slot — same outcome as adding it twice by hand.
  - **A number-only row is invalid**, not a slot named "99". A three-column row
    is invalid too, rather than guessing which two columns were meant.
  - **The batch bound is 200 rows**, and a paste over it is refused whole
    rather than truncated — no preview, no partial commit.
  - **Verified against the deployed mutation** with a throwaway Playwright
    script (temp dir, not committed): pasted onto the away design, confirmed
    the three slots landed, then removed them so the fixture is unchanged. The
    preview captures came from the same kind of script — `snap.mjs` navigates
    only, and this surface is two clicks deep. `snap.mjs` itself is untouched.

- Follow-ups filed: none.

## 2026-07-28 — M-04: Mirror Roster Between Designs

- What shipped:
  - `rosterEntries.copyToDesign` — additive slot copy from one of the order's
    designs onto another, deduped server-side on `rosterSlotKey(name, number)`
    (the same normalization fan-attach and the paste preview use), returning
    `{ copied, skipped }`. Gates ownership, a locked run, either design not
    being on the order, and copying a design onto itself.
  - `planRosterCopy` / `describeRosterCopy` in `lib/rosterEntry/mirror.ts` —
    pure, so the rule the mutation writes by and the sentence the captain
    reads come from one place.
  - A **"Copy roster from ▾"** menu in the roster sheet's footer, beside
    "Paste a list", listing the order's other designs. Picking one is the
    action; the outcome lands as a toast.

- UX surfaces to eyeball (screenshots in `docs/review/M-04/`):
  - `mirror-menu-w{375,768,1280}-{light,dark}.png` — **the review surface**:
    the sheet for the away kit with the source menu open. Judge whether
    "Copy roster from" is discoverable enough sitting as a second ghost button
    next to "Paste a list", and whether the menu opening *upward over the add
    row* (it's the bottom-most control, so Base UI flips it) is acceptable or
    wants the control moved into the sheet header.
  - `mirror-result-copied-w375-light.png` — a real copy of the home kit's 15
    players onto the away kit: every copied slot lands "Not yet filled", and
    the pre-existing filled slot (Riley Tran #23, size S) is untouched at the
    top. Toast reads "15 copied".
  - `mirror-result-skipped-w375-light.png` — the re-run, which copies zero:
    "Nothing to copy — all 15 players are already here." This is the message
    PRD §9 asks to be judged reassuring rather than alarming.
  - `portal-orders-jh70c9...-w*.png` — the cards, unchanged by this slice.
  - The Clerk avatar over the 375px footer is the artifact CLAUDE.md documents.

- Decisions I made that a human may want to veto:
  - **A dropdown menu, not a select + confirm button.** Picking the source is
    the whole action — the copy only ever adds and silently skips, so there is
    nothing to confirm. A `<Select>` would leave a chosen-but-not-yet-applied
    state on screen that means nothing.
  - **`copyToDesign` dedupes server-side**, unlike `createMany` — deliberately
    the opposite call. The paste's payload was previewed row by row and
    approved as a count; here the captain pressed one button, so the skip has
    to be decided against the roster as it stands at write time.
  - **A slot repeated inside the *source* copies once**, counting as a skip.
    Nothing dedupes `create`, so a source roster can hold two of the same
    player, and copying both would plant exactly the duplicate the skip rule
    exists to prevent.
  - **Every source design is offered, including empty ones** — an empty source
    reports "that design has no players yet" rather than being hidden, so the
    menu doesn't silently change shape as rosters fill.
  - **Copying is offered on a locked run's sheet: no.** The control is absent
    read-only, matching add/edit/remove/paste.
  - **Verified against the deployed mutation** with a throwaway Playwright
    script (not committed): copied the home kit onto the away kit, captured
    both messages, then removed the 15 created slots — confirmed via a
    read-only query that the fixture is back to its seeded 16 rows.
    `snap.mjs` navigates only, and this surface is two clicks deep;
    `snap.mjs` itself is untouched.

- Follow-ups filed: none.

## 2026-07-28 — M-05: Run Setup Slimming — Fixed Sizes, Names Mode Relocation, Start Collecting

- What shipped:
  - **Sizes stop being a captain decision.** `jerseyRuns.create` drops its
    `sizeOptions` argument and writes the whole 8-size catalog from the
    `SIZE_OPTIONS` constant. The field stays on the row, so pre-existing runs
    keep the narrower list they were created with and `checkSize`,
    `lockSnapshot` and the admin views are untouched (PRD §5, no migration).
  - **Creation moved to the order page** as a "Start collecting" dialog taking
    only a deadline. `/portal/orders/[id]/run/setup` is management-only now:
    share link, status, deadline, custom questions, links to responses and
    rosters. No lock control anywhere (R-08 stays parked).
  - **`jerseyRuns.setNamesMode`** — `namesMode` was write-once at create. The
    control now sits beside the designs on the order page and switches freely
    both ways, and a **fixed-mode design with zero slots** warns inline
    ("Nobody can order this design") without blocking anything.

- UX surfaces to eyeball (screenshots in `docs/review/M-05/`):
  - `portal-orders-jh70c9...-w*.png` — the live-run order. **The review
    surface**: the *Names & numbers* card now sits between the Designs heading
    and the size-breakdown chips. Judge whether that is where it belongs, or
    whether it crowds the run of design cards underneath.
  - `portal-orders-jh78tc...-w*.png` — the no-run order: "Start collecting"
    where "Set up your run" used to be, and no names-mode control at all
    (there is no run to switch).
  - `dialog-start-collecting-w{375,1280}-{light,dark}.png` — the creation
    dialog, one date field. Judge whether one field deserves a dialog rather
    than an inline date + button in the Collect card.
  - `portal-orders-jh70c9...-run-setup-w*.png` — the slimmed `/run/setup`:
    "Manage collecting", share link, deadline, questions, Save changes.
  - `names-mode-fixed-w{375,1280}-light.png` + `public-form-fixed-w*.png` —
    the switch driven through the real UI against the deployed mutation, and
    the public form it produces (roster picker instead of free text). The
    fixture was switched back to open afterwards and verified.
  - Sidebar-mid-page in the tall captures is the documented `position: fixed`
    artifact, not a regression.
  - **Not photographed: the fixed + empty-design warning.** No fixture design
    is empty on a run — both snap designs carry slots — and manufacturing one
    would mean either damaging B-04's no-run fixture or deleting seeded rows.
    It is covered by two component tests (appears in fixed mode with zero
    slots, gone with the first slot). To see it live: start collecting on
    "Snap Demo — No Run Yet", switch to Fixed roster, and the warning is
    immediate (that design has no slots on the new run).

- Decisions I made that a human may want to veto:
  - **Added `jerseyRuns.updateSettings`, which the issue didn't ask for.**
    Creation now takes only a deadline, so with the old setup form gone there
    would have been no way to set custom questions at all — the slice would
    have silently deleted a feature. `/run/setup` therefore *edits* deadline +
    questions (ownership-gated, rejects a locked run) rather than displaying
    them read-only.
  - **A run is always created `open`.** Names mode is a choice about a roster
    that doesn't exist yet at creation time, so asking at the dialog would
    re-add the field the slice removed.
  - **A closed or locked run drops the settings form** for a read-only summary
    instead of showing disabled inputs — every save would reject server-side.
  - **`/run/setup` no longer shows sizes or names mode at all**, not even as
    summary rows. Sizes are an implementation detail nobody edits, and a
    second read-only copy of names mode would compete with the live control on
    the order page.
  - **The responses page's "no run yet" CTA now points at the order page**
    ("Start collecting"), since `/run/setup` can no longer create a run.
  - Fixed a pre-existing copy bug carried into the new form: "Ask up to 5extra
    questions" → "Ask up to 5 extra questions".

- Follow-ups filed: none.

---

## 2026-07-30 — N-01: Adopt Motion and Convert the Pricing Spotlight

- What shipped:
  - `motion@12.43.0` installed; `<MotionConfig reducedMotion="user">` wraps the
    app inside `ConvexProviderWithClerk` in `app/providers.tsx`. New
    `lib/motion.ts` holds the whole motion vocabulary — `SPRING_SPOTLIGHT`,
    `SPRING_SNAPPY`, `REVEAL_DURATION`/`REVEAL_OFFSET`/`STAGGER_STEP`,
    `REVEAL_TRANSITION` — so later issues in this track have tokens to draw on.
  - `PricingSection`'s hand-rolled FLIP is gone: no `ResizeObserver`, no
    `offsetLeft`/`offsetTop` measurement, no rect equality guard, no
    `SpotlightRect` type, no first-paint ring fallback, no `useEffect`/`useRef`.
    A single `<motion.div layoutId="tier-spotlight">` renders inside the spotlit
    card's `relative` wrapper and Motion FLIPs it. Component went 241 → 178
    lines. Zero `ResizeObserver` or inline bezier literals remain anywhere in
    `components/`.
  - New `scripts/check-reduced-motion.mjs` drives the spotlight in both
    `no-preference` and `reduce` contexts and asserts movement in one, none in
    the other. Current run: 30 in-flight positions vs 0. CLAUDE.md gains an
    "Animation: CSS vs Motion" section stating the boundary and the rules.

- UX surfaces to eyeball: `/` — the pricing section (screenshots in
  `docs/review/N-01/`, including `grid-*.png` close-ups of the tier grid).
  - **The main taste call is the spring.** Type quantities across 9/10, 24/25,
    49/50 and judge whether `SPRING_SPOTLIGHT` (stiffness 320, damping 32,
    ~0.5s with one soft overshoot) reads premium or bouncy. Open question 3 in
    the PRD parks exactly this; it is a one-line edit in `lib/motion.ts`.
  - At 768px the grid wraps to two rows and the spotlight travels diagonally
    between rows rather than sliding along one — worth a look, it is new
    behaviour the old measured version also had but nobody has watched closely.
  - Hammer the quantity input to confirm interruption mid-flight feels right.

- Verified beyond the acceptance criteria: a throwaway Playwright pass checked
  the spotlight's rect against the correct card's rect at all six tier
  boundaries × 375/768/1280 — 18/18 exact (dx/dy/dw/dh all 0, `aria-current`
  on the right card). Alignment is now structural (`absolute inset-0` in the
  card's wrapper), not measured, so it cannot drift.

- Decisions I made that a human may want to veto:
  - **`MotionConfig` sits inside the Convex/Clerk providers, not above them.**
    The issue said "inside ThemeProvider"; putting it innermost keeps the
    provider ordering that auth depends on untouched. It is context-only, so
    depth doesn't affect behaviour.
  - **Each tier card gained a `relative h-full` wrapper div and the `Card`
    gained `h-full`.** The wrapper is required (the frame must sit outside
    `Card`'s `overflow-hidden`), and it becomes the grid item — so `h-full`
    restores the equal card heights that grid stretch used to give directly.
  - **The frame is `absolute inset-0` rather than a measured box.** That is why
    the fallback ring could be deleted outright: the frame is correct on first
    paint by construction, so there is no unmeasured moment to cover.
  - **`lib/motion.ts` ships tokens N-01 does not itself use** (`SPRING_SNAPPY`,
    the reveal trio). They are the vocabulary MO-2…PO-4 were specced against;
    landing them here keeps those issues from each inventing their own.
  - **The spotlight keeps `data-testid="tier-spotlight"`** — the reduced-motion
    script needs a stable handle on a decorative, `aria-hidden` element.

- Follow-ups filed: none.

## 2026-08-01 — N-02: Reveal Wrapper and Landing Section Reveals

> Closeout note (separate iteration): the implementation below was committed in
> `72f0812` but the DAG node was left `in-progress` — the `complete` call never
> ran. Re-verified against the committed tree (typecheck + lint + 1162 tests
> green, `check-reduced-motion.mjs` PASS), re-read the `docs/review/N-02/`
> stills to confirm every section is settled and readable rather than caught
> mid-reveal, then marked the node completed. No code changed. N-04 is now
> unblocked.

- What shipped:
  - `components/motion/Reveal.tsx` — a client wrapper that fades and rises its
    `children` on first scroll into view (`whileInView`, `viewport.once`). All
    six landing sections are wrapped in `app/page.tsx`; none of them became a
    client component.
  - `lib/motion.ts` gained `REVEAL_AMOUNT`, `revealTransition(delay)` (the shape
    N-04's stagger needs) and `INSTANT`. No timing literal lives in `Reveal`.
  - `scripts/check-reduced-motion.mjs` now covers a section reveal alongside the
    spotlight, sampling transform translateY rather than viewport position —
    the trigger for this animation *is* a scroll, so a viewport-relative sample
    could not separate the reveal from the scrolling that caused it.

- UX surfaces to eyeball: `/` at 375/768/1280, light and dark
  (`docs/review/N-02/`). Screenshots are the *settled* state by design — the
  feel has to be judged in a real browser: scroll top to bottom, then back up
  (nothing should replay). **This is the first look at the site's animation
  feel; `REVEAL_DURATION` (0.5s), `REVEAL_OFFSET` (24px) and the easing curve
  are a starting guess, and tuning them is a one-line edit to `lib/motion.ts`.**
  Whole-section reveals are the coarsest possible grain — N-04 adds per-card
  stagger inside Process and Pricing, which may be where the effect earns its
  keep.

- Decisions I made that a human may want to veto:
  - **`<Reveal>` settles instantly when `navigator.webdriver` is true.** This is
    the one that deserves scrutiny. Playwright takes `fullPage` screenshots by
    painting the whole document without ever scrolling it, so
    IntersectionObserver never fires below the fold — the first `snap.mjs` run
    filed five blank sections as the review artifact. `snap.mjs` is off-limits
    to me, and no timer fits inside its 1s settle budget, so the fix had to live
    in `Reveal`. `navigator.webdriver` means "nothing here is going to scroll",
    which is exactly when holding content back buys nothing. Cost: a line of
    automation-awareness in shipped code, and stills that show the end state
    rather than the animation. `check-reduced-motion.mjs` opts back out of it
    via `addInitScript` and asserts the movement frame by frame, so the
    animation itself is still covered by something automated.
  - **A per-instance `<noscript>` stylesheet forces `[data-reveal]` visible.**
    Motion serializes `initial` into the server HTML as inline `opacity: 0`, so
    without this the page is six invisible sections for anyone without JS. Six
    inert copies in the no-JS path beat one copy somewhere else that can be
    deleted without anyone connecting it to `Reveal`.
  - **Under reduced motion the section still starts 24px offset and snaps to
    rest.** `MotionConfig reducedMotion="user"` suppresses the *animation* but
    not the `initial` transform, and removing the offset would need a
    client-only read that disagrees with the server's HTML. The check asserts
    what actually matters: zero intermediate positions, and opacity 1 when it
    settles. Revealed content is never left invisible.
  - **`vitest.setup.ts` stubs `IntersectionObserver`** (jsdom has none, and
    Motion throws constructing one). It never reports an intersection, which is
    the honest jsdom behaviour — nothing is ever on screen.
  - **Hero is wrapped too**, per the acceptance criteria. N-03 replaces it with
    a load-triggered entrance.

- Follow-ups filed: none.

## 2026-08-01 — N-03: Hero Entrance on Load

- What shipped:
  - `HeroSection` is now a client component with a variants parent staggering
    six children (eyebrow, headline, subcopy, CTA row, footnote, carousel) on
    mount. Opacity and `y` only — the hero holds the LCP, so nothing that
    reflows is animated.
  - New hero tokens in `lib/motion.ts` (`HERO_OFFSET` 12px, `HERO_STAGGER_STEP`
    0.06s, `HERO_DELAY` 0.05s, `HERO_TRANSITION` 0.45s on the site's one easing
    curve). Last element is at rest ~0.80s after paint.
  - `scripts/check-reduced-motion.mjs` now covers a third animation: the hero
    entrance, recorded from document start via `addInitScript` because its
    trigger is mount and cannot be performed by the script. Passing run:
    hero no-preference 12 frames in flight, hero reduce 0, both settling at
    y 0 / opacity 1.

- UX surfaces to eyeball: `/` (screenshots in `docs/review/N-03/`, 375/768/1280
  light+dark). Hard-reload the landing page and watch the hero settle top-to-
  bottom with the jersey carousel arriving last — the taste call is whether that
  order and the 12px rise read as "considered" or as "slow". Then scroll down
  and back up: the hero must not re-animate, and the section below it (Process)
  should still reveal on its own. The stray dark circle at the left edge just
  under the hero in the 1280 captures is the Next dev-tools indicator, a
  fixed-element artifact of `fullPage` capture — zero-sized in a real viewport.

- Decisions I made that a human may want to veto:
  - **The hero no longer sits inside `<Reveal>` in `app/page.tsx`.** Keeping it
    would double-animate: a whole-section 24px fade plus a per-element stagger
    fighting over the same content. The load entrance replaces it, which is what
    the issue asked for; `page.tsx` now carries a comment explaining the
    exception.
  - **The two hero CTAs were `<Button><Link/></Button>`** — literally
    `<button><a/></button>`, invalid HTML and a hydration error that the
    `"use client"` conversion would have started surfacing. Rewrote them as
    `buttonVariants` on `<Link>`, the pattern CLAUDE.md documents. Same pixels
    (compare against N-02's captures), correct semantics: screen readers now
    announce "link", not "button". Out of the literal scope of N-03; I judged
    shipping a known hydration error into a freshly-client component worse.
  - **The hero settles instantly for `navigator.webdriver` renderers**, reusing
    `Reveal`'s escape hatch rather than inventing a second one. `snap.mjs` waits
    a fixed 1000ms after `domcontentloaded`; the entrance finishes ~800ms after
    *hydration*, so without this the review artifact is a race. The animation
    stays covered — `check-reduced-motion.mjs` opts back out and asserts it
    frame by frame.
  - **`useUnscrolledRenderer` and the no-JS fallback are now shared.**
    `Reveal.tsx` exports the hook and a `<NoScriptRevealFallback/>` component;
    the fallback stylesheet moved to `lib/motion.ts`. Both entrances mark their
    elements `data-reveal`, so one CSS rule covers the whole site's armed
    content. The alternative was a third file for two exports.
  - **Reduced motion still arms the 12px offset in the server HTML** and snaps
    to rest on hydration, same as the section reveals — unchanged behaviour,
    noted here only because the new hero assertions make it visible in the
    check's output.

- Follow-ups filed: none.

## 2026-08-01 — N-04: Staggered Process and Pricing Card Entrances

- What shipped:
  - New `components/motion/Stagger.tsx` — `<StaggerGroup>` / `<StaggerItem>`,
    the card-level counterpart to `<Reveal>`. The group owns the trigger
    (`whileInView`) and the timing (`staggerChildren`); the item owns the
    appearance (opacity + 12px rise) and takes its cue from the group through
    variant propagation. `as` picks the tag, so a list of steps stays an `<ol>`
    of `<li>`s.
  - `ProcessSection`'s three step cards and `PricingSection`'s four tier cards
    now arrive in sequence. Last card lands ~0.74s after the section enters
    view (`STAGGER_STEP` 0.08s × 3 + `REVEAL_DURATION` 0.5s).
  - New `STAGGER_OFFSET` (12px) token — half a section reveal's travel, because
    the card is already inside a section rising 24px and the two compose.
  - `scripts/check-reduced-motion.mjs` now covers a fourth animation: the last
    process step card, proving the *inherited* variant path is suppressed and
    not just the one set on the element. Passing run: card no-preference 15
    frames in flight, card reduce 0, both settling at y 0 / opacity 1.

- UX surfaces to eyeball: `/` (screenshots in `docs/review/N-04/`, 375/768/1280
  light+dark, all cards settled). Scroll the Process and Pricing sections into
  view at 1280 and watch the cards arrive left-to-right inside the section that
  is itself rising. The taste call is whether two layers of motion on the same
  content reads as considered or as fussy — the fallback if it is fussy is to
  drop `STAGGER_OFFSET` to 0 and let the cards fade in place, which is a
  one-token edit in `lib/motion.ts`. Second taste call: at 375px the cards are
  stacked, so the same stagger plays as a top-to-bottom cascade over a taller
  distance; check it does not feel slow on mobile.

- Decisions I made that a human may want to veto:
  - **`ProcessSection` stays a server component** — the issue recommended
    converting it to `"use client"`. It does not need to. Variants reach a
    child through React context, not through markup ownership, so handing each
    server-rendered card to `<StaggerItem>` as `children` gets the per-card
    stagger with the client boundary staying inside `components/motion/`. This
    is the same architectural move `<Reveal>` already makes one level up, and
    it resolves the PRD's Section 10 open question in the opposite direction to
    the one the issue guessed: no landing section other than the hero needs to
    leave RSC.
  - **The spotlight/stagger sequencing risk turned out not to exist**, because
    the spotlight frame is a child of the moving item rather than a sibling of
    it — it rides the entrance transform instead of racing it. Verified rather
    than assumed, with a throwaway Playwright script (deleted) that measured
    the frame's box against its card's: 0px offset on all four edges both after
    the entrance settles on the default 10–24 tier, and when the quantity is
    driven to 100 mid-stagger. No ordering constraint was needed.
  - **`PricingSection.test.tsx` is byte-identical** — the acceptance criterion
    asked for that literally, so the new tier-card assertions live in
    `Stagger.test.tsx` (the shared mechanism) rather than as an added `describe`
    block in the pricing file.

- Follow-ups filed: none.

## 2026-08-01 — N-05: Portal Sidebar Active Indicator

- What shipped:
  - The desktop portal sidebar's current-section pill is now a `layoutId`
    box (`SPRING_SPOTLIGHT`, from `lib/motion.ts`) that travels between links on
    client-side navigation, instead of the background switching instantly. The
    active link's teal *text* still changes via CSS, as before.
  - `navList` became a `PortalNav` component with a `sliding` flag. The mobile
    `<Sheet>` copy renders the identical pill as a flat background class and no
    indicator — untouched behaviourally, and, more to the point, two elements
    sharing one `layoutId` would have Motion animating between two copies of the
    same nav.
  - First tests for `PortalShell` (8): `aria-current="page"` on exactly one link,
    exact-match vs nested-route ownership, no link claimed on a route no section
    owns, and the indicator's structural contract (one, inside the current link,
    `aria-hidden`, absent from the sheet).

- UX surfaces to eyeball: `/portal`, `/portal/designs`, `/portal/designs/new` at
  375/768/1280 light+dark — screenshots in `docs/review/N-05/`. Look at the pill
  behind the current link: is teal-on-teal-50 (light) / teal-500/15 (dark) the
  weight you want for it, and is the pill alone enough of a cue now that it
  moves? The nested `/portal/designs/new` shot is there to confirm the pill stays
  on "My Designs" inside a section.
  The clipped sidebar and the stray avatar in the 375px shots are the documented
  `position: fixed` + `fullPage` artifact, not a regression.

- Decisions I made that a human may want to veto:
  - **The PRD's Section 10 open question is answered: `PortalShell` does not
    remount between portal routes**, so `layoutId` has something to animate from
    and the slide is real. Verified rather than assumed, with a throwaway
    Playwright script (deleted): the indicator travels y 81 → 121 across 17
    in-flight frames under `no-preference`, and lands at the same 121 with **0**
    in-flight frames under `reduce` — `MotionConfig reducedMotion="user"` covers
    it exactly as it covers the pricing spotlight.
  - **`check-reduced-motion.mjs` was left alone.** Its four samplers all drive
    unauthenticated landing routes; a fifth would need the Clerk login flow
    inside a script whose whole value is being simple enough to trust. The
    portal indicator is the same `layoutId` mechanism sampler 1 already proves,
    and the ad-hoc run above confirmed this specific instance.
  - **The pill carries the active background now** — I moved `bg-teal-50` /
    `dark:bg-teal-500/15` off the link and onto the moving box, so the fill
    travels rather than cross-fading between two links. Taste call; reverting to
    a separate underline/rail indicator over an unchanged link background is a
    one-line change if you'd rather see that.
  - **Screenshot routes deviate from the issue**: it asked for `/portal/orders`,
    which is not a route (only `/portal/orders/new` and `/portal/orders/[id]`
    exist). Captured `/portal/designs/new` instead, which exercises the nested-
    route case the indicator actually needs proving on.

- Follow-ups filed: B-08 — the sidebar's "Jersey Runs" link points at
  `/portal/runs`, which has no page and 404s. Pre-existing, unrelated to motion,
  and out of scope here; the indicator correctly sits on it if you land there.

## 2026-08-01 — B-08: Jersey Runs nav link has no route

- What shipped:
  - Removed the portal sidebar's "Jersey Runs" link. It pointed at
    `/portal/runs`, which has no `page.tsx` — the link 404'd for every user.
  - Added a test that holds the *whole* nav to the rule rather than pinning the
    one bad href: `PortalShell.test.tsx` renders the nav, reads every `href`,
    and asserts a matching `app/<path>/page.tsx` exists. A future section added
    to `portalLinks` before its route fails there. (Nav hrefs are all static, so
    no dynamic-segment resolution is needed.)
  - Wrote the missing `backlog/B-08-*.md` — the DAG referenced a file that had
    never been created.

- UX surfaces to eyeball: `/portal` and `/portal/designs` at 375/768/1280
  light+dark — screenshots in `docs/review/B-08/`. The only thing to look at is
  the sidebar: it is a two-item nav now ("My Orders", "My Designs"), and the
  N-05 pill still lands correctly on each. Worth deciding whether a two-item
  sidebar earns its 256px, or whether the portal wants a different shell at this
  size — that's a taste question I did not touch.
  The clipped sidebar and the stray Clerk avatar mid-page in the 375px shots are
  the documented `position: fixed` + `fullPage` artifact, not a regression.

- Decisions I made that a human may want to veto:
  - **Dropped the link rather than building the section.** The issue allowed
    either. A run belongs to an order: `/portal/orders/[id]` already links to
    `run/setup` and `run/responses`, `/portal` already lists runs the user
    responded to, and the phase-1 PRD describes runs only as a per-order
    capability. A `/portal/runs` index would have re-listed the orders already
    on `/portal`, so building it was new product scope, not a bug fix. Filed as
    P-01 (needs-human) with the full argument in `backlog/QUESTIONS.md` — if you
    want the section, it's a one-line nav restore plus a `listForUser` query.
  - **Closed out N-05 first.** Its work was implemented, committed (a2ee715) and
    reported by the previous iteration, which exited before running `complete`,
    leaving the node stuck `in-progress`. Verified the committed tree and marked
    it complete; no code changed.

- Follow-ups filed: P-01 (needs-human) — optional top-level Jersey Runs section.

## 2026-08-01 — N-06: Start Collecting Panel Enter and Exit

- What shipped:
  - **The issue's premise was wrong, so the animation it asked for was not
    built.** `StartCollecting`'s "panel" is not an `open`-gated div — it is a
    Base UI `<Dialog>`, and has been since M-05 created it. Base UI holds the
    popup mounted for the length of its exit animation and `dialog.tsx` already
    carries `data-closed:animate-out ... zoom-out-95`, so it already animates
    out rather than being removed. Measured rather than assumed: sampling the
    real popup's scale every frame on `/portal/orders/<id>` caught 6 frames in
    flight — 0.950, 0.979, 0.990, 0.996 opening, then **0.989, 0.954 closing**.
    Wrapping it in `AnimatePresence` would have been the exact regression that
    CLAUDE.md and this PRD's own Out of Scope section both forbid.
  - **The real defect was criterion 4 of the same issue.** Nothing suppressed
    those CSS animations under reduced motion. `<MotionConfig reducedMotion=
    "user">` only ever covered Motion, and the repo had no
    `prefers-reduced-motion` rule at all — so every `components/ui/*` primitive
    zoomed or slid for users who had explicitly asked it not to. Fixed in
    `app/globals.css`. Same measurement under `reduce` now gives 0 frames in
    flight, settling at scale 1 / opacity 1.
  - It took two rules, because the primitives move by two mechanisms: the
    tw-animate-css keyframes (dialog, dropdown, popover, select, tooltip) zero
    their `--tw-enter-*`/`--tw-exit-*` transform inputs, while the sheet
    transitions Tailwind's standalone `translate` property, which the first rule
    cannot reach. Opacity is left alone in both — a fade is not movement, and
    keeping the animation *running* rather than `animation: none` is what lets
    Base UI still delay unmount.
  - `scripts/check-reduced-motion.mjs` gained a fifth case (the marketing nav's
    mobile sheet): 27 frames in flight at no-preference, 0 under reduce. All
    five cases green.
  - `StartCollecting` had no test file; added one with 8 behaviour tests —
    fields absent until open, close genuinely unmounts, rapid open/close leaves
    exactly one panel, both validation paths, the success path's mutation args +
    toast + close, and the failure path.

- UX surfaces to eyeball: `/portal/orders/jh78tchkpkxczry0xsrw21fmw58bdx3c` and
  `/` at 375/768/1280 light+dark — screenshots in `docs/review/N-06/`.
  **Honestly, there is little to look at:** nothing here changes at default
  motion settings. The change is only visible with OS reduced motion on, and
  `snap.mjs` neither emulates that nor can open a dialog, so the open state is
  not captured. The worthwhile manual check is OS reduced motion enabled →
  open/close "Start collecting" and the mobile menu, and confirm both fade
  without sliding or zooming while staying fully usable.
  The `1280 light` order-page capture caught the Convex query mid-flight and
  shows only skeletons; the 375 capture of the same page rendered fully. A
  one-off race in `snap.mjs`, not a regression — worth knowing the screenshot
  surface can lie like this.

- Decisions I made that a human may want to veto:
  - **Not doing the task as written, and withdrawing PO-2 from the PRD.** I
    treated this as technical rather than a product call, because CLAUDE.md and
    the PRD had already answered it in writing: converting `components/ui/*` off
    tw-animate-css is a regression. If you disagree, the revert is that the
    dialog gets `AnimatePresence` and the CSS exit is deleted.
  - **Fixing reduced motion for all `components/ui/*`, not just the dialog.**
    Broader than N-06's title. Shipping half of an accessibility guarantee
    seemed worse than shipping it whole, and the fix belongs in one place by
    the CSS-vs-Motion boundary. It is ~15 lines in `globals.css`, scoped to a
    media query, and affects nothing at default settings.
  - **The sheet, not a dialog, as the committed check case.** Every keyframe
    primitive in the app sits behind auth or needs seeded data; the sheet needs
    only a dev server. So the committed check proves the mechanism I could
    reach, and the dialog half was verified by hand this session. Filed as N-09
    rather than bolting a Clerk session onto a check whose trustworthiness
    comes from needing nothing.
  - Updated N-07/N-08's implementation notes, which both told the next agent to
    "reuse the `AnimatePresence` shape established in N-06". N-06 established
    none, so N-07 is now the codebase's first `AnimatePresence`.

- Follow-ups filed: N-09 — automate the reduced-motion check for the keyframe
  primitives (dialog/select/popover/dropdown/tooltip), which currently have no
  committed proof.

## 2026-08-01 — N-07: Roster Row Add and Remove Animation

- What shipped:
  - **Roster rows fade in and out, and the survivors slide into the gap.**
    `RosterSheet`'s list is now one `AnimatePresence mode="popLayout"` over
    rows keyed on entry id, each a `motion.li` with `layout="position"`. Two
    tokens in `lib/motion.ts` — `ROW_FADE_DURATION` and `ROW_TRANSITION`, the
    latter giving the fade a short tween and the gap-closing a spring, because
    the fade is a receipt and the slide is the part that carries the meaning.
  - **`layoutScroll` on the list's scroll container**, which is what makes any
    of this work on a real roster. See the veto list below — this is the one
    finding worth reading.
  - **`SlotRow` is one `li` across its display and edit states** instead of a
    return per state, so entering edit mode is not read as one row leaving and
    another arriving. It takes and forwards a `ref` for `popLayout` to measure.
  - The list also stays mounted through the empty state, so the *first* player
    added animates in like every one after it.
  - Codified the whole shape as a rule in CLAUDE.md, since N-08 copies it.

- UX surfaces to eyeball: `/portal/orders/<id>`, roster sheet open
  (screenshots in `docs/review/N-07/`, 375/768/1280 light+dark).
  - `roster-sheet-w*.png` — **the review surface**. Stills cannot show an
    animation, so what to judge here is the resting state: rows unchanged,
    footer intact, nothing clipped by the new `relative` on the list. The
    animation itself was measured rather than eyeballed (below).
  - `portal-orders-*.png` — the cards behind the sheet, unchanged by this slice.
  - **Worth doing by hand**: open a roster, add a player, remove one from the
    middle, and paste a list. The taste call I cannot make for you is whether
    the removal reads well as *two* beats — the row fades over 0.15s, then the
    gap closes over a spring — rather than one simultaneous collapse. A
    simultaneous collapse is a `height: 0` exit; it is a two-line change to
    `ROW_TRANSITION` and the exit target if you want it.

- Decisions I made that a human may want to veto:
  - **`layoutScroll`, and the reason it is worth a paragraph.** Without it the
    animation is *silently* dead on any roster long enough to scroll — Motion
    measures rows in viewport coordinates and assumes an ancestor's scroll
    offset never moves, so the delta cancels to zero and every row snaps. It
    passed by hand on a two-row design and failed on a fifteen-row one. Neither
    the unit tests (jsdom has no layout) nor a screenshot can see this, which
    is why the throwaway Playwright check below sampled the *long* list.
  - **`popLayout` rather than leaving the row in the flow.** Left in flow, a
    leaving row holds its space for the whole fade, and by the time it drops
    `AnimatePresence` re-renders the survivors from cached elements — React
    skips them, so they never measure where they were. I tried `LayoutGroup`
    first on the theory that it forces a group-wide measure; it does not fix
    this, and it is not in the shipped code.
  - **Opacity only on the row itself — no rise, no collapse.** It keeps the
    enter/exit clear of the layout projection running on the same element, and
    it leaves reduced motion to one mechanism: `MotionConfig` suppresses the
    slide, the fade survives, which is the split the preference asks for.
  - **No stagger anywhere.** With `initial={false}`, rows already present when
    the sheet opens do not animate, and a confirmed paste returns to a freshly
    mounted list — so a 30-name paste plays nothing at all. The mirror's 15
    rows land in a live list and all fade together. Measured: 30 rows landed
    250ms after confirm with zero frames of residual fading.
  - **Verified in a real browser with a throwaway Playwright script** (not
    committed, same precedent as M-03/M-04 — `snap.mjs` navigates only and this
    surface is two clicks deep; `snap.mjs` is untouched). It measured, against
    the 15-row roster: a new row fading 0 → 1; the removed row fading out; the
    row below travelling 70px through 9 in-flight frames under
    `no-preference` and **0** under `reduce`; no duplicate or wrong-row
    removal; and the paste settling. It planted and then removed its own rows —
    the fixture's seeded players have orders on them and `remove` refuses those
    — and confirmed zero left behind.
  - **The new unit tests are regression gates, not red-first tests.** The rows
    were already keyed on `slot._id`, so the sibling-identity assertions passed
    before the change. They are worth having anyway: they are what fails if
    anyone reaches for an index key, which is the one bug that makes the wrong
    row disappear.

- Follow-ups filed: none.

## 2026-08-01 — N-08: Removed Designs Section Reveal

- What shipped:
  - `RemovedDesigns` now splits *loading* from *empty*. The old single guard
    (`removed === undefined || removed.length === 0`) collapsed the two; only
    the second can turn populated in front of a captain who is watching, and
    keeping them apart is what lets `AnimatePresence initial={false}` mount on
    the render that already knows the answer. Without the split every page
    load would replay the reveal, because a Convex query always resolves after
    first paint.
  - The section animates its own **height** (plus opacity), not a fade or a
    rise. Fading in place would still drop everything below it by the
    section's full height in one frame — which is the layout glitch the issue
    describes, not a fix for it. `overflow-hidden` on the section and `pt-10`
    on an inner div instead of `mt-10` on the section, so the 40px gap grows
    with the reveal rather than appearing on frame one.
  - Transition is `REVEAL_TRANSITION` from `lib/motion.ts` — this is a section
    reveal, so it takes the site's section-reveal token rather than a new one.
    No new motion constants.

- UX surfaces to eyeball: `/portal/orders/jh70c9faf0z6hckes2eafx1ymd8bc6x0`
  - `docs/review/N-08/` — **with** a removed design (Away Kit, Riley Tran's 3
    jerseys). Check the gap above "Removed designs" reads as deliberate
    section spacing and that the dashed card sits right against the Collect
    card below it.
  - `docs/review/N-08-empty/` — the same order **without** one, i.e. the
    section absent. The two sets should differ by exactly this section.
  - Both are captured at rest: `initial={false}` means a page load renders the
    section at full height, so nothing here can be caught mid-reveal.

- Decisions I made that a human may want to veto:
  - **A new dev-seed toggle, `_devSeed:setFixtureDesignRemoved`.** A design
    counts as removed only when order entries still point at it but the order
    no longer lists it — reachable only by unchecking a design in the edit
    form, which a headless capture cannot click. The toggle patches one
    order's `designIds` and is its own undo (`removed: false`); it creates and
    deletes nothing, so the round trip is lossless. Same precedent as
    `seedLargeRoster`. **The dev deployment is back in its original state** —
    the away kit is relinked; verify with the order page if you like.
  - `docs/review/N-08-empty/` as a second directory rather than one folder:
    snap names files after the route, so the two states would overwrite each
    other in a single directory. The issue's own AC asks for both.
  - **Verified in a real browser with a throwaway Playwright script** (not
    committed; same precedent as M-03/M-04/N-07 — jsdom has no layout, so the
    reveal cannot be proven under vitest). It opened the order page with the
    away kit linked, unlinked it from the CLI while the page was open, and
    sampled the section's height every frame: **no-preference** went absent →
    23 distinct in-flight heights, 7.4px → 208px; **reduce** went absent →
    208px on the first frame with **0** in-flight frames. That is the
    acceptance criterion "under reduced motion the section appears without
    movement", and it works because Motion counts `height` as a positional
    value — `MotionConfig reducedMotion="user"` snaps it while leaving the
    fade alone. No `motion-reduce:` variant was added, per CLAUDE.md.
  - `node scripts/check-reduced-motion.mjs` re-run and still PASS.
  - **The new unit tests are regression gates, not red-first tests** — the
    issue's TDD step 1 asks them to pin the loading-vs-empty distinction, which
    the old code already satisfied. They fail if anyone folds `undefined` back
    in with `[]`, or if the section stops leaving the accessibility tree when
    the last removed design is linked back.

- Follow-ups filed: none.

---

## N-10 — Theme Swap Transition (A/B)

- What I built: the light/dark swap animates instead of cutting, on every page.
  **Two candidates shipped side by side** at the human's request, because this
  reads differently in motion than in a description: a whole-page **crossfade**
  and a **circular reveal** growing from the toggle. `components/theme-toggle-compare.tsx`
  renders both, labelled `fade` and `circle`, and replaces `<ThemeToggle/>` at
  all six call sites (MarketingNav, PortalShell, AdminShell — desktop bar and
  mobile sheet each).

- The mechanism is the **View Transitions API**, not CSS transitions on
  elements. The obvious-looking alternative — drop `disableTransitionOnChange`
  and let colours transition — is a trap: there are ~80 unrelated `transition-*`
  classes in this codebase and each would animate its own property at its own
  duration, so the page would smear rather than change. `disableTransitionOnChange`
  stays exactly as it was, and **no global `transition` rule was added.**

- Decisions I made that a human may want to veto:
  - **The update callback awaits the DOM instead of calling `flushSync`.** The
    canonical recipe is `startViewTransition(() => flushSync(() => setTheme(next)))`.
    It does not hold here: next-themes applies the class from a *passive* effect
    (`useEffect(() => applyTheme(theme), [theme])` — see
    `node_modules/next-themes/dist/index.mjs`), and `flushSync` does not promise
    passive effects have run by the time it returns. Losing that race means both
    snapshots show the old theme and the transition plays as a no-op,
    *intermittently*. So `themeApplied()` resolves on a `MutationObserver` when
    `<html>` actually carries the new class, with a 300ms timeout so a swap can
    never hang the page. next-themes stays the only writer of that class —
    nothing reimplements its internals.
  - **The circle is drawn with WAAPI, not a CSS keyframe.** Whether custom
    properties on `:root` inherit into the `::view-transition-*` pseudo tree is
    engine-dependent, and the geometry is per-click anyway. `root.animate(...,
    { pseudoElement: "::view-transition-new(root)" })` takes the numbers
    directly. `app/globals.css` only kills the browser's default crossfade
    (which would otherwise fade the old page out from *behind* the growing
    circle) and forces `mix-blend-mode: normal` — the default `plus-lighter` is
    built for near-identical images and blows a light↔dark midpoint out to white.
  - **Both variants share one shape**: the old snapshot holds still, the new one
    arrives on top. They differ only in whether "arrives" means opacity or
    clip-path. That is what lets a half-drawn circle show the old theme around it.
  - **Reduced motion gets the fade, not a hard cut.** A crossfade is not
    movement, and cutting between light and dark is the harsher outcome for
    someone who asked for less motion — so only the circle's geometry is
    suppressed, in JS (`newSnapshotKeyframes`) rather than in the globals.css
    block, because JS is already orchestrating this one.
  - Timings live in `lib/motion.ts` (`THEME_CROSSFADE_MS` 320,
    `THEME_REVEAL_MS` 450) per CLAUDE.md. They are named `_MS` because they are
    the only tokens in that file handed to WAAPI rather than to Motion. Added
    `EASE_OUT_CSS`, derived from the existing `EASE_OUT` tuple so the site's one
    easing curve cannot drift into two.

- **Verified in a real browser with a throwaway Playwright script** (not
  committed; same precedent as N-07/N-08 — jsdom has no layout or View
  Transitions, so this cannot be proven under vitest). At 1280×900, clicking
  each toggle:
  - **crossfade** → one animation on `::view-transition-new(root)`,
    `opacity 0 → 1`, duration **320ms**, easing `cubic-bezier(0.22, 1, 0.36, 1)`,
    `mix-blend-mode: normal`, **15 distinct progress values** across 17 frames
    (0.000 → 1.000). It interpolates over real time; it does not jump.
  - **circle** → `clip-path: circle(0px at 1138.8px 32px) → circle(1431.88px at
    1138.8px 32px)` — centred on the toggle, radius reaching the far corner —
    duration **450ms**, **24 distinct progress values** across 27 frames.
  - **circle under `reducedMotion: "reduce"`** → falls back to `opacity 0 → 1`
    at 320ms, and the document marker reads `crossfade`. The geometry is gone;
    the fade survives.
  - In all three the theme actually changed (`light` → `dark`, `colorScheme=dark`)
    and `data-theme-transition` was cleaned off the document afterwards.

- **Screenshots caveat:** `docs/review/N-10/` holds the ordinary settled
  captures (`/` and `/portal`, 375/768/1280, light+dark) showing the compare
  control in the marketing nav and the portal sidebar — it fits beside the logo
  in the 256px sidebar without wrapping. Mid-transition frame grabs were
  attempted and **deleted**: Playwright's screenshot is slower than a 320ms
  animation, so every frame came back already settled and would have been
  misleading evidence. The `getAnimations()` sampling above is the real proof.

- Follow-ups filed: **N-11** (parked, `needs-human`) — pick a variant, delete
  the loser and `theme-toggle-compare.tsx`, and add a theme-swap case to
  `scripts/check-reduced-motion.mjs`. That check is deliberately **not** added
  yet: it would be a permanent automated gate on code that is 50% likely to be
  deleted. The reduced-motion behaviour is verified above, just not yet
  automated — that gap closes with N-11.

## 2026-08-02 — M-06: Show The Whole Roster, Densely

- **Human-directed, not loop-picked.** The ask: kill "+ N more" on the order
  page and show every roster entry, and make managing a roster less bulky —
  "minimize the amount of scrolling a user may need to do." Two product calls
  were put to the human before any code, and both were answered:
  - Order page → **multi-column, then scroll**. Not a "Show all" toggle, not
    unbounded card growth.
  - Sheet → **one line per player, actions on hover/focus**. Not a wider
    two-column panel.

- **`DesignRosterPreview` no longer caps.** `ROSTER_PREVIEW_CAP` and the
  "+ N more" tail are gone. A cap always hides the same thing — the end of the
  roster — and the end is where the captain looks, because that is where the
  player they just added landed. The list is now a responsive grid: 1 column on
  a phone, 2 from `sm`, 3 from `lg`. Fifteen players are **five rows at 1280
  and eight at 768**, which is shorter than the six-row capped list it
  replaced. Showing more made the card smaller.
  - **Grid lines without nth-child arithmetic:** `gap-px` between cells, and
    each cell paints its own `shadow-[0_0_0_1px_var(--border)]` into that gap,
    so neighbours share a hairline and both the row and the column rules fall
    out at 1, 2, or 3 columns. Per-cell `border-r` would need a different rule
    per breakpoint.
  - **The ring is on the cells, not the container**, and that is the second
    draft. Colouring the *container* `bg-border` is the usual version of this
    trick and it drew correctly — until a roster whose length isn't a multiple
    of the column count, which is most of them. The Away Kit's two entries left
    the third cell of the row as a bare grey block. Caught in the 1280
    screenshot, not by a test.
  - **The height cap is one `max-h-80`, not a count.** The same value
    self-adjusts across breakpoints: three columns swallow ~30 entries before
    it binds, a phone's single column starts scrolling around thirteen. A
    count-based cap would need a different count per breakpoint — something CSS
    can see and a component reading `rows.length` cannot.

- **`RosterSheet` rows are one line each**, roughly half their previous height:
  name, ordered sizes, actions, all on a 36px row with a hover surface instead
  of a border. The full fifteen-player roster now fits a 1280 sheet **with no
  scroll at all** (it was ten rows of fifteen before), and about fourteen fit a
  375 phone.
  - "Not yet filled" is a muted dash plus `sr-only` text, and the collision
    flag is an amber triangle with a `title` and `sr-only` text. Both were
    full-width badges on a second line, which meant a half-seeded roster's
    loudest element was the same three words fifteen times. The existing tests
    assert on that text and still pass — they are asserting the right thing.
  - **Row actions hide at paint level, never conditionally.**
    `[@media(hover:hover)]:opacity-0` plus `group-hover` / `group-focus-within`
    back to full. The `hover:hover` guard is the load-bearing half: on a touch
    screen nothing matches, no rule sets opacity, and the buttons simply stay
    visible — hiding them unconditionally would make them unreachable on
    exactly the device where a captain seeds a roster from the rink. Opacity
    also leaves them focusable and hit-testable throughout, so the keyboard
    still reaches them and focus then reveals what it reached. There is a test
    pinning them in the accessibility tree with no hover.

- **One pre-existing bug the redesign exposed.** Base UI's dialog focuses the
  first tabbable element on open, which here was the first player's **Edit**
  button — so Enter-on-open started editing Avery Quinn. Invisible before;
  visible the moment focus started revealing a row's actions, as row one
  appeared singled out in the resting screenshot. Fixed with `initialFocus` on
  the scroll container (`tabIndex={-1}`), which also gives the keyboard
  something to scroll a long roster with. In paste mode the ref is empty and
  Base UI falls back to focusing the textarea, which is correct there.

- N-07's animation contract is untouched: `AnimatePresence mode="popLayout"`,
  `layout="position"` on the rows, `layoutScroll` on the container. Row spacing
  went `space-y-2` → `space-y-0.5`; the rows carry their own hover surface now,
  so the gap was only pushing player fifteen off screen.

- UX surfaces to eyeball: `docs/review/M-06/`, 375/768/1280, light + dark.
  - `portal-orders-*.png` — the card. Judge the column count per width and
    whether the hairline grid reads as a roster rather than a table. At 375 the
    list clips mid-row, which is the scroll affordance doing its job.
  - `roster-sheet-*.png` — the sheet at rest (no row shows its actions).
  - `roster-sheet-hover-*.png` — one row hovered, actions surfaced. This is the
    call worth a human eye: whether hover-revealed edit/remove is discoverable
    enough for a captain who has never opened this sheet before. The fallback,
    if not, is one line — drop the `[@media(hover:hover)]:opacity-0`.

- Decisions a human may want to veto:
  - **The dash.** "Not yet filled" as a word is gone from the visual layer on
    both surfaces. It is still announced. If a captain scanning a half-seeded
    roster needs the phrase rather than an empty size column, the dash is the
    thing to change.
  - **`max-h-80`.** Chosen so three columns almost never scroll and a phone
    scrolls a little. If the card should never scroll internally at all, this
    is a one-value edit.

## 2026-08-02 — M-07: Roster Row Review Fixes

Human review of M-06, both calls answered against the shipped version:

- **Row actions are visible at rest again.** The `[@media(hover:hover)]`
  dimming is gone, along with the `group` it needed. The reasoning that
  overrules M-06's: the row is dense enough to carry two icon buttons without
  looking busy, and a control you have to find is the wrong trade on a phone —
  which is where a captain actually seeds a roster, and where hover does not
  exist at all. The M-06 test that pinned the buttons in the accessibility tree
  survives as a plain "they are on the row" assertion.
- **"Not yet filled" is words again**, on both the card and the sheet. What
  made it loud in the first place was the *badge* — a filled pill on its own
  line under every unfilled player — not the phrase. As muted `text-xs` at the
  end of a one-line row it costs nothing to scan past, and it fits the
  narrowest column the card ever has (a third of the card at 1280) without
  squeezing the name beside it. The `sr-only` duplicate is gone with it.

Neither change gives back the density M-06 bought: rows are still one line, the
full fifteen-player roster still fits a 375 sheet without scrolling, and the
card still shows every entry in five rows at 1280.

- Screenshots: `docs/review/M-07/` (375/768/1280, light + dark) — card and
  sheet. M-06's `roster-sheet-*.png` were superseded and moved here rather than
  left showing a state that no longer exists; the hover variants are deleted,
  since there is no longer a hover state to review.

## 2026-08-02 — D-10: Consolidate Edit Design Into The Design Page

The design page had two ways to change a design. The brief and the files were
edited in place (D-03/D-05); the title, the cut and the Canva link needed
"Edit design", which swapped the whole screen for a form that then duplicated
the page — its own Files step uploading alongside the pool, its own Canva
field, its own "The cut" heading. The edit surface is gone. Every field is now
edited where it is shown.

- **`designs.updateDesign` is a per-field patch.** It was shaped for a whole
  form submit: required `title`, required `addFiles`, optional `blocks`. It
  now takes the same shape `admin.updateDesign` already had — every field
  optional, omitted means "leave it alone", supplied-but-blank means "clear
  it". Files and blocks have had their own mutations since D-05, so it stopped
  carrying them, and the "at least one file" guard now lives only in
  `createDesign` and `removeAsset`, the two paths that can actually violate it.
  `normalizeSpecs` split into a patch-shaped validator plus the insert's view
  of it, which is what makes a spec clearable — Convex reads `undefined` in a
  patch as "remove this field".
- **`InlineEditField` moved out of `components/admin/`.** Three admin pages
  and now the captain's design page mount it; leaving it under `admin/` would
  have told the next reader it was staff-only. It grew a `heading` variant so
  the page edits its title *as* the `<h1>` rather than repeating the title in
  a labelled field underneath, which is the duplication this issue is about.
- **Allowlisted specs are a picker, not a text field** (`DesignSpecPicker`).
  Neckline and sleeve style have two legal answers each — too few to hide
  behind a pencil and a Save button, so the options are always on screen and
  clicking one *is* the edit. "Not decided" is a real option rather than an
  empty state, because undecided is a legitimate answer (PRD §6) and going
  back to it has to be as easy as choosing.
- **An off-allowlist stored value is carried as its own checked option.** Found
  this from the screenshots: the fixture designs hold `"Crew"` and
  `"Short sleeve"` from before the allowlists settled, and the first version of
  the picker showed *nothing* checked for them — a design that has chosen
  reading as one that hasn't, with the next click silently overwriting an
  answer the captain never saw.
- **`DesignForm` is create-only.** The `Mode` union, the relaxed edit schema,
  the existing-file count and the `updateDesign` call are all gone. What's left
  is the one thing the design page can't do: bring a design into existence,
  which is why the Overview is still authored there.

Judgement calls, both mine:

- **The admin design page is untouched.** It already edits these fields
  inline, so it has nothing to consolidate; giving it the new spec picker (its
  neckline/sleeve are still free text, and so still able to write a value the
  captain's page can't show as chosen) is a real improvement but a separate
  one. Worth picking up.
- **Specs and the Canva link stayed fixed sections rather than becoming
  blocks**, per PRD §5 — they're the same three questions on every design, so
  there is nothing to add or reorder.

Also fixed `_devSeed`'s design fixture to use allowlisted spec values, and
added `resetFixtureDesignSpecs` to bring already-seeded designs onto them —
`ensureDesign` deliberately never touches a design it adopted, so the stale
values were otherwise unreachable from a headless capture.

- Screenshots: `docs/review/D-10/` (375/768/1280, light + dark) — the design
  page and, since the form changed, `/portal/designs/new`.

## 2026-08-02 — D-11: Click A Thumbnail To See It Full Size

Human-requested, interactive session (not a loop iteration).

Design artwork was only ever shown small: the order page's Design card renders
it as a 56px square, and a gallery block crops every image to a square tile.
Neither could be enlarged. Both now open a lightbox on click.

`components/design/ImageLightbox.tsx` is the shared piece. The thumbnail
*becomes* the trigger button rather than being wrapped in one — the caller
passes its box classes as `triggerClassName` — so sizing still describes the
clickable area and no extra layout node appears in a flex row or grid cell.

Two decisions worth flagging for review:

- **Zoom is opt-in on `DesignThumbnail`, defaulting off.** The component is
  shared by four surfaces, and two of them (the portal dashboard card, the
  designs list card) wrap the entire card in a `<Link>`. A button inside an
  anchor is invalid HTML and would hijack the card's own click target, so
  turning zoom on globally was not available. Only the order page's Design
  card passes `zoomable`. There is a test asserting the default stays
  non-interactive, so this can't regress silently.
- **A placeholder never offers zoom.** Missing files, a print template chosen
  as the main image, and a stale storage URL all render the same icon
  placeholder, and none of them has a full-size version to open.

The gallery lightbox comes along for free inside the block *editor*, which
reuses `DesignBlockBody` for its read-only preview — being able to check the
full image while writing the brief is what you'd want there anyway. The
trigger wraps only the image, so the filename caption stays selectable text.

Trigger buttons carry an explicit `aria-label` ("View crest.png full size")
rather than inheriting the image's alt, so the action is announced instead of
the filename twice.

Judgement call: **the roster breakdown's design thumbnail was left alone.**
It sits on the order page too and isn't inside a link, so it could take
`zoomable` — but the ask was the Design card and gallery images, and a
roster's 40px thumbnail is a row label rather than something you study. Easy
to add later if it reads as an inconsistency.

- No screenshots: the change is invisible in a still capture. The closed state
  is pixel-identical apart from a zoom cursor, and `snap.mjs` captures routes
  rather than post-click state, so it cannot photograph the open dialog.
  Behaviour is covered by tests instead (open on click, open from the
  keyboard, close on Escape).
- `node scripts/verify.mjs` — typecheck, lint, 1243 tests, all pass.

## 2026-08-02 — M-08: Export A Design's Roster To CSV

**Export CSV** now sits beside **Manage roster** on every design card that has
a run. It downloads that design's roster as Name / Number / Size, and the one
real transformation is **expansion**: the card collapses repeats into a chip
(`L ×3`) because a captain reading a screen wants the roster short, and the
file goes the other way — three identical rows, because every row of a CSV is
one garment to make.

Three product decisions came from the requirements conversation rather than
from me:

- **Unfilled slots are in the file**, with an empty Size cell. That makes the
  export double as the list of people who still owe a size — a missing row
  can't say that.
- **Blank/bulk jerseys** export with empty Name and Number rather than the word
  "Blank", so the columns stay data.
- **Two orderings, not one**, which is why the control is a small menu:
  *By name (A–Z)* is the default a captain checks against a team list, and
  *By size (S, M, L…)* is the cut list for whoever pulls stock. Under size
  grouping the sizeless (unfilled) rows trail every group, and blanks sort last
  within their own size group rather than to the very bottom — all the XLs stay
  together, which is the whole point of that ordering.

Architecture notes:

- **No new Convex query.** The order page has already read this design's roster
  for the card preview (M-01), so the export is built from the exact `rows` on
  screen. Same rule the roster sheet follows, and for the same reason: the file
  cannot describe a different team than the captain is looking at.
- **`lib/csv.ts` is new, and it is an extraction, not an addition.** The
  serializer, the filename slug, the ISO date, the UTF-8 BOM and the Blob
  download all lived in the admin export (3-03). The roster export is their
  second caller, and the formula-injection guard is a *security* control —
  a security control with two copies eventually has one copy that's wrong. So
  `orderExport.ts` and `ExportOrderButton.tsx` now import them, `toCsv`'s tests
  moved to `csv.test.ts` alongside the code, and the admin export's own tests
  pass untouched.
- **`RosterRow` now carries `name` and `number` beside `label`.** Re-splitting
  "Ruiz #7" back into columns is guesswork the moment a player's name contains
  a "#", so the row type keeps both halves. Optional fields — a blank row has
  neither.

Judgement calls:

- **The export stays enabled on a locked run.** Reading the roster out is the
  one thing a frozen run should never stop a captain doing.
- **Disabled, not hidden, on an empty roster.** A header-only file looks like a
  broken export; a button that appears and disappears as the first player is
  added is worse than one that is visibly not-yet-usable.
- **Per-design, not per-order.** The ask was the design card, and each card's
  roster is what a supplier quote is cut from. An order-wide export already
  exists on the admin side.

- Screenshots: `docs/review/M-08/` — the order page at 375/768/1280, light and
  dark. The button is captured in place on both design cards; the *open* menu
  is not, since `snap.mjs` captures routes rather than post-click state.
- `node scripts/verify.mjs` — typecheck, lint, 1278 tests, all pass.

## 2026-08-03 — M-09: Captain And Assistant Captain Designation

A roster slot can now carry a letter — **C** for the captain, **A** for an
assistant captain — because that letter is an extra thing to apply to the
garment and until now it reached production by email or not at all. It is
optional and usually absent; a team has one C and maybe two As out of fifteen.

Where it shows up: the design card's roster preview, the roster sheet, the
responses page's *By roster* view, the captain's per-design CSV (a **Role**
column), and the admin order CSV (same column, so production sees it on the
file they already open).

Product decisions I made rather than parked:

- **Stored as the letter, not the word.** `rosterEntries.source` is already
  valued `"captain"`, and a second field on the same document valued
  `"captain"` too would make `slot.source === "captain"` and
  `slot.designation === "captain"` interchangeable to the type checker. `"C"`
  belongs to exactly one of the two fields, so a mistyped field name is a
  compile error rather than a silent bug.
- **No "one captain per design" rule.** Co-captains exist, and a validation
  error thrown at someone seeding a roster costs more than a second C ever
  would.
- **Set from the sheet's edit row, not the add row.** The add row is a
  three-column grid at 375px; a fourth control there would be paid for by every
  player to serve one. "No letter" is a real radio option beside C and A, so
  taking a letter off is as reachable as putting one on.
- **Fans can't set it.** The public form creates roster slots in open-names
  mode; who wears the C is the captain's call, so the mutation accepts the
  field but nothing on the fan path sends it.
- **The mirror carries it.** The captain of the home kit is the captain of the
  away kit — re-picking it per design is exactly the retyping M-04 exists to
  remove.
- **Bulk paste ignores it.** A third column would collide with the "more than
  two cells is an invalid row" rule the parser leans on, and one player in
  fifteen is an edit, not a paste.

Two things worth flagging in the code:

- **A letter is not part of a player's identity.** `rosterSlotKey` is
  unchanged, so paste dedupe (M-03) and mirror skip (M-04) still match on name
  + number. Pinning a C on someone must not make them a second person.
- **But it *is* part of a production line's identity.** `rosterLinesByDesign`
  merges entries on `label\0size`; two slots can share a name and a number and
  differ only in the letter, and merging those would have made one of the two
  garments wrong. The designation is now in that key.
- **`update` always names `designation` in the patch.** Convex only drops a
  field when the patch mentions it, so a conditional patch would have made
  "take the C off" a silent no-op. The test asserts both directions.

- Screenshots: `docs/review/M-09/` — the order page and the responses page at
  375/768/1280, light and dark. The badges are visible on the home kit's roster
  (Avery Quinn C, Sam Okafor A) at every width. The edit-row picker and the
  *By roster* tab are post-click state, which `snap.mjs` cannot reach; both are
  covered by component tests instead.
- Fixtures: `_devSeed` now seeds one C and one A, and back-fills them onto a
  deployment seeded before this issue, so future captures of any roster surface
  have a letter in them.
- `node scripts/verify.mjs` — typecheck, lint, 1306 tests, all pass.
