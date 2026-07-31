# Issue: Staggered Process and Pricing Card Entrances

## Status: pending

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: no change
- [ ] API: no change
- [ ] Frontend: `components/marketing/ProcessSection.tsx` (3 step cards), `components/marketing/PricingSection.tsx` (4 tier cards)
- [ ] Tests: existing `PricingSection.test.tsx` must stay green; step/tier content assertions
- [ ] Review: screenshots of both sections

## Description
Section-level reveal (N-02) brings each section in as one block. This slice adds the second layer: the three process step cards and the four pricing tier cards arrive in sequence rather than simultaneously, guiding the eye across them.

## Acceptance Criteria
- [ ] `ProcessSection`'s three step cards enter in sequence
- [ ] `PricingSection`'s four tier cards enter in sequence
- [ ] Stagger interval comes from `lib/motion.ts`; total time for the last card to land stays short enough not to feel slow
- [ ] The tier card stagger does not interfere with the `layoutId` spotlight from N-01 — the spotlight lands correctly on the default tier after the entrance settles
- [ ] Under reduced motion both sets render in place with no movement
- [ ] `components/marketing/PricingSection.test.tsx` still passes without modification
- [ ] Screenshots via `node scripts/snap.mjs N-04 /` show all cards settled
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: N-02
- Blocks: none

## PRD Reference
See: docs/prd/motion-adoption.md — Section 5 (MO-3), Section 10 (open question on ProcessSection)

## Implementation Notes
- **Resolve the PRD's open question here:** `ProcessSection` needs `"use client"` for per-card stagger, because children must be `motion` elements to receive variants from a parent. It is static content with no data fetching, so the cost is one small section leaving RSC. Recommended: convert it. This is a technical call — make it, note it in the session report, move on.
- `PricingSection` is already a client component (it owns the calculator quantity state), so no boundary change there.
- **Sequencing risk:** the spotlight and the tier-card entrance animate the same cards at the same time. Let the entrance finish before the spotlight measures, or verify the spotlight settles correctly regardless of ordering. This is the most likely source of a visual bug in this issue — check it explicitly rather than assuming.
- Use `variants` + `staggerChildren` on the grid container. Do not hand-roll `delay: index * 0.06`.
- Watch the `ProcessSection` connector spans (`idx < steps.length - 1 &&`) — they are absolutely positioned decorations and should not animate independently of their card.

## TDD Approach
1. **Write test:** assert all three step cards and all four tier cards are present and readable immediately after render, so a broken stagger can never leave a card permanently hidden.
2. **Implement:** convert `ProcessSection` to a client component with a variant parent; add matching variants to the pricing tier grid.
3. **Verify:** run the full pricing test file unmodified; scroll each section into view and watch the sequence; confirm the spotlight lands on the popular tier once the entrance settles; reduced-motion run static; screenshots settled.
