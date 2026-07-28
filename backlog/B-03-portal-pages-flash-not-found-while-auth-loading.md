# Issue: Owner-scoped portal pages flash "not found" while auth is still loading

## Status: done

## Phase: 3

## Type: bug

## Description
Owner-scoped portal detail pages briefly render a definitive **"not found"** state
before their data loads, then correct themselves on the next tick. Observed on
`/portal/orders/[id]` ("Order not found"), `/portal/designs/[id]` ("Design not
found"), and `/portal/designs` ("No designs yet"). Most visible right after a
Convex redeploy (the client reconnects before the Clerk token re-attaches), but
it is **not redeploy-specific** — any real user landing on one of these pages
with a cold or refreshing Clerk token can see the flash.

### Root cause
The owner-scoped queries return `null` / `[]` for **two different reasons** that
the UI can't tell apart:

- `convex/orders.ts:getMyOrder` → `const user = await getCurrentUserOrNull(ctx); if (!user) return null;`
- `convex/designs.ts:getMyDesign` (and `listMyDesigns`) follow the same pattern.

The pages then do `if (result === null) return <NotFound />` (see
`app/portal/orders/[id]/page.tsx:79`). So "no authenticated user yet" is rendered
identically to "this order genuinely doesn't exist / isn't yours." During the
auth-token-attach window the query legitimately returns `null`, and the user sees
"not found."

## Acceptance Criteria
- [x] While Clerk auth is still loading (token not yet attached), these pages show a loading state, not "not found"
- [x] A genuine missing/forbidden resource still shows "not found" (no regression)
- [x] Applies to `/portal/orders/[id]`, `/portal/designs/[id]`, and `/portal/designs` (empty state)
- [x] No flash of "not found" / "no designs" on a normal cold load for a signed-in user

## Resolution
Option 3 — `lib/ownedResource.ts` holds a pure `resolveOwnedResource` plus
`useOwnedResource` / `useOwnedList` hooks. The gate is Convex's
`useConvexAuth()` rather than Clerk's `useAuth()`: it only reports
authenticated once the Convex client has validated the token, which is the
precise moment owner-scoped queries begin answering for a real identity, and it
re-enters loading on a reconnect. Unauthenticated renders as loading — safe
because `/portal/*` is middleware-protected.

Applied beyond the three routes above, to every surface with the same defect:
`/portal` (all three list sections), `/portal/orders/[id]/edit`,
`/portal/orders/[id]/run/setup`, `/portal/orders/[id]/run/responses`.

## Implementation options
1. **Gate on Clerk `isLoaded`/`isSignedIn`** (`useAuth()` from `@clerk/nextjs`) before trusting a `null` result — treat `null` as "loading" until auth is known-ready.
2. **Distinguish the two nulls server-side** — e.g. throw an "unauthenticated" ConvexError (which Convex surfaces distinctly from a resolved `null`) so the client can show loading vs not-found. Weigh against the existing convention of returning `null` for the common "no run yet" starting state.
3. A small shared hook (`useOwnedResource`) that folds "auth loading" + "query undefined" into one loading state, reused across the portal detail pages.

## Dependencies
- Blocked by: none
- Related: 1-03 (auth flows), B-02 (also rooted in the user-sync/auth path)

## Notes
Found during the 2026-07-27 UI walkthrough (see docs/review/session-reports.md).
Purely a perceived-correctness / polish bug — data is never actually wrong once
loaded — but "Order not found" is an alarming thing to flash at a paying captain
opening their own order.
