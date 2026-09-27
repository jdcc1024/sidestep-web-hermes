# Issue: Order Creation

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `orders` table — write via Convex mutation; link design IDs
- [ ] API: Convex mutation `createOrder`; query `listMyDesigns` (to populate design picker)
- [ ] Frontend: Order creation form with all fields and design-linking UI
- [ ] Tests: Form creates order with correct fields; design links are saved; order appears in dashboard with "Order Started" stage

## Description
Build the full order creation form in the customer portal. A captain fills in team details, jersey specifications, estimated quantity, and optionally links one or more of their existing designs to the order. On save, the order is created in Convex with the initial internal stage "Inquiry" and the customer-facing stage "Order Started", and appears in the portal dashboard.

## Acceptance Criteria
- [ ] Order form fields: team name (required), sport type (text, required), estimated quantity (number, required, min 1), jersey style (text/select, required), neckline (Crew Neck / V-Neck, required), sleeve style (Regular / Raglan, required), has-own-design checkbox
- [ ] Design linking: if the captain has existing designs, show a multi-select list of their designs to attach to this order; zero designs linked is valid
- [ ] On save, order is created with `internalStages` initialized to `[{ name: "Inquiry", completedAt: <now> }]`
- [ ] New order appears in the portal dashboard with "Order Started" customer-facing status chip
- [ ] After creation, the captain is redirected to the order detail page (2-07)
- [ ] Form validates all required fields before submission; clear inline error messages
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-05
- Blocks: 2-07, 2-08

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Customer Portal), Section 5 (In Scope)

## Implementation Notes
- Route: `app/(portal)/orders/new/page.tsx`
- Convex functions: `convex/orders.ts` — `createOrder`, `getOrder`, `listMyOrders`
- The design-linking multi-select should be a simple checkbox list of the captain's designs (title + file count); empty state shows "No designs yet — you can add one after creating this order"
- `internalStages` is an array; initialize with `[{ name: "Inquiry", completedAt: new Date().toISOString() }]`
- Customer-facing stage mapping lives in `lib/orderStages.ts` — the mapping from internal stages to customer-facing labels is defined here (to be reused in 2-07 and 2-12)
- Jersey style is a free-text field for Phase 1 (the product catalog isn't formalized yet); add a placeholder hint like "e.g., Ultimate Frisbee jersey, Hockey jersey"

## TDD Approach
1. Write test: Submit form with all required fields → assert `createOrder` mutation called with correct teamName, sport, quantity, jerseyStyle, neckline, sleeveStyle, and designIds; assert order has initial "Inquiry" internal stage
2. Implement: Build the form, Convex mutation, and redirect to order detail
3. Verify: Create an order in browser; confirm it appears in dashboard; confirm internal stage is visible in Convex dashboard
