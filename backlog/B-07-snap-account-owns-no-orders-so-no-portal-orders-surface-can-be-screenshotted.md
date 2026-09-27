# Issue: Snap account owns no orders, so no /portal/orders/* surface can be screenshotted

## Phase: 3

## Type: infrastructure

## Description

`SNAP_UID` (jcc@sidestep.design) owns **zero** orders and **zero** designs on the
dev deployment — all four dev orders and both designs belong to
jdcc1024@gmail.com. Every `/portal/orders/<id>` route an agent tries to
photograph therefore either 404s or throws "You don't have access to this
order", and `/portal` itself shows three empty states. B-04 (the no-run-yet
fix) shipped with no screenshots for exactly this reason, and every future
captain-side task hits the same wall.

On top of that, `/portal` came back `net::ERR_ABORTED` under Playwright. Root
cause is **not** a routing bug: `.auth/state.json` holds a Clerk `__session`
JWT that expires within a minute of being saved, so a snap run against a stale
state file gets `auth.protect()` → Clerk Account Portal
(`*.accounts.dev/sign-in`) → back → loop, which surfaces as an aborted
navigation. With a freshly saved session the same route returns 200 and renders
"Welcome back, Captain." `snap.mjs` only auto-logs-in when `.auth/state.json`
is **absent**, so a stale-but-present file is used as-is.

## Acceptance Criteria

- [x] SNAP_UID owns at least one dev order with a jersey run and one without
- [x] `node scripts/snap.mjs` on `/portal` and `/portal/orders/<id>/run/responses` produces non-blank captures
- [x] The no-run-yet state from B-04 is photographable
- [x] Seeding is idempotent and scoped to one account, so re-running it can't multiply fixtures or touch anybody else's rows
- [x] The stale-session cause of the `/portal` abort is documented where agents will read it

## Dependencies

- Blocked by: none

## Notes

- Fixtures live in `convex/_devSeed.ts` as an `internalMutation`, following the
  `convex/_migrations.ts` precedent: not callable from the client, invoked with
  `npx convex run _devSeed:seedPortalFixtures '{"email":"..."}'`.
- Two orders on purpose: one **with** a run (roster + order entries, so the
  C-01/C-02 breakdown surfaces have content to render) and one **without** a
  run (so B-04's `NoRunYet` branch is photographable at all).
- The seed refuses to create users. It resolves an existing `users` row by
  email and throws if there isn't one — a Clerk account has to exist first, and
  inventing a `users` row would produce an account nobody can sign in as.
- Related snap blind spots tracked separately: **B-06** (snap user isn't an
  admin, so `/admin/*` renders 403).
