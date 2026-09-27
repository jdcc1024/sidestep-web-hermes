# Issue: Jersey Run "Submit and Add Another"

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: None new — reuses existing `jerseyRunResponses` mutation
- [ ] API: None new — reuses `api.jerseyRuns.submitResponse`
- [ ] Frontend: `components/run/JerseyRunPublicForm.tsx` — second submit action that fires the mutation, then resets the form for another entry instead of swapping to the confirmation state
- [ ] Tests: Submitting via the secondary action persists the response, then re-renders an empty form; the blank-name/number warning still gates the secondary path; rapid double-clicks don't double-submit

## Description
On the public jersey run form (`/run/[id]`), a single user often fills out responses for several people in one sitting — a parent registering two kids, a captain entering for a teammate without email, or a team rep capturing the squad on one device. Today they have to finish, see the success screen, and re-open the link to add another entry. Add a secondary "Submit and add another" action so a single session can capture many responses in a row.

## Acceptance Criteria
- [ ] A secondary action "Submit and add another" appears next to the primary "Submit" button on the public form
- [ ] Clicking it calls the same `submitResponse` mutation as the primary submit, with the same validation (including the blank name/number warning dialog)
- [ ] On success, instead of showing the "You're in!" confirmation, the form resets to an empty state ready for the next entry
- [ ] A small, dismissible inline confirmation appears (e.g. toast or callout) showing what was just submitted, so the user knows the previous entry persisted before they start the next one
- [ ] The primary "Submit" button retains existing behaviour (single submission → confirmation screen)
- [ ] Both actions are disabled while a submission is in flight to prevent double-submit
- [ ] Closed/expired runs still hide both actions
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-09
- Blocks: none

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Jersey Run)

## Implementation Notes
- The form state already lives in `react-hook-form` — reset via `form.reset(defaultValues)` after a successful submission on this path
- Reuse the existing blank-name/number warning dialog — both actions should route through the same confirm step
- Preserve any fields that are likely shared across siblings (e.g. respondent's real name, email) by resetting only the per-jersey fields (jersey size, name on jersey, number on jersey, custom answers). Confirm this with the human during implementation — there's a UX call to make about whether email also resets
- For the inline confirmation, prefer a small toast/callout near the form header rather than a full-page swap so the form remains the primary surface
- Be careful that `submitting` state guards both buttons — the cheapest way to ship a duplicate-response bug is to only guard one

## TDD Approach
1. Write test: Render the form, fill it in, click "Submit and add another" → assert `submitResponse` called once with correct data, then the form is back to an empty state and the primary submit is re-enabled
2. Write test: Click "Submit and add another" with a blank name → assert the warning dialog appears before the mutation fires; confirming proceeds and resets the form
3. Write test: Double-click "Submit and add another" rapidly → assert only one mutation fires
4. Implement: Add the secondary action, wire it through the existing confirm/submit path with a `resetAfterSubmit` flag, swap the success branch to reset-vs-confirmation accordingly
5. Verify: Open `/run/[id]` in an incognito window, submit three responses in a row via "Submit and add another", then submit a final one via "Submit" — confirm all four land in the captain's dashboard and the last shows the confirmation screen
