# Issue: Layout Sweep — Final shadcn pass and migration audit

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: `components/layout/*` (Logo, MarketingFooter, MarketingShell, MarketingNav, SidebarShell) finalized; full-repo audit
- [ ] Tests: Existing tests pass; success-metrics audit confirms zero hand-rolled primitives remain

## Description
Final pass: clean up `components/layout/*` so any remaining hand-rolled primitives are swept, and run the migration's exit audit against the PRD's success metrics. Confirms zero hand-rolled primitives anywhere in the codebase, all five forms on RHF + zod, theme toggle works on every surface, and the build is fully green.

## Acceptance Criteria
- [ ] `Logo`, `MarketingFooter`, `MarketingShell`, `MarketingNav`, `SidebarShell` use shadcn primitives where applicable (some files may be thin enough that no change is needed — note that explicitly in the commit message)
- [ ] Audit grep: no inline `<button className=` / `<input className=` / `<textarea className=` instances outside `components/ui/` and `app/dev/*`
- [ ] All 5 forms on RHF + zod: `IntakeForm`, `OrderForm`, `DesignForm`, `JerseyRunPublicForm`, `JerseyRunSetup`
- [ ] `<ThemeToggle>` confirmed visible and functional in `MarketingNav`, portal header, admin header
- [ ] `/dev/components` showcase still renders every primitive correctly in both themes
- [ ] Throwaway `/dev/smoke` route from S-01 removed (if not already)
- [ ] Manual smoke of every surface (marketing landing, intake, portal dashboard, order detail, jersey run setup, jersey run public, admin pages) in light and dark mode
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: S-12
- Blocks: none

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 5 (In Scope: Sweep — layout) and Section 8 (Success Metrics)

## Implementation Notes
- Some layout files may already be thin (e.g. `Logo` is likely just an `<svg>` or `<Image>`) — if there's nothing to swap, say so in the commit message
- The grep audit is the gating check — if any hand-rolled primitives survive, fix them here before marking done
- This issue closes the migration; the commit message should reference the PRD and call out the audit results

## TDD Approach
1. Refactor each layout file as needed
2. Run the audit: `rg "<button className" --glob '!components/ui/**' --glob '!app/dev/**'` (and similar for input/textarea)
3. Manual: visit `/`, `/portal`, `/admin`, `/dev/components` in both themes; confirm migration is complete and success metrics are met
