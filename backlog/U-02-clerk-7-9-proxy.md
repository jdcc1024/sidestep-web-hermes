# Issue: Upgrade Clerk to 7.9, drop the stale overrides, rename middleware.ts to proxy.ts

## Phase: 3

## Type: infrastructure

## Size: S (~6 files, ss-dev by hand; Claude ≤ $2 only if type/lint fallout; SDET ~$1)

## Description

Design: `docs/architecture/next-upgrade.md` (section "U-02 and U-03, as filed").
Follows U-01 (Next 16.4.0 + React 19.3.0, on main at 636dad6).

Three changes, one variable: the Clerk auth path.

1. `@clerk/nextjs` 7.3.5 → 7.9.x. Today we don't run 7.3.5's own
   dependencies: `package.json` `overrides` pins `@clerk/react 6.6.4` and
   `@clerk/backend 3.4.9`. They were added in `da30d50` "until
   `@clerk/shared` 4.12.1 ships" (only canaries existed then). Shared is at
   4.40.0 now, so the overrides only hold us back. `@clerk/nextjs@7.9.14`
   asks for `@clerk/react ^6.17.8`, `@clerk/backend ^3.23.2`,
   `@clerk/shared ^4.40.0`. Its peer ranges allow `next ^16.0.10` and
   `react ~19.3.0-0`, so 16.4.0 / 19.3.0 fit.
2. `@clerk/testing` 2.2.10 → 2.2.x latest (2.2.45 on 2026-10-12). It is the
   only other Clerk package. It asks for the same `@clerk/backend` /
   `@clerk/shared` ranges, so the tree ends up with one copy of each.
3. `middleware.ts` → `proxy.ts`. `middleware` has been deprecated since
   Next 16.0, and 16.3 deprecated the Edge runtime it runs on. `proxy.ts`
   always runs on the Node runtime and doesn't accept a `runtime` export.
   U-01 deliberately left this rename for U-02 because it moves our auth gate
   from Edge to Node. Clerk has detected `proxy.ts` since
   `@clerk/nextjs` 6.37 (#7269), so `clerkMiddleware()` works unchanged as the default export.

Behaviour must not change: the same routes are public, the same routes
redirect to sign-in, and `/invite?token=…` still sets the cookie and
redirects to `/sign-up`.

### Build steps

1. **Bump.** In `package.json`: `@clerk/nextjs` → `^7.9.14` (or the latest
   7.x on the day), `@clerk/testing` → `^2.2.45` (latest 2.x). Delete the
   whole `overrides` block (it holds only the two Clerk pins). Run
   `npm install`. Check:
   - `npm ls @clerk/backend @clerk/react @clerk/shared` shows one version
     of each, none marked `overridden`
   - `npm audit --omit=dev` lists no `@clerk/*` entry

   If the Hermes scan blocks the install, stop and ask JCC to run the
   install line himself (same as U-01).
2. **Rename.** `git mv middleware.ts proxy.ts`. Keep the file body as it
   is: `export default clerkMiddleware(…)` and the `config.matcher` export.
   Don't add a `runtime` export (Next throws on it in proxy files). Update
   the three comments/docs that say "middleware" about this file:
   `app/(auth)/sign-up/[[...sign-up]]/page.tsx:4`, `app/invite/page.tsx:4`,
   and `docs/OVERVIEW.md` (the layout tree line, the route table row, the
   `### middleware.ts` section and the reading-order line).
   `lib/ownedResource.ts:29` says "middleware-protected": change it to
   "proxy-protected".
3. **Verify.** `npm run verify -- --build`. Fix type or lint fallout from
   Clerk 7.9 in the code, no new `eslint-disable`. Note: Clerk 7.6
   deprecated `createRouteMatcher()`. The `@deprecated` tag shows in the
   editor, but no lint rule here fails on it. **Keep using it in U-02**
   (see Notes).
4. **Run it.** Full `npm run e2e`. Global setup signs in through the new
   `@clerk/testing`, so every authed spec also checks the Clerk bump. Also
   run `npm run build` and confirm the output no longer prints `The
   "middleware" file convention is deprecated` and still lists
   `ƒ Proxy (Middleware)` in the route summary (Next prints that label for
   both conventions, so the missing warning is the signal). Record both in
   the handoff.

## Done when
1. A signed-out visitor who opens `/portal` lands on the sign-in page, and the same visitor can open a player's `/run/<token>` form and see it without signing in.
2. Someone who follows a captain invite link (`/invite?token=<id>`) lands on the sign-up page with the invite cookie set (HTTP-only).
3. An admin signs in and opens an order under `/admin/orders` (already covered: e2e global setup + `e2e/order-lock.spec.ts` admin test, no new spec).

## Logic
- none. No new or changed function. `npm run verify` (incl. `lib/adminFlag`, `lib/clerkProfile`, `convex/users` tests) is the regression check.

## Dependencies
- Blocked by: U-01 (landed). Run after U-03 and after R3-02 lands (see the order note in `docs/architecture/next-upgrade.md`). All three touch `package.json` / `package-lock.json`.

## Notes
- Files likely touched: `package.json`, `package-lock.json`,
  `middleware.ts` → `proxy.ts`, `app/(auth)/sign-up/[[...sign-up]]/page.tsx`,
  `app/invite/page.tsx`, `lib/ownedResource.ts`, `docs/OVERVIEW.md`.
- Done-when 1 and 2 pass on main today. They are regression guards for the
  Edge → Node move, not red tests.
- **Out of scope:** replacing `createRouteMatcher()` with per-resource auth
  checks, as Clerk 7.6 recommends. Our data is already guarded inside
  Convex (`convex/_auth.ts`) and the admin layout re-checks private
  metadata server-side. Here the proxy gates only redirects. Changing who
  can reach which route is a behaviour change and gets its own issue if
  we want it. Also out of scope: tightening `(.*)` patterns to `:path*`.
- Expected unchanged: the Clerk dev instance, env var names, the webhook.
  Clerk 7.9 adds no required env var. `CLERK_DISABLE_AUTO_PROXY` applies
  to Vercel production only.
- Review checks:
  - `overrides` is gone from `package.json`. `npm ls` shows one
    `@clerk/backend`, `@clerk/react` and `@clerk/shared`.
  - `git diff --find-renames main` shows `middleware.ts → proxy.ts` as a
    rename. `isPublicRoute`, the `/invite` branch and `config.matcher` are
    byte-for-byte unchanged. No `runtime` export.
  - No change to `convex/users.ts`, `convex/_auth.ts`,
    `app/api/webhooks/clerk/route.ts`, `app/admin/layout.tsx`,
    `lib/adminFlag.ts` (security invariants: admin comes only from Clerk
    private metadata).
  - `next`, `react`, `convex` versions unchanged.
  - No `eslint-disable` added.
  - The handoff has the `npm audit --omit=dev` output (no `@clerk` entries)
    and the `next build` output: proxy listed, no middleware deprecation
    warning.
