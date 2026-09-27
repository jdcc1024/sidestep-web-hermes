# Issue: /dev/components Showcase Page

## Phase: 3

## Type: infrastructure

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: Single page at `/dev/components` renders every installed shadcn primitive with examples
- [ ] Tests: Page builds and renders without runtime errors

## Description
Build a single-page catalog of every shadcn primitive installed in S-02, with usage examples (default plus one or two interesting variants). Serves as the AI agent's and human developer's reference: one URL, one file to read, all primitives visible at once. Unlinked from public navigation — reachable only by typing the URL.

## Acceptance Criteria
- [ ] `app/dev/components/page.tsx` exists and renders every primitive from `components/ui/` at least once
- [ ] Each section is labeled (e.g. "Buttons", "Inputs", "Dialog", "Form") and shows default plus 1–2 variants
- [ ] Includes at least one full `<Form>` example demonstrating the RHF + zod + shadcn pattern that S-06 will replicate (this is the seed pattern)
- [ ] Includes a `<Toaster />` from sonner and a button that triggers a toast
- [ ] Page is not linked from `MarketingNav`, `PortalShell`, or `AdminShell`
- [ ] Page renders correctly in both light and dark mode
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: S-02
- Blocks: S-05

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 2 (step 3) and Section 5 (In Scope: Showcase)

## Implementation Notes
- Keep the file flat — one `<Card>` per primitive section, hand-rolled list rather than dynamic discovery
- Open question per PRD: dev-only gating vs unlinked-live. Default to unlinked-live; flag to the human if there's appetite to add `process.env.NODE_ENV === 'development'` gating
- The `<Form>` example here becomes the canonical template — make it cleanly readable; later form issues will mirror its shape
- Render in both themes during manual QA; the showcase is also a dark-mode visual smoke test

## TDD Approach
1. Write a render smoke test: import the page, render with React Testing Library, assert section headings exist
2. Implement section-by-section, copying from shadcn docs
3. Verify in browser in both light and dark mode; confirm no console errors and every primitive paints correctly
