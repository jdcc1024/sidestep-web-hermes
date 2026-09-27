# Issue: Marketing Sweep — shadcn primitives + theme toggle in nav

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: All `components/marketing/*` use shadcn primitives; theme toggle mounted in `MarketingNav`
- [ ] Tests: Existing tests (including pricing calculator unit tests) continue to pass

## Description
Refactor `HeroSection`, `CustomizeSection`, `ProcessSection`, `FaqSection`, `QuoteCtaSection`, `PricingCalculator`, and `PricingSection` to use shadcn primitives. Drop the theme toggle into `MarketingNav`. Composite APIs preserved; visual layout preserved; small UX/a11y improvements welcome ("improve while you're in there").

## Acceptance Criteria
- [ ] Every primitive (button, input, card, badge, separator, accordion, etc.) in `components/marketing/*` sourced from `components/ui/`
- [ ] `<ThemeToggle>` visible in `MarketingNav` on desktop and inside the mobile drawer
- [ ] Pricing calculator interaction (tier boundaries, design fee toggle) behaves identically; existing calculator unit tests pass without modification
- [ ] FAQ uses shadcn `<Accordion>` (or `<Collapsible>`) for expand/collapse
- [ ] Manual smoke of every landing section in light and dark mode at 375px, 768px, 1280px
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: S-07, S-08
- Blocks: S-10

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 5 (In Scope: Sweep, post-pilot)

## Implementation Notes
- The pricing calculator is the highest-risk file in this sweep (it has unit tests and business logic) — refactor presentation only; keep the calculator logic functions untouched
- If FAQ currently uses native `<details>`, swap to shadcn `<Accordion>` for keyboard a11y consistency
- Hero CTA: shadcn `<Button>` with an appropriate size/variant
- Marketing nav mobile drawer: use shadcn `<Sheet>` like the portal in S-05
- One refactor at a time, run tests between each — calculator boundary tests are your safety net

## TDD Approach
1. Run existing marketing tests to capture green baseline
2. Refactor one component per pass; rerun tests after each
3. Manual QA: scroll the landing page in both themes, try the calculator at boundary quantities (9, 10, 25, 26, 50, 51), open and close FAQ items, switch theme
