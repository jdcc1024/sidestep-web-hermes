# Needs-Human Queue

Agents park product/UX questions here instead of guessing. Nodes flagged this way show purple in the DAG viewer and are skipped by the loop until answered.

**To answer:** write your answer under the question, move the entry to Answered, then run
`node scripts/dag-update.js answer <nodeId>` — the task becomes eligible again and the next loop iteration picks it up with your answer in hand.

Agents: when you restart a previously-parked task, read its Answered entry FIRST.

---

## Open

<!-- template — copy this block
### [nodeId] Task Title — YYYY-MM-DD, agent-id
**Question:** One clear, answerable question.
**Context:** Why this can't be decided autonomously; what's already built.
**Options considered:**
1. Option A — tradeoffs
2. Option B — tradeoffs
**Recommendation:** which option and why (human may veto).
**Answer:** _(human fills in)_
-->

### [D-09] Wipe the pre-D-01 dev design so the schema can push — 2026-07-25, ralph-loop
**Question:** May we delete the one remaining old-shape design document on the **dev** deployment (`benevolent-starling-766`), or would you rather delete it yourself?

**Context:** D-01 replaced `designs.fileIds` with the `designAssets` table and D-02 replaced `designs.brief` with the `blocks` array. The PRD chose **no migration** — "dummy designs wiped once (pre-launch, no real data)" (`docs/prd/design-page-blocks.md` §6). One document was never wiped, so `npx convex dev` refuses to push:

```
✖ Schema validation failed.
Document with ID "j572994ahcdr7mzg6h8aycd9sh877eb4" in table "designs"
does not match the schema: Object is missing the required field `blocks`.
```

It is the only row in `designs`: `{ title: "TOC 2026 Jersey", brief: "for toc", fileIds: [2 files] }`. That reads like a record **you** created by hand to test the portal, not loop-generated dummy data — which is why three iterations in a row have now left it alone rather than deleting your data on your deployment.

**What it blocks:** no schema push means no working dev backend, which means `scripts/snap.mjs` can't reach the app. **D-01, D-02 and D-03 all shipped without screenshots**, so the UX review surface for the whole design-page track is missing, and D-08 (motion & polish) can't be done at all without it. The code is fine — 789 tests green — this is purely the review surface.

**Options considered:**
1. **Delete the one document** (dashboard → `designs` → delete row), then re-run `npx convex dev --once`. Loses one hand-made test record; its two uploaded files stay orphaned in storage and can be deleted too. Matches the PRD's stated plan.
2. **Back-fill it in place** — add `blocks: [{kind:"text",field:"overview",body:"for toc"}]` and create `designAssets` rows for its two `fileIds`. Preserves the record, but means writing migration code the PRD explicitly declined, for one row.
3. **Make `blocks` optional in the schema** so the stale row validates. Rejected: it would let a design exist with no description forever and undo D-02's central guarantee.

**Recommendation:** Option 1, and honestly it's a 10-second dashboard click you may prefer to just do — say the word and the next iteration will do it instead. Once it's pushed, D-09 also re-captures the missing screenshots for D-01/D-02/D-03 in one pass.

**Update (2026-07-26, ralph-loop) — the schema half is solved; a different thing now blocks screenshots.** Your `_migrations.ts` backfill (f76fade) did it: `npx convex dev --once` pushes cleanly, and `TOC 2026 Jersey` now carries a real four-section brief. So this question no longer needs an answer as asked.

What still blocks Track D screenshots is the **Clerk session in `.auth/state.json`, which has expired** (saved 2026-07-19). `snap.mjs` reached the app fine during D-04 and photographed the **sign-in wall** at all 12 viewport/scheme combinations; those shots were deleted rather than filed as review artifacts. The one-time human step from CLAUDE.md fixes it:

```
node scripts/snap.mjs --login
```

Once that's re-run, D-09 can capture D-01/D-02/D-03/D-04 in one pass — and no dev data has to be deleted for any of it.

**Update (2026-07-26, ralph-loop):** D-05 shipped too, so the pass now covers **D-01 → D-05** — including the new file pool and gallery picker on `/portal/designs/<id>`, which are the most visual surfaces of the whole track. `.auth/state.json` is unchanged since 2026-07-19, so this iteration didn't re-photograph the sign-in wall.

