# Issue: Install shadcn Primitives and Dependencies

## Phase: 3

## Type: infrastructure

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: `components/ui/` populated with the full shadcn primitive set; runtime deps installed
- [ ] Tests: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass

## Description
Run `npx shadcn add` for the entire primitive set in one commit, and install the runtime dependencies the migration depends on: `lucide-react`, `next-themes`, `sonner`, `react-hook-form`, `zod`, `@hookform/resolvers`. No application code references these yet — this is a "populate the menu" commit so the AI sees the full primitive vocabulary before refactoring begins. Subsequent issues import from `components/ui/` as needed.

## Acceptance Criteria
- [ ] `components/ui/` contains at minimum: button, input, label, card, dialog, select, textarea, badge, separator, dropdown-menu, tabs, tooltip, skeleton, sheet, popover, alert, form, sonner, checkbox, radio-group, accordion
- [ ] Runtime deps added to `package.json`: `lucide-react`, `next-themes`, `sonner`, `react-hook-form`, `zod`, `@hookform/resolvers`
- [ ] `components.json` exists at the project root with shadcn config
- [ ] No imports of new primitives anywhere in `app/` or `components/{marketing,portal,intake,run,admin,layout}/` yet (composites untouched in this commit)
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: S-01
- Blocks: S-03, S-04

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 2 (step 2) and Section 5 (In Scope: Setup & infrastructure)

## Implementation Notes
- Single commit, conventional message: `chore: install shadcn primitives and form/theme/icon deps`
- Use shadcn's batch-add syntax if available; otherwise list every primitive explicitly
- Verify the `/dev/smoke` route from S-01 is still building; it can stay or be removed in this commit — either is fine
- Do not yet wire `<ThemeProvider>` or theme CSS variables — that is S-03
- Do not yet touch the showcase page — that is S-04

## TDD Approach
1. Verify build baseline green
2. Run `npx shadcn add <each primitive>` and `npm install` for runtime deps
3. Confirm full build gate passes with zero application code changes
