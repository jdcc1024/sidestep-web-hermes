# Issue: Public Intake Form

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `intakes` table — write via Convex mutation on form submission
- [ ] API: Convex mutation `submitIntake`; admin query `listIntakes` (used in 2-13)
- [ ] Frontend: Intake form section on the marketing site; success confirmation state
- [ ] Tests: Form validation; submission creates record; success state renders; required fields enforced

## Description
Build the public lead-capture intake form at the bottom of the marketing site. A visitor fills in their name, team name, sport type, estimated jersey quantity, and a brief description of their idea. On submission, the data is saved to the Convex `intakes` table and the visitor sees a confirmation message. No account required. The intake ID is later used to generate an invite link for the customer portal.

## Acceptance Criteria
- [ ] Form fields: name (required), team name (required), sport type (text, required), estimated quantity (number, required, min 1), brief/idea (textarea, required, max 1000 chars)
- [ ] All required fields validated client-side before submission; clear error messages on invalid submit
- [ ] On successful submission, the form is replaced with a confirmation message: "Thanks! We'll be in touch soon."
- [ ] Submission calls the `submitIntake` Convex mutation and creates a record in the `intakes` table
- [ ] The `intakes` record includes `submittedAt` timestamp
- [ ] Form is not accessible to logged-in users who already have an account (or at least doesn't break for them)
- [ ] Mobile responsive — form is usable on a 375px screen
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 1-04
- Blocks: 2-13 (admin lead view reads `intakes` table)

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Anonymous Visitor), Section 5 (In Scope — Public intake form)

## Implementation Notes
- The `submitIntake` mutation should return the new intake's `_id` — this ID becomes the invite token for 1-03's invite-link flow
- Form lives at the `#quote` anchor on the marketing home page
- Use React Hook Form or plain controlled components — keep it simple
- Convex mutation lives in `convex/intakes.ts`
- Do not send any email on intake submission in Phase 1 — the admin will see it in the admin leads view (2-13)

## TDD Approach
1. Write test: Submit the form with valid data → assert Convex mutation was called with correct fields; submit with missing required field → assert error message renders
2. Implement: Build the form component, wire to `submitIntake` mutation, show confirmation state on success
3. Verify: Submit in browser → check Convex dashboard to confirm record was created with all fields; test mobile layout
