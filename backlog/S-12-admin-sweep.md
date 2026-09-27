# Issue: Admin Sweep — shadcn primitives + theme toggle in admin header

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: `components/admin/*` and `app/admin/*` pages refactored to shadcn; `<ThemeToggle>` mounted in `AdminShell` header
- [ ] Tests: Existing admin tests pass

## Description
Refactor every admin surface — `AdminShell`, admin order list, admin order detail (including the 14-stage checklist when 2-12 lands), admin customers, admin leads, admin jersey runs — to use shadcn primitives. Drops the theme toggle into the `AdminShell` header. Admin-only routes have heavier UI (tables, dropdowns, checklists) so this is the largest sweep issue.

## Acceptance Criteria
- [ ] `AdminShell` uses shadcn `<Sheet>` (mobile drawer), `<Button>`, `<Separator>`, etc.
- [ ] Admin tables use a consistent shadcn pattern (table primitives if added, or `<Card>` + list with shadcn `<Badge>` chips)
- [ ] Stage checklist (if 2-12 has landed) uses shadcn `<Checkbox>` with proper a11y labels
- [ ] Admin order detail dropdown menus use shadcn `<DropdownMenu>`
- [ ] `<ThemeToggle>` visible in admin header on desktop and inside the mobile drawer
- [ ] Manual smoke of every admin page in light and dark mode
- [ ] Existing admin tests pass
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: S-11
- Blocks: S-13

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 5 (In Scope: Sweep — admin) and Section 10 (Open Question: admin checklist hover/keyboard behavior under shadcn primitives)

## Implementation Notes
- Open question per PRD: confirm shadcn `<DropdownMenu>` and `<Tabs>` cover any custom hover/keyboard behavior the admin checklist relies on — verify case-by-case during refactor
- The admin order overview table (from 2-11) is the largest single piece; consider migrating its columns one at a time
- If 2-12 (Admin Stage Management) lands before this sweep starts, refactor the new checklist UI as part of this sweep; otherwise the checklist surface is unimplemented and nothing to sweep there
- 3-02 / 3-03 admin oversight surfaces are already shipped — include them in the sweep

## TDD Approach
1. Run existing admin tests to capture baseline
2. Refactor shell first, then list pages, then detail pages
3. Manual QA: log in as admin, navigate every admin route, switch theme, advance an order stage if 2-12 is live
