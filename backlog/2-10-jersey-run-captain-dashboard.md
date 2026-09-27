# Issue: Jersey Run Captain Dashboard

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `jerseyRunResponses` — read all responses for a jersey run; real-time subscription
- [ ] API: Convex query `listJerseyRunResponses` (captain-only, returns all responses for a given run)
- [ ] Frontend: Captain's live view of jersey run responses within the portal; response table; participation count; deadline countdown
- [ ] Tests: Responses list renders correctly; real-time update when new response arrives; empty state shown when no responses yet

## Description
Build the captain's view of their jersey run — a live dashboard showing who has submitted, their jersey selections, and answers to custom questions. The captain can see the current participation count, a deadline countdown, and a response table. This view is inside the authenticated portal, visible only to the order's captain. Real-time updates via Convex mean the captain sees new submissions instantly without refreshing.

## Acceptance Criteria
- [ ] Accessible from the order detail page via a "View responses" link on the jersey run section
- [ ] Route is authenticated and only the order's captain (or an admin) can view it
- [ ] Response table columns: respondent name, email, jersey size, name on jersey, number on jersey, answers to each custom question, submission timestamp
- [ ] Participation summary: "X responses so far" prominently displayed at the top
- [ ] Deadline countdown: "Closes in 3 days" (or "Closed on [date]" if past deadline)
- [ ] Empty state: "No responses yet — share your link to get started"
- [ ] Data updates in real-time via Convex subscription — new submissions appear without page refresh
- [ ] Pricing estimate shown: current response count × per-unit price (from `lib/pricing.ts`) + design fee if applicable — labeled as "estimated total at current size"
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-09
- Blocks: 3-01, 3-02

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Jersey Run, captain views responses)

## Implementation Notes
- Route: `app/(portal)/orders/[id]/run/responses/page.tsx`
- Convex query `listJerseyRunResponses(jerseyRunId)` — filter by `jerseyRunId`; this query should only succeed if the caller is the order's captain or an admin (check `captainId` in the `jerseyRun` record against the current user)
- Deadline countdown: compute `Math.ceil((deadline - Date.now()) / (1000 * 60 * 60 * 24))` days remaining
- The pricing estimate reuses `calculateEstimate()` from `lib/pricing.ts` (built in 2-02)
- Response table should be sortable by submission time (newest first by default)

## TDD Approach
1. Write test: Mock `listJerseyRunResponses` returning 3 responses → assert table renders 3 rows with correct data; mock returning empty array → assert empty state renders; assert a non-captain user cannot access this route (403)
2. Implement: Build the responses page, Convex query with auth check, response table, deadline countdown
3. Verify: Submit several responses via the public form; confirm they appear in the captain's dashboard in real-time
