# Issue: Logged-In User Sees Their Jersey Run Responses

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `jerseyRunResponses` — query by `respondentEmail` matching the logged-in user, both for a specific run and across all runs
- [ ] API: Convex queries `listMyResponsesForRun` (responses by current user email for one `jerseyRunId`) and `listMyResponses` (responses across all runs, joined with `jerseyRuns`/`orders` for display context)
- [ ] Frontend: On `/run/[id]`, render a "Your responses to this run" panel above (or below) the form when the visitor is signed in and has prior responses for that run. On the customer portal dashboard, render a "Your jersey run responses" section listing all responses across runs
- [ ] Tests: Queries return only the current user's responses; both surfaces render empty states; both surfaces render correct content for seeded responses; non-authenticated visitors to `/run/[id]` see the form only (no panel)

## Description
A logged-in customer who participates in jersey runs has no way today to confirm what they submitted. After the "Submit and add another" feature (2-14) lets them submit several entries in one session, this gap becomes more painful — a parent who registered three kids wants to verify each entry stuck. This task surfaces a logged-in user's prior responses in two places:

1. **On the run page** (`/run/[id]`): when the visitor is signed in, show a panel listing the responses they've already submitted to *this* run (matched by their Clerk account email). Read-only, but useful as instant confirmation alongside "Submit and add another."
2. **On the customer portal dashboard**: a "Your jersey run responses" section listing all responses across all runs they've participated in, with the team / order / jersey details for context.

Anonymous visitors continue to see only the form on `/run/[id]` — no behavioural change for the unauthenticated path.

## Acceptance Criteria
- [ ] New Convex query `listMyResponsesForRun({ jerseyRunId })` returns responses where `respondentEmail === currentUser.email`, scoped to that run; returns `[]` for unauthenticated callers
- [ ] New Convex query `listMyResponses()` returns all of the current user's responses joined with the linked `jerseyRuns` and `orders` for display; returns `[]` for unauthenticated callers
- [ ] `/run/[id]` renders a "Your responses to this run" panel above/below the form when the visitor is signed in AND has ≥1 prior response for that run; otherwise the panel is hidden (form-only experience preserved for anonymous visitors and signed-in first-timers)
- [ ] Panel shows: submission date, jersey size, name on jersey, number on jersey, and (if present) the custom-question answers — read-only
- [ ] Customer portal dashboard gains a "Your jersey run responses" section showing every response by the logged-in user across all runs
- [ ] Each dashboard entry shows: team name (from linked order), run name/title if available, submission date, jersey size, name on jersey, number on jersey, and a link to `/run/[id]` so they can add another or review
- [ ] Empty state on the dashboard: "You haven't submitted any jersey run responses yet"
- [ ] Edits/cancellation are out of scope — read-only in this task
- [ ] Edge case noted in implementation: if a user submitted with a different email than their Clerk account, those entries won't appear (acceptable for now; future account-linking work can address)
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-09; ideally lands after 2-14 so "Submit and add another" and the per-run panel ship together
- Blocks: none
- Note: This supersedes/extends the dashboard portion of 3-04. When this lands, mark 3-04 as obsolete or fold it in — confirm with the human during planning which approach they prefer.

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — P1 Should Have, captain sees orders participated in)

## Implementation Notes
- Both queries gate on Clerk identity — use the same auth helper the rest of the portal queries use; return `[]` rather than throw when unauthenticated so `/run/[id]` can call the query unconditionally without branching
- For the per-run panel on `/run/[id]`, the page is currently rendered with no auth middleware. Calling an authenticated Convex query from this route is fine — the query just needs to handle the no-identity case gracefully
- The matching key is `respondentEmail === currentUser.email`. Be deliberate about email normalization (case, whitespace) — apply the same normalization in the query as the public form's submit path. If the public form doesn't normalize today, do that as part of this work and document it in a comment
- For the dashboard section, prefer to render below "Participated In" if 3-04 has already shipped a similar block, or fold the two together. Don't ship two near-duplicate sections side by side
- Keep both surfaces simple and read-only — no edit/cancel affordances yet. Phase 1 explicitly punts on those

## TDD Approach
1. Write test: Seed two responses with the current user's email for run A and one with a different email for run A; call `listMyResponsesForRun({ jerseyRunId: A })` as the current user → assert only the two are returned; call it unauthenticated → assert `[]`
2. Write test: Seed responses across two runs for the current user and one for a different user; call `listMyResponses()` as the current user → assert the user's responses across both runs are returned with joined run/order data; assert the other user's response is excluded
3. Write test: Render `/run/[id]` as a signed-in user with prior responses → assert the panel appears with the correct entries; render as the same user with no prior responses → assert the panel is hidden; render as an anonymous visitor → assert the panel is hidden
4. Write test: Render the dashboard section with seeded responses → assert each card shows team, jersey size, name on jersey, number on jersey, and links to `/run/[id]`; render with no responses → assert empty state copy
5. Implement: Add both Convex queries, the run-page panel component, and the dashboard section
6. Verify: Sign in as a test user, submit two responses to a run via `/run/[id]` (using the "Submit and add another" flow from 2-14), refresh — assert the panel shows both; navigate to `/portal` — assert the dashboard section lists them too
