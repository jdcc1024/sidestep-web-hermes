# Issue: Authentication Flows

## Phase: 1

## Type: infrastructure

## Vertical Slice
This issue touches:
- [ ] Database: Convex user sync (create/update user record on Clerk webhook)
- [ ] API: Convex mutation `syncUser` called from Clerk webhook; `getUser` query; server-side admin check via Clerk `privateMetadata`
- [ ] Frontend: Clerk `<SignIn>`, `<SignUp>`, and `<UserButton>` components wired into Next.js; invite-link registration route; middleware for route protection
- [ ] Tests: Self-registration flow creates user record; invite link renders with pre-filled data; admin flag inaccessible from client

## Description
Wire up Clerk authentication end-to-end: self-registration (captain lands on empty portal), invite-link registration (captain lands with pre-filled order form using data from their intake submission), and Convex user sync (Clerk webhook creates/updates the user record in Convex on every sign-in). Admin flag is set via Clerk `privateMetadata` and is only readable server-side.

## Acceptance Criteria
- [ ] Self-registration creates a Clerk account and triggers a Convex `syncUser` mutation that upserts the `users` table
- [ ] Invite link (`/invite?token=<intakeId>`) routes to the sign-up page; after registration, the portal order form is pre-populated with data from the matching `intakes` record
- [ ] Clerk middleware protects all `/portal/*` and `/admin/*` routes — unauthenticated users are redirected to sign-in
- [ ] Admin routes additionally check `privateMetadata.isAdmin === true` server-side; any other user gets a 403
- [ ] Client-side code cannot read `privateMetadata` — verified by attempting to access it in a Client Component (should be undefined)
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 1-02
- Blocks: 1-04

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 5 (Scope), Section 6 (Implementation Decisions — Auth, Email)

## Implementation Notes
- `ClerkProvider` wraps the Next.js app in `app/layout.tsx`
- Route protection: Next.js middleware (`middleware.ts`) uses `clerkMiddleware()` from `@clerk/nextjs/server`
- Admin check: use `auth().sessionClaims` on the server to read `privateMetadata` — never expose this to the client
- Convex + Clerk integration: use `ConvexProviderWithClerk` from `@clerk/nextjs/convex` — this passes the Clerk JWT to Convex automatically
- Clerk webhook: create a `/api/webhooks/clerk` route that handles `user.created` and `user.updated` events to sync with Convex
- Invite token: encode the `intakeId` in the invite link; after registration, the portal reads this from the URL to pre-fill the order form

## TDD Approach
1. Write test: Mock Clerk session; verify `/portal` returns 200 for authenticated user and 302 for unauthenticated; verify `/admin` returns 403 for non-admin authenticated user
2. Implement: Set up `middleware.ts`, Clerk webhook route, `syncUser` Convex mutation, invite link route, Resend notification
3. Verify: Create a test account → user appears in Convex `users` table; admin email arrives; invite link pre-fills form
