# Issue: Blank Captain / Owner / Customer names across admin surfaces

## Status: done

## Phase: 3

## Type: bug

## Description
Every admin surface that shows a user's name or email renders it blank: the
**All Orders** and **All Jersey Runs** "Captain" columns are empty, **All Designs**
"Owner" is empty, and the Customers list shows every row as "Unnamed customer".
The admin order detail "Captain" card previously rendered an *empty clickable
link* because of this (fixed cosmetically — see below). Even the currently
signed-in admin's `users` record has empty `name`/`email`, despite the portal
header greeting them by name (that greeting reads Clerk's `useUser()` client-side,
not the Convex record).

### Root cause
`convex/users.ts:syncCurrentUser` *does* read `identity.name` / `identity.email`
and patch them — but `UserSync` (in `app/providers.tsx`) only calls it when
`getCurrentUser` returns `null`. So a `users` row created before name/email were
being captured (or created while the Clerk JWT lacked those claims) is **never
backfilled** on subsequent logins. Two things to verify/fix:

1. **Clerk JWT template** — confirm the `convex` JWT template actually maps
   `name` and `email` claims. If it doesn't, `identity.name`/`identity.email` are
   `null` and every synced row is blank at the source. (Config lives in the Clerk
   dashboard, not the repo — hence this can't be settled from code alone.)
2. **Backfill path** — the query-gated sync means existing blank rows stay blank.
   Either always patch name/email on load, or run a one-off backfill, or let the
   production Clerk webhook (`users.syncUser`) own it.

This overlaps with — but is not the same as — [3-07 user-sync-architecture-revisit]
(which is about *where* sync runs, not the *missing-data symptom*). Fixing 3-07's
webhook path would likely resolve this, but the blank data and the JWT-claim
question should be confirmed independently.

### Root cause — settled (2026-07-28)

Both suspects above were checked against the live Clerk instance
(`ins_3DuHs2gKpVV9pwSy8zNGAP0p9Zj`, dev) and the dev Convex deployment. Two
independent bugs, either one of which is enough to blank every row:

1. **There is no `convex` JWT template, and there should not be one.**
   `GET /v1/jwt_templates` returns `[]`. The app uses Clerk's first-party
   Convex integration: `ConvexProviderWithClerk` sees `sessionClaims.aud ===
   "convex"` and calls `getToken()` *without* a template, so a template would
   be ignored even if it existed. The default session token that Convex
   actually receives decodes to exactly:
   `{aud: "convex", exp, fva, iat, iss, nbf, sid, sts, sub, v: 2}` — no `name`,
   no `email`. `identity.name` / `identity.email` are therefore always null and
   `syncCurrentUser` wrote `""` every time. (Adding the claims via Clerk's
   dashboard "customize session token" is possible but dashboard-only — there
   is no Backend API for it — so the fix does not depend on it.)
2. **The webhook's primary-email lookup never matched.** Clerk user payloads
   carry no `primary` boolean on an address; the primary is named by
   `primary_email_address_id`. `email_addresses.find((e) => e.primary)`
   returned undefined, so the webhook path wrote `""` for email and — via the
   `|| primaryEmail` fallback — `""` for name too.

Third, smaller bug: `syncCurrentUser` patched `{email, name}` unconditionally,
so a client sync would wipe a profile the webhook had just written correctly.

### Fix

- `lib/clerkProfile.ts` — one module for reading a profile out of a Clerk user
  payload (`clerkProfileOf`, correct primary-email resolution) plus
  `fetchClerkUser` against the Backend API. Shared by the webhook, the
  registration email, and Convex.
- `users.hydrateProfileFromClerk` (action) — fetches the caller's real profile
  from Clerk and patches name/email only. Never touches `isAdmin`; the webhook
  keeps that.
- `users.backfillProfilesFromClerk` (internal action) — one-off repair of rows
  already blank. Run: `npx convex run users:backfillProfilesFromClerk '{}'`
  (add `--prod` for production).
- `UserSync` calls `syncCurrentUser` when the row is missing and
  `hydrateProfileFromClerk` when it exists but is incomplete — so a populated
  user still costs zero writes per page load.

**Deployment requirement:** `CLERK_SECRET_KEY` must be set as a *Convex*
environment variable (`npx convex env set CLERK_SECRET_KEY ...`), not just in
`.env.local`. Done on dev; production still needs it — see B-05.

## Acceptance Criteria
- [x] The Clerk `convex` JWT template is confirmed to include `name` + `email` claims (documented)
      — confirmed *negatively*: no template exists, templates are bypassed by
      this integration, and the default session token carries neither claim.
      Documented above; the fix routes around it instead.
- [x] A signed-in user's Convex `users` row has their name/email populated after login
- [x] Existing blank `users` rows are backfilled (one-off migration or on-login patch)
      — dev backfilled (4/4 rows); prod tracked in B-05
- [x] Admin Orders / Jersey Runs / Designs / Customers show real names, not fallbacks
- [x] No regression to the `getCurrentUser`-gated sync perf goal (don't reintroduce a write on every load without cause)

## Dependencies
- Blocked by: none (can verify JWT template + write a backfill independently)
- Related: 3-07 (user sync architecture), 1-03 (auth flows)

## Notes
Cosmetic fallbacks already landed so the surfaces don't look broken while the
data is blank: admin order detail Captain card now shows "Unnamed captain" (still
a link to the profile) + "Not set" for a missing email; the Orders and Jersey
Runs list "Captain" columns fall back to "Unnamed captain". The Customers list
already used "Unnamed customer", and the customer detail page already shows
"Not set" with an inline note that Clerk may overwrite manual edits. These are
band-aids — the real fix is populating the data.
