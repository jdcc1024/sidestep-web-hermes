# Issue: IntakeForm → RHF + zod + shadcn Form

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: `components/intake/IntakeForm` converted to RHF + zod + shadcn `<Form>`
- [ ] Tests: Existing tests pass; validation rendering tested

## Description
Apply the canonical form pattern to the public intake form. Same Convex mutation, same payload shape; only the form mechanics change. Public-facing (no auth required) — extra care on a11y and error visibility for unauthenticated visitors.

## Acceptance Criteria
- [ ] `IntakeForm` uses RHF + `zodResolver` + shadcn `<Form>`
- [ ] zod schema colocated with the component
- [ ] Form fields wrapped in shadcn `<FormField>` / `<FormItem>` / `<FormLabel>` / `<FormControl>` / `<FormMessage>`
- [ ] Existing Convex `intakes.create` mutation receives the same payload shape
- [ ] Success state (post-submit confirmation) preserved, or improved using `sonner` toast if a toast fits the UX
- [ ] Existing tests pass; at least one new test covers validation rendering
- [ ] Mobile responsive at 375px
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: S-09
- Blocks: S-11

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 5 (In Scope: Sweep — intake)

## Implementation Notes
- Pattern matches S-06
- Reuse `lib/intake/` validation constants in the zod schema where they exist
- Sport selector: shadcn `<Select>`
- Quantity: numeric input with appropriate min validation in zod
- Public form — confirm `<FormMessage>` errors are visible and not hidden behind low contrast in dark mode

## TDD Approach
1. Capture existing happy + sad submission behavior in tests
2. Convert to RHF + zod
3. Manual: open the marketing intake CTA in incognito, submit valid + invalid; confirm the intake appears in admin
