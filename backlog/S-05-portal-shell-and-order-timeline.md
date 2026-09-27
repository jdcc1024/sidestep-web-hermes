# Issue: Portal Pilot — PortalShell and OrderTimeline on shadcn

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: `PortalShell` and `OrderTimeline` rewritten to use shadcn primitives; theme toggle from S-03 placed in `PortalShell` header
- [ ] Tests: Existing tests around the portal continue to pass

## Description
First refactor surface of the sweep: replace inline UI in `components/portal/PortalShell` and `components/portal/OrderTimeline` with shadcn primitives. Mounts the `<ThemeToggle>` from S-03 in the portal header. Composite APIs (exported names, props) are preserved; only internal JSX changes. "Improve while you're in there" — small spacing, a11y, and UX wins are welcome.

## Acceptance Criteria
- [ ] `PortalShell` uses shadcn `<Button>`, `<Sheet>` (for mobile nav drawer), `<Separator>`, etc. — no hand-rolled instances of these primitives remain in the file
- [ ] `OrderTimeline` uses shadcn `<Card>`, `<Badge>`, `<Separator>` as appropriate; visual structure of the timeline preserved
- [ ] `<ThemeToggle>` from S-03 is rendered in the portal header, visible on desktop and inside the mobile drawer
- [ ] Exported APIs of both components are unchanged (call sites do not need updates)
- [ ] Both light and dark mode render correctly
- [ ] Manual smoke of `/portal` (dashboard, order detail) confirms no regression
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: S-03, S-04
- Blocks: S-06

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 2 (step 4) and Section 5 (In Scope: Portal pilot)

## Implementation Notes
- Read `/dev/components` first to pick the right primitives for each spot
- Mobile nav: use shadcn `<Sheet>` rather than the custom drawer pattern that 1-05 wrestled with — the `<Sheet>` primitive owns the focus-trap and overlay behavior for you
- Active route highlight in the sidebar: keep current logic; swap the styling primitive
- Leave the portal forms (`JerseyRunSetup`, `DesignForm`, `OrderForm`) untouched in this issue — those are S-06, S-07, S-08

## TDD Approach
1. Run existing portal tests to capture green baseline
2. Refactor `PortalShell` first; verify shell tests still pass and theme toggle appears in header
3. Refactor `OrderTimeline`; verify order detail renders identically
4. Manual QA: log in, navigate dashboard → order detail, switch theme, resize to mobile and open the drawer
