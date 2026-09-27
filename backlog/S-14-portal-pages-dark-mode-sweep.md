# Issue: Portal Page Dark-Mode Sweep

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: `app/portal/page.tsx`, `app/portal/orders/[id]/page.tsx`, `app/portal/orders/new/page.tsx`, `app/portal/designs/new/page.tsx`, `app/portal/designs/[id]/page.tsx`, `app/portal/orders/[id]/run/responses/page.tsx` — swap hardcoded zinc/teal classes for shadcn theme tokens so dark mode renders correctly
- [ ] Tests: Existing tests continue to pass

## Description
S-05 refactored `PortalShell` and `OrderTimeline` to shadcn primitives, but the inner portal page containers (`app/portal/**/page.tsx`) still use hardcoded `bg-white`, `bg-zinc-50`, `text-zinc-900`, `border-zinc-200`, etc. With `ThemeToggle` now mounted in the portal header, a user who flips to dark mode sees an inconsistent surface: shell theming partially adapts (Sheet/Button primitives respond) while page bodies stay locked in light mode.

This issue does the dark-mode polish pass on the portal page bodies — swapping fixed zinc/white classes for shadcn semantic tokens (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`) and keeping the brand teal accents where appropriate.

## Acceptance Criteria
- [ ] Every `app/portal/**/page.tsx` page renders correctly in both light and dark mode
- [ ] Hardcoded `bg-white`, `bg-zinc-50`, `text-zinc-900`, `text-zinc-600`, `text-zinc-500`, `border-zinc-200`, etc. replaced with shadcn tokens (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, etc.) where appropriate
- [ ] Brand teal accents (`text-teal-700`, `bg-teal-600`) preserved — they read in both themes
- [ ] `StageChip`, loading skeletons, "Not found" states, etc. all theme-aware
- [ ] No regressions to layout, spacing, or exported component APIs
- [ ] Manual smoke of every portal route in light and dark mode at 375px / 768px / 1280px
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass

## Dependencies
- Blocked by: S-08 (so all portal forms have landed before the dark-mode pass)
- Blocks: S-13 (so S-13's exit audit sees a fully themed portal)

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 4 (developer user story: light and dark mode supported), Section 8 (Success Metrics: theme toggle works on every surface)

## Implementation Notes
- The portal shell (S-05) deliberately stayed light-only because flipping the shell to theme tokens while inner pages stayed light would create a jarring shell/content disconnect. This issue closes that loop.
- Watch the loading skeleton classes (`animate-pulse rounded bg-zinc-100`) — those need `bg-muted` or similar
- `StageChip` color palette uses hardcoded `bg-amber-100` etc. — consider whether to keep those or move them to semantic tokens
- Once this lands, revisit `PortalShell.tsx` and `Sheet` content — they can drop the explicit `bg-white text-zinc-900` overrides and use defaults

## TDD Approach
1. Run existing portal tests to capture green baseline
2. Page-by-page: swap zinc/white → tokens, verify in both themes
3. Final pass: toggle theme on every route, check loading states, empty states, error states
