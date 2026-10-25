# Issue: Admin pages 500 when one Clerk Backend API call drops

## Phase: 1

## Type: bug

## Size: XS (4 files; Claude ~$1; SDET ~$1–2)

## Description

Split out of PROC-02 (§3 row a) so it ships now. JCC, #office-hours
2026-10-25 ("Q1. A / Q2. A"): fix the admin 500 as a small bug; the rest of
PROC-02 (P4a, P4b, P5 b–d) waits for the speed check (t_d81a8104).

### Root cause (from the timed run, `docs/architecture/process-e2e-timed-run.md` §3)

`app/admin/layout.tsx:15` calls `currentUser()` from `@clerk/nextjs/server`.
That is one Clerk Backend API HTTPS call per admin page render, with no
retry. On 2026-10-21 one call failed after 10.7 s:

```
⨯ ClerkAPIResponseError … errors: [{ code: 'unexpected_error', message: 'fetch failed' }]
   at app/admin/layout.tsx:15
GET /admin/orders/<id> 500 in 10.8s (application-code: 10.7s)
```

Every page under `/admin` renders through this layout, so one dropped call
500s whatever admin page was open. A real admin can hit it. It is also the
`order-lock.spec.ts:110` [mobile] flake.

How Clerk reports a dropped call (read in
`node_modules/@clerk/backend/dist/chunk-6WIZH2FO.mjs`, `buildRequest`):
when `fetch` throws, the request function returns
`errors: [{ code: "unexpected_error", message: err.message }]` with **no
`status`**, and `withLegacyRequestReturn` throws a `ClerkAPIResponseError`
whose `status` is `undefined` and whose `message` is the (often empty)
`statusText`. A real HTTP error (401, 404, 429, 5xx) always carries a
numeric `status`. So "no numeric `status`" plus a transport message in
`errors[0].message` identifies a dropped call exactly.

### Options considered

| Option | Verdict |
|---|---|
| **A. `withTransientRetry(fn)` in `lib/transientRetry.ts`: one immediate retry, only for transport errors** | **Picked.** Pure function, unit-testable without Clerk, ~20 lines. The layout diff is one wrapped call |
| B. Catch the error in the layout and render a "try again" page | Rejected. The admin still loses the page for a fault that a second call fixes; it only swaps a 500 for a friendlier dead end |
| C. Retry on any error, or several retries with backoff | Rejected. Retrying 401/403/404 is wrong, retrying 429/5xx adds load to a struggling API, and more than one retry can stall a render well past 20 s (the failed call already took 10.7 s) |
| D. Cache the Clerk user (per request or across requests) | Rejected. A cross-request cache would let a revoked admin keep access, which breaks the security invariant. Per-request dedupe doesn't help: there is one call per render already |

### The fix

- New `lib/transientRetry.ts`:
  - `isTransientFetchError(err: unknown): boolean`: true only when `err`
    has no numeric `status` **and** `err.message` or `err.errors?.[0]?.message`
    matches `fetch failed`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN` or
    `socket hang up` (case-insensitive). Anything else, including a
    non-object, is false.
  - `withTransientRetry<T>(fn: () => Promise<T>): Promise<T>`: call `fn`; if
    it throws and `isTransientFetchError(err)`, call it **once** more and
    return or throw that result. Any other error is rethrown at once. No
    delay, no timeout, no logging requirement.
- `app/admin/layout.tsx:15`:
  `const user = await withTransientRetry(() => currentUser());`
  Nothing else in the file changes.

Signed-out requests: `currentUser()` returns `null` without a network call,
so nothing changes for them. `currentUser()` returns the `getUser` promise
unawaited from inside its try (`node_modules/@clerk/nextjs/dist/esm/app-router/server/currentUser.js:12`),
so the `ClerkAPIResponseError` reaches the wrapper unchanged. Next.js
control-flow errors that `auth()` can throw (dynamic usage, redirects) have no
transport message, so they are rethrown at once, as they must be.

## Done when
1. A signed-in admin opens `/admin/orders/<id>` for a seeded order and sees the order's detail page (no 500, no 403). (E2E; existing admin specs such as `order-lock.spec.ts` already cover this path, so SDET may point at them instead of adding a spec.)
2. A signed-in non-admin opens `/admin/orders/<id>` and sees the 403 page. (E2E; same: an existing spec may cover it.)
3. With exactly one Clerk Backend API call forced to fail at the transport level (the dev uses a temporary, uncommitted monkey-patch or local env flag), an admin opening `/admin/orders/<id>` still sees the order, and a non-admin still gets the 403 page. (Dev check, not E2E: the build card's handoff carries the screenshot pair and the dev-log line showing two calls.)

## Logic
- `withTransientRetry` / `isTransientFetchError` (`lib/transientRetry.ts`): one transport failure then success → returns the value after exactly 2 calls; an error with an HTTP `status` (401/404/429/500) → rethrown after 1 call, never retried; two transport failures → throws the second error after 2 calls.

## Dependencies
- Blocked by: none. Independent of PROC-02; they touch no common file.

## Notes

**Review checks (read the diff, not tests)**
- `app/admin/layout.tsx` is a security file (see `sidestep-website-dev`
  security invariants). The diff may only wrap `currentUser()`. Admin still
  comes from `isAdminFromClerk(user?.privateMetadata)` and nothing else. No
  retry on 4xx/5xx, at most 2 calls in total, and no new caching of the user.
- The monkey-patch or flag used for Done-when 3 is not in the diff.
- `playwright.config.ts` unchanged; no new dependency in `package.json`.

**Who does what**
- SDET (tests card): `lib/transientRetry.test.ts` (the Logic line). Done-when
  1–2 point at existing specs or add one small spec; Done-when 3 is the dev's.
- Dev (build card): `lib/transientRetry.ts`, `app/admin/layout.tsx`. Runs
  Done-when 3.

**Files likely touched (3–4)**
- new: `lib/transientRetry.ts`, `lib/transientRetry.test.ts`
- changed: `app/admin/layout.tsx`
- maybe: one `e2e/*.b10.spec.ts` if no existing spec covers Done-when 1–2

**Speed check (t_d81a8104):** this changes nothing the check measures beyond
removing one flake (`order-lock.spec.ts:110`). The retry costs nothing on the
happy path; it adds one Clerk call only when the first one has already failed.

**Branch:** `fix/B-10-admin-currentuser-retry`, cut from `main`.
