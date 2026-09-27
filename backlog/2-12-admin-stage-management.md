# Issue: Admin Stage Management

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `orders.internalStages` — updated via Convex mutation when admin checks/unchecks a stage
- [ ] API: Convex mutation `adminUpdateOrderStages` — admin-only; updates the stage checklist and timestamps
- [ ] Frontend: 14-stage checklist on the admin order detail page; real-time update propagates to customer portal
- [ ] Tests: Checking a stage updates `completedAt`; unchecking clears it; customer-facing stage derived correctly after update; non-admin cannot call the mutation

## Description
Add the internal 14-stage checklist to the admin order detail view. When an admin checks a stage, it is marked complete with a timestamp in the `orders.internalStages` array. When unchecked, the timestamp is cleared. Because Convex is real-time, checking a stage here immediately updates the customer-facing stage timeline in the portal (2-07) without any page refresh on the customer's end.

## Acceptance Criteria
- [ ] 14 internal stages displayed as a checklist on the admin order detail page: Inquiry, Planned, Started, Design Ideated, Design Confirmed, Invoice Sent, Order Size Confirmed, Sent to supplier, Invoice Paid, Colour Confirmation, Production, Produced, Shipped, Delivered
- [ ] Each stage shows: checkbox, stage name, and completion timestamp (if completed)
- [ ] Checking a stage calls `adminUpdateOrderStages` mutation; stage gains `completedAt: now`
- [ ] Unchecking a stage clears its `completedAt` (set to null)
- [ ] After any stage update, the customer portal order page (2-07) shows the updated customer-facing stage in real-time (verified manually — Convex subscription handles this automatically)
- [ ] Non-admin users cannot call `adminUpdateOrderStages` — enforced in the Convex function
- [ ] Stage ordering is fixed (matches the 14-stage list above) but stages can be completed out of order
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-11
- Blocks: 3-03

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Admin, manage internal stage checklist), Section 5 (In Scope)

## Implementation Notes
- `internalStages` in the schema is an array of `{ name: string, completedAt: string | null }` — initialize with all 14 stage names and `completedAt: null` when an order is created
- The `adminUpdateOrderStages` mutation takes `orderId` and `stages: Array<{ name: string, completedAt: string | null }>`; it replaces the entire `internalStages` array
- Admin check in mutation: `ctx.auth.getUserIdentity()` → look up user in `users` table → verify `isAdmin === true`; throw `ConvexError` if not
- The checklist component lives in `components/admin/OrderStageChecklist.tsx`
- Stage order is enforced in the UI (fixed list) but not in the database — stages can be completed out of order as per client requirement

## TDD Approach
1. Write test: Call `adminUpdateOrderStages` with a stage checked → assert the `orders` record has that stage with a non-null `completedAt`; call it unchecked → assert `completedAt` is null; call it as a non-admin user → assert it throws a permission error
2. Implement: Build the checklist component, Convex mutation with admin guard, wire to the admin order detail page
3. Verify: Check "Design Confirmed" in admin view; open the customer portal order page in another browser window; confirm the customer-facing stage updates to "Design Confirmed" in real-time
