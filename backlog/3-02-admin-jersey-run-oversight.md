# Issue: Admin Jersey Run Oversight

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `jerseyRuns` and `jerseyRunResponses` — read all records (admin-only query)
- [ ] API: Convex queries `adminListJerseyRuns`, `adminListJerseyRunResponses`; mutation `adminCloseJerseyRun`
- [ ] Frontend: Admin page listing all jersey runs; response detail view per run; manual close button
- [ ] Tests: Admin sees all jersey runs across all orders; can view all responses; can manually close a run; non-admin cannot access

## Description
Build the admin jersey run oversight page. Sidestep staff can see all jersey runs across all orders, view the full response list for any run (including custom question answers), and manually close a run at any time (triggering the same closure logic as the automated deadline enforcement from 3-01). This gives Sidestep full visibility into team orders and the ability to act when needed.

## Acceptance Criteria
- [ ] `/admin/jersey-runs` page: table of all jersey runs — columns: team name (from linked order), captain name, response count, deadline, status (open/closed)
- [ ] Clicking a run opens a detail view with the full response table: respondent name, email, size, name, number, custom answers, submission time
- [ ] "Close run" button on the run detail: sets status to "closed" and sends the same closure emails as 3-01 (reuses the same Convex action)
- [ ] Closed runs show a "Closed" badge and the close button is disabled/hidden
- [ ] Admin can see all jersey runs regardless of which customer owns the order
- [ ] Non-admin users cannot access these pages (403)
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 3-01
- Blocks: 3-03

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Admin, view all jersey run responses, edit records)

## Implementation Notes
- Routes: `app/(admin)/jersey-runs/page.tsx`, `app/(admin)/jersey-runs/[id]/page.tsx`
- Reuse `closeExpiredRuns` logic from 3-01 for the manual close — or extract a shared `closeJerseyRun(jerseyRunId)` action that both the cron and the admin button call
- The response table is identical to the captain's view (2-10) but accessible to admins for any run
- Add a link from the admin order detail page (2-11) to the jersey run detail if one exists

## TDD Approach
1. Write test: Mock `adminListJerseyRuns` returning 2 runs from different orders → assert both appear in the table; click "Close run" → assert `adminCloseJerseyRun` called and status becomes "closed"
2. Implement: Build the jersey runs list page, run detail page, and wire the close action
3. Verify: Create jersey runs under different customer accounts; confirm admin sees all of them; manually close one; confirm the public form shows the closed state
