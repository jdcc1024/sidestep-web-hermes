# Issue: Order Status Tracking

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `orders` table — read `internalStages`; compute customer-facing stage from mapping
- [ ] API: Convex query `getOrder` (includes customer-facing stage derivation)
- [ ] Frontend: Order detail page with visual stage timeline; linked designs; order details summary
- [ ] Tests: Customer-facing stage derives correctly from each internal stage combination; real-time update when stage changes; captain cannot see internal stage names

## Description
Build the order detail page in the customer portal, showing the captain their order's progress through the 8 customer-facing stages as a visual timeline. The page also shows linked designs, order specifications, and any notes Sidestep has added. Stage data is a real-time Convex subscription — when an admin updates the internal checklist (2-12), the customer's view updates live without a page refresh.

## Acceptance Criteria
- [ ] Order detail page shows: team name, sport, quantity, jersey specs (style, neckline, sleeve), creation date
- [ ] Linked designs shown as cards with title and file count; clicking a design opens the design detail page
- [ ] Customer-facing stage timeline: 8 stages displayed as a horizontal or vertical progress indicator; current stage highlighted; past stages marked as complete; future stages grayed out
- [ ] Stages in order: Order Started → Design Ideated → Design Confirmed → Order Size Confirmed → Production Started → Full Production → Shipped → Delivered
- [ ] Stage derives from `internalStages` in real-time via Convex subscription — changes by admin are reflected instantly
- [ ] Internal stage names (e.g., "Invoice Sent", "Sent to supplier") are NOT visible to the customer
- [ ] Page is accessible and mobile responsive
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-06
- Blocks: 2-08, 3-04

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Order tracking), Section 8 (Success Metrics — real-time updates)

## Implementation Notes
- Route: `app/(portal)/orders/[id]/page.tsx`
- Stage mapping logic in `lib/orderStages.ts`: define which internal stages correspond to each customer-facing stage; the customer-facing stage is the most advanced one whose prerequisite internal stages are all completed
- Example mapping: "Design Confirmed" is shown when both "Design Ideated" and "Design Confirmed" internal stages are completed
- Use Convex `useQuery` — the subscription is automatic; the component re-renders when the order data changes
- The stage timeline component should be in `components/portal/OrderTimeline.tsx` — it takes the current customer-facing stage as a prop

## TDD Approach
1. Write test: Unit test `deriveCustomerStage(internalStages)` in `lib/orderStages.ts` — test every stage transition; integration test that the order detail page renders the correct stage chip when Convex returns specific internal stage data
2. Implement: Build the stage mapping function, the order detail page, and the timeline component
3. Verify: Open order detail; have admin update a stage in Convex dashboard; confirm the customer's page updates live without refresh
