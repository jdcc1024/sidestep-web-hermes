# Issue: JerseyRunPublicForm → RHF + zod + shadcn Form

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: `components/run/JerseyRunPublicForm` converted to RHF + zod + shadcn `<Form>`
- [ ] Tests: Existing tests pass; validation rendering tested

## Description
Convert the public fan submission form (rendered at `/run/<id>`) to the canonical form stack. Public-facing and unauthenticated — preserve the closed-state and open-vs-fixed-mode branching exactly as today. After this lands, all five forms are on RHF + zod and the migration's form-consistency success metric is met.

## Acceptance Criteria
- [ ] `JerseyRunPublicForm` uses RHF + `zodResolver` + shadcn `<Form>`
- [ ] zod schema colocated; rules from `lib/jerseyRunResponse/` reused where present
- [ ] Open mode shows free-text name input; fixed mode shows roster `<Select>` — branching behavior preserved
- [ ] Blank-name and blank-number warnings preserved (rendered via `<FormMessage>` from zod refinements)
- [ ] Closed-state UI unchanged (still shows the "this run is closed" message when expired/closed)
- [ ] Existing tests pass; at least one new test covers validation rendering
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: S-10
- Blocks: S-12

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 5 (In Scope: Sweep — run) and Section 8 (Success Metrics: all 5 forms on RHF + zod)

## Implementation Notes
- Pattern matches S-06
- Custom-question answers: use `useFieldArray` mirroring S-06's setup form
- This is the last form to migrate — after this, success metric "all 5 forms on RHF + zod" is achievable; the layout sweep (S-13) audits the final state
- Closed state is rendered conditionally before the form mounts — keep that gating intact

## TDD Approach
1. Capture current submission + closed-state behavior in tests
2. Convert to RHF + zod
3. Manual: open a shared run link in incognito; submit in both open and fixed modes; visit an expired/closed run and confirm the closed banner still renders
