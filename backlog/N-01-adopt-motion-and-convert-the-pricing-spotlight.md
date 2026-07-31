# Issue: Adopt Motion and Convert the Pricing Spotlight

## Status: pending

## Phase: 3

## Type: infrastructure

## Vertical Slice
This issue touches:
- [ ] Database: no change
- [ ] API: no change
- [ ] Frontend: `app/providers.tsx` (MotionConfig), `lib/motion.ts` (new tokens), `components/marketing/PricingSection.tsx` (spotlight rewrite)
- [ ] Infrastructure: `motion` dependency, `scripts/check-reduced-motion.mjs` (new), CLAUDE.md rules section
- [ ] Tests: existing `PricingSection.test.tsx` must pass unmodified; new reduced-motion assertion script

## Description
The tracer bullet for the whole PRD: install Motion, configure it globally, and prove it end-to-end by replacing the hand-rolled FLIP in the pricing tier spotlight with `layoutId`. This slice is deliberately the largest because it is the only one that must establish the pattern — every later issue reuses what it lands. It should *delete* more component code than it adds.

## Acceptance Criteria
- [ ] `motion` (v12.x) installed; `npm run build` and `node scripts/verify.mjs` pass
- [ ] `<MotionConfig reducedMotion="user">` wraps the app in `app/providers.tsx`
- [ ] `lib/motion.ts` exports named transition tokens (at minimum a spring for the spotlight and a duration/offset pair for later reveals); no bezier or spring literals remain inline in components
- [ ] `PricingSection.tsx` contains no `ResizeObserver`, no `offsetLeft`/`offsetTop` measurement, no rect equality guard, and no first-paint ring fallback
- [ ] The spotlight still lands on the correct card at every tier boundary (9/10, 24/25, 49/50) and at all three breakpoints, including the 768px two-row wrap
- [ ] `components/marketing/PricingSection.test.tsx` passes **without modification** — `data-active`, `aria-current`, headings, caption text, and estimate sync all still assert true
- [ ] `scripts/check-reduced-motion.mjs` exists, drives the spotlight in both `reducedMotion: "reduce"` and `"no-preference"` contexts, and asserts movement in one and none in the other
- [ ] CLAUDE.md gains a short "Animation: CSS vs Motion" section stating the boundary
- [ ] Screenshots captured via `node scripts/snap.mjs N-01 /`
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: none
- Blocks: N-02, N-03, N-05, N-06

## PRD Reference
See: docs/prd/motion-adoption.md — Sections 2 (steps 1–2), 5 (Setup & infrastructure, MO-1), 6, 8

## Implementation Notes
- `app/providers.tsx` is already `"use client"` — `MotionConfig` goes there, inside `ThemeProvider`. No new client boundary is created.
- The spotlight frame must live in a `relative` wrapper div **outside** `<Card>`: `Card` sets `overflow-hidden` (`components/ui/card.tsx`), which would clip a ring drawn on an inset child. Confirm visually, not just by reading.
- Shape: render `<motion.div layoutId="tier-spotlight" />` only inside the spotlit card's wrapper; Motion FLIPs it between cards automatically. Responsive reflow and the 768px row wrap come free — that is the whole point of the change.
- **Keep `data-active` and `aria-current` on the Card.** They are the test surface and the a11y signal; the spotlight is decorative (`aria-hidden`).
- Motion's border-radius/shadow scale correction only applies to values set via `style`, not className. All four cards are equal-sized so distortion is nil here — do not generalize this to differently-sized elements without re-checking.
- The React Compiler is enabled and rejects some manual memoization — it already rejected a `useCallback` in this exact component. Do not reintroduce one.
- jsdom has no layout, so Motion animations are inert in vitest. That is why the existing tests survive unchanged; keep asserting behavior, never animation state.
- Working reference for the Playwright reduced-motion check: sample `getBoundingClientRect().x` of the frame over ~6 ticks after changing the quantity. Under `reduce` every sample equals the final position.

## TDD Approach
1. **Write test:** none to write first — `PricingSection.test.tsx` (11 tests) is already the failing-if-broken gate. Run it before touching anything to confirm green, then treat any change to that file as a red flag rather than a fix.
2. **Implement:** install → `MotionConfig` → `lib/motion.ts` → swap the measurement block for `layoutId` → delete the dead state, effect, and fallback → write `scripts/check-reduced-motion.mjs`.
3. **Verify:** the 11 tests pass unmodified; the reduced-motion script asserts both directions; screenshots at 375/768/1280 light and dark show the frame aligned to the correct card; `node scripts/verify.mjs` green.
