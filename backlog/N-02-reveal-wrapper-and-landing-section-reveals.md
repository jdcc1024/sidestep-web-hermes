# Issue: Reveal Wrapper and Landing Section Reveals

## Status: done

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: no change
- [ ] API: no change
- [ ] Frontend: `components/motion/Reveal.tsx` (new), `app/page.tsx` (wraps six sections)
- [ ] Tests: `Reveal.test.tsx` (renders children, no content hidden), extend reduced-motion script
- [ ] Review: screenshots of the full landing page

## Description
Introduce a single reusable `<Reveal>` client component that fades and rises its children as they scroll into view, then wrap the six landing sections in it. The wrapper takes `children` as a prop specifically so `HeroSection`, `ProcessSection`, `CustomizeSection`, `PricingSection`, `FaqSection`, and `QuoteCtaSection` stay server components.

## Acceptance Criteria
- [ ] `components/motion/Reveal.tsx` exists, is `"use client"`, and accepts `children` plus an optional delay/offset override
- [ ] All six sections in `app/page.tsx` are wrapped; none of the six section components gains `"use client"` as a result
- [ ] Reveal uses `viewport={{ once: true }}` — scrolling back up does not replay
- [ ] Reveal parameters come from `lib/motion.ts`, not inline literals
- [ ] **Content is never permanently invisible:** with animations suppressed (reduced motion) or JS unavailable, every section is fully visible and readable
- [ ] `scripts/check-reduced-motion.mjs` extended to cover a revealed section
- [ ] `node scripts/snap.mjs N-02 /` produces screenshots showing fully-revealed content — a still that catches mid-reveal opacity is a config bug, not a screenshot artifact
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: N-01
- Blocks: N-04

## PRD Reference
See: docs/prd/motion-adoption.md — Section 5 (MO-2), Section 6 (Server components, Reveal replay), Section 7

## Implementation Notes
- The children-as-props pattern is the entire architectural point: a client component may render server-rendered children passed through `props.children`. Wrapping in `app/page.tsx` preserves RSC for the sections; putting `"use client"` in the sections themselves does not. Do not take the shortcut.
- `whileInView` + `initial` is the mechanism. Guard against the "invisible content" failure mode — if the viewport callback never fires (short pages, unusual scroll containers), content must still end up visible. Prefer an `initial` that is only *slightly* offset and rely on `once: true`.
- Screenshot capture happens after page load; if `snap.mjs` catches sections mid-reveal, the reveal is either too slow or triggering too late. Fix the config, do not add waits to the snap script.
- Hero is above the fold and gets a load-triggered entrance instead — that is N-03, not this issue. Wrapping Hero in `<Reveal>` here is fine as a placeholder only if N-03 replaces it.
- This issue produces the first real screenshots of the site's animation feel. The human uses them to tune `lib/motion.ts`; expect a follow-up adjustment and do not treat the first values as final.

## TDD Approach
1. **Write test:** `Reveal.test.tsx` — renders its children into the document; children remain in the accessibility tree. In jsdom there is no layout or IntersectionObserver, so the test proves the no-JS/no-layout path leaves content present, which is exactly the failure mode that matters.
2. **Implement:** build `Reveal`, wire tokens, wrap the six sections in `app/page.tsx`.
3. **Verify:** landing page scrolled top-to-bottom shows each section arriving; scrolling back up does not replay; reduced-motion run shows content present and static; screenshots show settled content.
