# Issue: DesignForm → RHF + zod + shadcn Form

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: `components/portal/DesignForm` converted to RHF + zod + shadcn `<Form>`
- [ ] Tests: Existing tests pass; validation rendering tested

## Description
Apply the form pattern established in S-06 to `DesignForm` (design creation: title, brief, optional Canva link, multi-file upload). The file-upload field stays imperative — RHF owns only the metadata side; the existing Convex storage upload flow is preserved as-is.

## Acceptance Criteria
- [ ] `DesignForm` uses RHF + `zodResolver` and shadcn `<Form>` wrapper
- [ ] zod schema colocated with the component
- [ ] Form fields wrapped in shadcn `<FormField>` / `<FormItem>` / `<FormLabel>` / `<FormControl>` / `<FormMessage>`
- [ ] File upload UX preserved (drag-and-drop or file picker as it works today)
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
- Pattern matches S-06 — read that issue's implementation first and mirror it
- File uploads: keep the existing storage-upload + storageId-collection logic; RHF only owns the metadata fields (title, brief, Canva link)
- Reuse `lib/design/` validation constants in the zod schema where they exist

## TDD Approach
1. Capture current happy + sad path in tests
2. Wire RHF + zod, mirroring S-06's structure
3. Verify file upload still works end-to-end against Convex storage in the browser
