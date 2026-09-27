# Issue: Pricing Calculator

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: None (pure client-side computation)
- [ ] API: None
- [ ] Frontend: Interactive calculator component on the marketing site pricing section
- [ ] Tests: Unit tests for all tier boundary conditions and design fee toggle; component renders correctly

## Description
Build the public pricing calculator on the marketing site pricing section. A visitor enters a jersey quantity, optionally toggles the design fee, and sees an instant estimated total. No login required. The output is clearly labeled as an estimate. Computation is pure client-side with no API call.

## Acceptance Criteria
- [x] Quantity input: number field, min 1, no max enforced in UI (but priced at 50+ tier beyond 50)
- [x] Pricing tiers: 1–9 jerseys = $60/unit, 10–25 = $50/unit, 26–50 = $45/unit, 51+ = $40/unit
- [x] Design fee toggle: adds $150 to the total when enabled ("I don't have my own design")
- [x] Output shows: per-unit price, subtotal (quantity × unit price), design fee (if toggled), and estimated total — all updating instantly on input change
- [x] Output is labeled "Estimated cost — final quote confirmed by Sidestep"
- [x] Edge cases handled correctly: quantity 0 shows $0, quantity exactly 10 uses $50 tier, quantity exactly 26 uses $45 tier, quantity exactly 51 uses $40 tier
- [x] A CTA below the calculator links to the intake form ("Get your official quote →")
- [x] Calculator is accessible (labeled inputs, output announced to screen readers)
- [x] All tests pass (15/15 in lib/pricing.test.ts)
- [x] No regressions in existing tests (no prior tests existed; vitest harness added)

## Dependencies
- Blocked by: 1-04
- Blocks: none

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 5 (In Scope — Pricing Calculator)

## Implementation Notes
- All pricing logic lives in a pure function `calculateEstimate(quantity: number, hasDesignFee: boolean): EstimateResult` in `lib/pricing.ts` — this is what the unit tests target
- The component is a Client Component (`"use client"`) since it needs interactivity
- Tier boundaries: 1-9 → $60, 10-25 → $50, 26-50 → $45, 51+ → $40 (note: PRD says 25-50, but grilling said $45 for 25-50 — use 10-25 and 26-50 as the boundaries; confirm with client if needed, flagged in PRD open questions)
- Keep the component in `components/marketing/PricingCalculator.tsx`

## TDD Approach
1. Write test: Unit test `calculateEstimate()` for quantities 1, 9, 10, 25, 26, 50, 51, 100 — both with and without design fee; assert correct per-unit price, subtotal, and total
2. Implement: Write `lib/pricing.ts` until all unit tests pass; build the React component on top of that function
3. Verify: In browser, type quantities at each tier boundary and confirm instant updates; toggle design fee on/off; test on mobile
