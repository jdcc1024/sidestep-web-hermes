# Issue: Hero Entrance on Load

## Status: pending

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: no change
- [ ] API: no change
- [ ] Frontend: `components/marketing/HeroSection.tsx`
- [ ] Tests: hero content assertions; extend reduced-motion script
- [ ] Review: above-the-fold screenshots

## Description
The hero is above the fold, so a scroll-into-view trigger never fires for it — it needs a load-triggered entrance instead. Give the heading, subcopy, and CTA a short staggered settle on mount so the first impression of the site is of a considered product.

## Acceptance Criteria
- [ ] Hero elements animate on mount, not on scroll
- [ ] The entrance completes quickly enough that a visitor never waits to read the headline (target: fully settled well under 1s from paint)
- [ ] Transition values come from `lib/motion.ts`
- [ ] Under reduced motion the hero renders immediately in its final state with no movement
- [ ] No layout shift — the entrance animates opacity/transform only, never properties that reflow
- [ ] `node scripts/snap.mjs N-03 /` shows the hero fully settled
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: N-01
- Blocks: none

## PRD Reference
See: docs/prd/motion-adoption.md — Section 5 (MO-4), Section 4 (Visitor stories)

## Implementation Notes
- `HeroSection.tsx` is currently a 47-line server component. It must become `"use client"` for per-element stagger — that is acceptable here and is the narrowest possible client boundary (one section, static content, no data). Note the conversion in the session report.
- Cheapest correct approach: a parent `motion.div` with `variants` + `staggerChildren`, children as `motion` elements. Do not hand-roll per-element delays.
- CLS risk is the thing to watch: animate `opacity` and `y` only. Never animate height, margin, or anything that changes layout — the hero is the largest contentful paint on the site.
- If `snap.mjs` catches the hero mid-entrance, shorten the duration rather than adding waits to the snap script.

## TDD Approach
1. **Write test:** assert the hero's heading and CTA are present and reachable by role immediately after render (jsdom, animations inert) — this locks in that the entrance never gates content on JS.
2. **Implement:** convert `HeroSection` to a client component, add the variant parent and children, pull timings from `lib/motion.ts`.
3. **Verify:** hard-reload the landing page and watch the settle; reduced-motion run shows no movement; screenshots show the settled state; LCP is not visibly delayed.
