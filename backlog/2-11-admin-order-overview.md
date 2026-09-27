# Issue: Admin Order Overview

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: Query all `orders` and `designs` across all users (admin-only)
- [ ] API: Convex queries `adminListOrders` and `adminListDesigns` — gated by admin check
- [ ] Frontend: Admin orders list page with sortable table; admin designs list; admin order detail view
- [ ] Tests: Admin user sees all orders; non-admin user gets 403; order detail shows correct customer info and all fields

## Description
Build the admin orders overview — the central command view for Sidestep staff. Admins see every order in the system in a sortable table (team name, captain, sport, quantity, current internal stage, created date). Clicking any order opens a full detail view showing all order fields, the captain's contact info, linked designs, and the internal stage checklist (built in 2-12). Non-admin users attempting to access these routes are rejected.

## Acceptance Criteria
- [ ] Admin-protected route (`/admin/orders`) — returns 403 for non-admin users
- [ ] Orders table columns: team name, captain name, sport, estimated quantity, current internal stage, created date; sortable by any column
- [ ] Clicking a row opens the admin order detail page (`/admin/orders/[id]`)
- [ ] Admin order detail shows: all order fields (same as portal view) + captain's name and email + linked designs (with download links for uploaded files) + internal stage checklist (placeholder for 2-12) + jersey run summary (if one exists)
- [ ] Admin designs list page (`/admin/designs`) shows all designs across all users with owner name, title, file count, and created date
- [ ] Data loads via Convex — real-time subscriptions (updates appear without refresh)
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 1-04
- Blocks: 2-12, 2-13

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Admin), Section 5 (In Scope — Admin dashboard)

## Implementation Notes
- Routes: `app/(admin)/orders/page.tsx`, `app/(admin)/orders/[id]/page.tsx`, `app/(admin)/designs/page.tsx`
- Admin check: server-side via Clerk `auth().sessionClaims.metadata.isAdmin` — if false, return `notFound()` or redirect to `/`
- Convex queries must also enforce admin: use `ctx.auth.getUserIdentity()` and cross-reference the `users` table `isAdmin` field OR check Clerk JWT claims in the Convex function
- The admin detail view is the same as the captain's order detail but with additional fields: captain email, all internal stages (not just the customer-facing ones), and admin-only edit capabilities (from 2-12 and 2-13)
- Use a simple HTML `<table>` with Tailwind for the orders list — sortable via client-side state

## TDD Approach
1. Write test: Mock an admin session → assert `adminListOrders` query returns all orders; mock a non-admin session → assert the route redirects or returns 403; render the orders table → assert each row shows the correct team name and stage
2. Implement: Build the admin orders and designs pages, Convex admin queries with auth guards, sortable table component
3. Verify: Log in as admin; confirm all test orders appear; click into a detail view; confirm non-admin user is rejected
