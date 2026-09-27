# Issue: OrderForm → RHF + zod + shadcn Form

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: `components/portal/OrderForm` converted to RHF + zod + shadcn `<Form>`
- [ ] Tests: Existing tests pass; validation rendering tested

## Description
Apply the S-06 form pattern to `OrderForm` (order creation: team name, sport, quantity, jersey specs, design linking). Closes out the portal surface migration — after this, all three portal forms use the canonical form stack and the portal pilot is complete.

## Acceptance Criteria
- [ ] `OrderForm` uses RHF + `zodResolver` and shadcn `<Form>` wrapper
- [ ] zod schema colocated with the component
- [ ] Form fields wrapped in shadcn `<FormField>` / `<FormItem>` / `<FormLabel>` / `<FormControl>` / `<FormMessage>`
- [ ] Design multi-select uses an appropriate shadcn primitive (e.g. checkbox list inside a `<Card>`, or `<Select>` with multi-support pattern)
- [ ] Existing Convex mutation receives the same payload shape
- [ ] Existing tests pass; at least one new test covers validation rendering
- [ ] Success UX preserved/improved using `sonner` toast
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: S-06
- Blocks: S-09

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 5 (In Scope: Remaining portal forms)

## Implementation Notes
- Pattern matches S-06
- Reuse `lib/order/` validation constants in the zod schema where they exist
- This is the natural checkpoint where the human may want to review portal end-to-end before sweep continues (per PRD Open Question about post-pilot review)

## TDD Approach
1. Capture current behavior in tests
2. Convert to RHF + zod
3. Manual smoke: create a full order with linked designs end-to-end
