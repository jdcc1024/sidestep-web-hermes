# Issue: User Sync Architecture Revisit

## Phase: 3

## Type: improvement

## Description
The current user sync mechanism (1-03) uses a client-side `useQuery` + `useMutation` pattern in `providers.tsx`. `getCurrentUser` runs on every page load for authenticated users; `syncCurrentUser` fires only when that query returns `null`. This is functional but not architecturally clean — it incurs a Convex query on every authenticated page load and relies on client-side logic to enforce a server-side invariant.

Evaluate and implement a better approach. Leading candidates:

1. **Convex HTTP action as Clerk webhook handler** — handle the Clerk `user.created` webhook entirely within Convex (via `httpRouter` in `convex/http.ts`), calling an internal mutation. No unauthenticated public mutations. Requires ngrok or a public URL for local dev.

2. **Convex auth trigger** — if Convex adds first-class support for running a function when a new identity is seen for the first time, adopt that.

3. **Hybrid** — keep client-side sync for local dev, add the webhook path for production, feature-flagged by env var.

## Acceptance Criteria
- [ ] Sync fires exactly once on user creation — not on every page load
- [ ] No public mutation callable by unauthenticated external callers
- [ ] Works in local dev without ngrok or manual steps (or documents the tradeoff clearly)
- [ ] Existing `users` table data is preserved during migration
- [ ] `getCurrentUser` query removed from `UserSync` hot path if no longer needed

## Dependencies
- Blocked by: 1-03 (auth flows), 3-06 (registration email — may share webhook infrastructure)
- Blocks: none

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 6 (Implementation Decisions — Auth)

## Notes
Related decision log: the query-gated approach was chosen in 1-03 to avoid ngrok as a local dev dependency. The webhook approach (originally in 1-03, moved to 3-06 for email) is the production-grade answer but needs a public URL during development. Revisit once the deployment pipeline is clearer.
