# Issue: Blank Captain / Owner / Customer names across admin surfaces

## Status: pending

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

## Acceptance Criteria
- [ ] The Clerk `convex` JWT template is confirmed to include `name` + `email` claims (documented)
- [ ] A signed-in user's Convex `users` row has their name/email populated after login
- [ ] Existing blank `users` rows are backfilled (one-off migration or on-login patch)
- [ ] Admin Orders / Jersey Runs / Designs / Customers show real names, not fallbacks
- [ ] No regression to the `getCurrentUser`-gated sync perf goal (don't reintroduce a write on every load without cause)

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