**Update (2026-07-26, ralph-loop):** D-06 shipped — the pass now covers **D-01 → D-06**, and adds `/admin/designs/<id>`, which is behind the admin role as well as Clerk, so it needs the saved session to be an *admin's*. Still no `--login` since 2026-07-19; no sign-in walls photographed.

**Update (2026-07-26, ralph-loop):** D-07 shipped — the pass now covers **D-01 → D-07**, adding the design thumbnails on `/portal/orders/<id>`, which is behind Clerk (captain session is enough there; the admin design page still needs an admin's). Still no `--login` since 2026-07-19; no sign-in walls photographed.

**Update (2026-07-26, ralph-loop, from O-06):** confirmed the session really is expired rather than assuming it — `node scripts/snap.mjs O-06 /portal` returned six photographs of the Clerk sign-in wall, which were deleted. Beyond Track D, the pass now also owes screenshots for **O-06**'s two routes: `/portal/orders/<id>` and `/portal/orders/<id>/edit`, each in a locked and an unlocked state (a captain session is enough for both).

**Update (2026-07-27, ralph-loop, from C-01):** re-confirmed — `node scripts/snap.mjs C-01 /portal/orders/jh7ad7376r9ffvkz1vhs0s5b458b9v0e` again returned six photographs of the sign-in wall, which were deleted. `.auth/state.json` is still the 2026-07-19 session. C-01 put the collected roster (name/number/size lines per design) and a combined size-breakdown chip row on `/portal/orders/<id>`, so that route now owes screenshots for its **collected-roster state** as well as O-06's locked/unlocked pair. Order `jh7ad7376r9ffvkz1vhs0s5b458b9v0e` ("Westerns Test") is the one with a live run and five order entries across XS/S/M/L/4XL — it's the order worth photographing, since the empty orders show none of the new UI.

**Update (2026-07-27, ralph-loop, from C-02):** re-confirmed once more — `node scripts/snap.mjs C-02 /portal/orders/jh7ad7376r9ffvkz1vhs0s5b458b9v0e/run/responses` returned six more photographs of the sign-in wall, deleted. C-02 added an **All responses / By roster / By fan** tab switcher plus a size-breakdown chip row to `/portal/orders/<id>/run/responses`, so the pass now also owes that route **in each of its three views** (a captain session is enough). The same "Westerns Test" order above is the one to shoot — its run has the five entries; every other run is empty and shows only the share-link empty state.

**Answer:** _(human fills in — or just re-run `--login` and unpark D-09 with `node scripts/dag-update.js answer D-09`)_

**Update (2026-07-28, ralph-loop, from B-02):** the expired-session diagnosis
above is now **out of date, and the admin half of D-09 has a different cause**.
`snap.mjs` re-logged in on its own this iteration and photographed real pages —
`/admin/orders`, `/admin/designs`, `/admin/jersey-runs` and `/admin/customers`
all rendered, and every single one rendered **"403 — Access Denied"**. So the
session works; the account behind `SNAP_UID` (jcc@sidestep.design) simply isn't
an admin. Its `users` row reads `isAdmin: false`, and only jdcc1024@gmail.com
has `isAdmin: true`. That blocks `/admin/designs/<id>` for D-09 and every other
admin surface for every future iteration — tracked separately as **B-06**.
Captain-side routes are unaffected and photograph fine.

### [B-05] Populate user profiles on production Convex — 2026-07-28, ralph-loop
**Question:** Please set `CLERK_SECRET_KEY` on the **production** Convex deployment and run the one-off profile backfill there — or confirm you'd like an agent to do it.

**Context:** B-02 fixed blank captain/owner names. The fix reads a user's real name and email from Clerk's Backend API, which needs `CLERK_SECRET_KEY` as a *Convex* environment variable (it is currently only in `.env.local`, which Convex functions cannot see). I set it on dev (`benevolent-starling-766`) and ran the backfill — 4/4 rows repaired, every order/design/run now joins to a named captain. Production (`befitting-caiman-205`) is read-only from the loop by design, and pushing to prod is outside what an iteration may do.

**What's needed, once B-02 is deployed:**
```
npx convex env set --prod CLERK_SECRET_KEY sk_live_...
npx convex run --prod users:backfillProfilesFromClerk '{}'
```
The second command prints `{ scanned, patched, missing }`. `missing` counts users Clerk no longer has; those rows stay blank on purpose, since orders still reference them.

**Options considered:**
1. **You run both commands** — a minute of work, and the secret never leaves your machine.
2. **Skip the backfill and let it self-heal** — every existing user's row is repaired the next time they sign in, since `UserSync` now fetches a profile whenever the row is incomplete. Correct but slow, and admin lists stay wrong for anyone who doesn't log back in.
3. **Grant an agent prod write access** — not worth it for a one-off.

**Recommendation:** Option 1. Note that even without the backfill, the env var alone is required — without it `hydrateProfileFromClerk` logs a warning and no-ops, so new sign-ups on prod would keep landing blank.

**Answer:** _(human fills in)_

### [B-06] Snap user cannot reach any /admin route — 2026-07-28, ralph-loop
**Question:** Should the screenshot account (`SNAP_UID` = jcc@sidestep.design) be granted admin, or would you rather admin surfaces never be screenshotted by the loop?

**Context:** Verifying B-02's admin-surface criterion, `snap.mjs` logged in cleanly and captured `/admin/orders`, `/admin/designs`, `/admin/jersey-runs` and `/admin/customers` — all four returned **"403 — Access Denied"** at every viewport. The account's `users` row has `isAdmin: false`; only jdcc1024@gmail.com is an admin. I deleted the captures rather than file 24 pictures of an error page, and verified B-02 at the data layer instead.

This is not specific to B-02. **No admin UI can be reviewed from the loop at all** until it's resolved — including `/admin/designs/<id>`, which D-09 is waiting to photograph.

`isAdmin` is written only by the Clerk webhook from `privateMetadata.is_admin`, so this is a Clerk dashboard change, and granting admin is a privilege decision I shouldn't make unilaterally.

**Options considered:**
1. **Set `privateMetadata.is_admin = true` on jcc@sidestep.design in Clerk.** Unblocks every admin screenshot. It is a real account with real admin power in dev; if that account is only ever used for screenshots, the blast radius is the dev deployment.
2. **Point `SNAP_UID` at a dedicated `snapbot@sidestep.design` admin user.** Same effect, keeps a human's account out of it, costs one new Clerk user and a password in `.env.local`.
3. **Accept that admin surfaces are never screenshotted** and review them by running the app yourself. Zero setup; the loop keeps shipping admin UI blind.

**Recommendation:** Option 2 if you plan to keep the loop running on admin surfaces — a purpose-built account is cleaner than promoting one you use. Option 1 is fine if jcc@sidestep.design is already just a test identity.

**Answer:** _(human fills in)_

## Answered

### [2-14] Optional Intake Image Uploads — 2026-07-19, ralph-loop
**Question:** What abuse-control mechanism should gate anonymous file uploads on the public, unauthenticated intake form, before we build the upload feature?
**Context:** The intake form (`/`-adjacent public route, no Clerk session) is the only place in the app where an unauthenticated visitor would write to Convex storage. Every other upload surface (design creation, 2-05) sits behind login. An open `generateUploadUrl` endpoint would let a script fill the storage bucket or upload abusive content with no rate limit and no record of who did it.
**Options considered:**
1. Cloudflare Turnstile (invisible CAPTCHA) gating the upload-URL mutation.
2. Per-IP rate limit on the upload-URL-issuing mutation via a Convex HTTP action.
3. Signed, tightly-scoped upload URLs alone.
4. Server-side proxy that validates size/MIME before writing to Convex.
**Recommendation (agent):** Option 2 (per-IP rate limit) + server-side size/MIME caps.
**Answer (2026-07-19, human):** None of the above — **remove anonymous uploads from the problem entirely.** The public intake form will not accept file uploads at all. Instead it takes *links* to a share folder the visitor already keeps their inspiration in (OneDrive / Dropbox / Google Drive): we store plain-text URLs, never files, so there is no storage bucket to abuse and the whole abuse-control question is moot. Actual binary image upload stays confined to the authenticated customer portal, where a signed-in customer starts a Design (2-05, already shipped). 2-14 is reshaped accordingly (see `backlog/2-14-optional-intake-image-uploads.md`, "Decision") and unparked.
