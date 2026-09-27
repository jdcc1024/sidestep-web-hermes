# Issue: JerseyRunSetup → RHF + zod + shadcn Form (Pilot Form)

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: None (no Convex schema or mutation changes — same payload shape)
- [ ] API: None
- [ ] Frontend: `components/portal/JerseyRunSetup` converted to `react-hook-form` + `zod` + shadcn `<Form>`; zod schema colocated
- [ ] Tests: Existing tests pass; new tests cover validation rendering

## Description
First form conversion in the migration. Rewrites `JerseyRunSetup` to use `react-hook-form` for state, `zod` for validation, and shadcn's `<Form>` wrapper for field UI. Proves the integration pattern between RHF and the existing Convex `jerseyRuns.create` mutation. Establishes the template every other form (S-07, S-08, S-10, S-11) will follow — invest in cleanness here.

## Acceptance Criteria
- [ ] `JerseyRunSetup` uses `useForm({ resolver: zodResolver(schema) })` from `react-hook-form` + `@hookform/resolvers/zod`
- [ ] zod schema lives alongside the component (e.g. `components/portal/jersey-run-setup.schema.ts` or colocated at the top of the file)
- [ ] Form fields wrapped in shadcn `<FormField>` / `<FormItem>` / `<FormLabel>` / `<FormControl>` / `<FormMessage>`
- [ ] Custom questions array uses RHF `useFieldArray`
- [ ] Names mode (open vs fixed) uses shadcn `<RadioGroup>`
- [ ] Sizes selection uses shadcn `<Checkbox>` bound via RHF
- [ ] On valid submit, the existing Convex mutation receives the same payload shape as before (verify by comparing pre/post payload in dev)
- [ ] Validation errors surface via `<FormMessage>` (no separate error banner needed)
- [ ] Success UX preserved/improved using `sonner` toast
- [ ] All existing `JerseyRunSetup` tests still pass; add at least one test for validation error rendering
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: S-05
- Blocks: S-07, S-08

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 5 (In Scope: Portal pilot, first form) and Section 4 (User Stories: AI Agent — single consistent form pattern)

## Implementation Notes
- Audit the existing payload shape sent to Convex `jerseyRuns.create`; the zod schema's output type must be assignable to that payload — do not change the mutation
- Validation rules already live in `lib/jerseyRun/` — reuse those constants in the zod schema (e.g. `MAX_CUSTOM_QUESTIONS`, `ROSTER_NAME_MAX_LENGTH`) rather than duplicating them
- This is the pilot — the structure here becomes the template, so favor readability over cleverness
- After this lands, the human may want to review the pattern before S-07/S-08 fan out (open question in PRD)

## TDD Approach
1. Capture current behavior in a smoke test (submit happy path, submit with missing required field)
2. Add zod schema; wire `useForm` and submit handler that calls the existing mutation
3. Convert each input cluster to `<FormField>` one at a time, running tests after each
4. Verify in browser: open captain order detail → create run → submit valid + invalid attempts
