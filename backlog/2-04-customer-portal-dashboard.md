# Issue: Customer Portal Dashboard

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: Query `orders` and `designs` by `captainId` (current user)
- [ ] API: Convex queries `listMyOrders` and `listMyDesigns`
- [ ] Frontend: Portal home page with orders list, designs list, and empty states
- [ ] Tests: Renders empty state for new user; renders order/design cards when data exists; unauthenticated users are redirected

## Description
Build the authenticated customer portal home page. A logged-in captain sees two sections: their orders (with status chips showing the current customer-facing stage) and their designs (with upload counts and brief previews). New users with no data see friendly empty states with CTAs to create their first order or design. This is the hub that customers return to throughout their relationship with Sidestep.

## Acceptance Criteria
- [ ] Authenticated route — unauthenticated users redirected to sign-in
- [ ] "My Orders" section: list of orders with team name, sport, quantity, current customer-facing stage as a color-coded status chip; clicking an order navigates to the order detail page (2-07)
- [ ] "My Designs" section: list of designs with title, brief preview (truncated), file count; clicking a design navigates to the design detail page
- [ ] Empty state for orders: illustration or icon + "You don't have any orders yet" + "Start your first order →" button
- [ ] Empty state for designs: illustration or icon + "No designs yet" + "Upload a design →" button
- [ ] Data loads via Convex real-time subscription — updates without page refresh
- [ ] Page is responsive at 375px, 768px, 1280px
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 1-04
- Blocks: 2-05, 2-06, 2-07

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Customer Portal), Section 8 (Success Metrics)

## Implementation Notes
- Route: `app/(portal)/dashboard/page.tsx`
- Use Convex `useQuery` hook for real-time data — queries auto-update when data changes
- Customer-facing stages: Order Started, Design Ideated, Design Confirmed, Order Size Confirmed, Production Started, Full Production, Shipped, Delivered — derive from `internalStages` in the order record
- Status chip colors: pending stages = grey, in-progress = amber, final stages = green — define a mapping in `lib/orderStages.ts`
- Keep order and design card components in `components/portal/` for reuse

## TDD Approach
1. Write test: Mock Convex query returning an empty array → assert empty state renders with CTA; mock with one order → assert order card renders with correct team name and status chip
2. Implement: Build dashboard page, Convex queries, order card and design card components
3. Verify: Sign in as a test user; confirm empty states; create an order via Convex dashboard and confirm it appears without page refresh
