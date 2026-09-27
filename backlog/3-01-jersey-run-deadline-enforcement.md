# Issue: Jersey Run Deadline Enforcement

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `jerseyRuns.status` — updated to "closed" when deadline passes
- [ ] API: Convex scheduled function (cron) that checks all open jersey runs daily and closes expired ones; Resend email triggered on close
- [ ] Frontend: No new UI — the closed state is already handled in 2-09; captain dashboard already shows deadline countdown from 2-10
- [ ] Tests: Cron function closes runs past deadline and not those before; email sends to correct recipients; already-closed runs are not re-processed

## Description
Implement automatic jersey run closure when the deadline passes. A Convex scheduled function runs daily, finds all jersey runs with `status === "open"` and `deadline < now`, sets their status to `"closed"`, and triggers a Resend email to both the captain and the Sidestep admin address. The public form (2-09) already shows the closed state when it reads `status === "closed"` or detects an expired deadline.

## Acceptance Criteria
- [ ] Convex cron job runs daily at midnight PT; queries all open jersey runs; closes any where `deadline < Date.now()`
- [ ] On close: `jerseyRun.status` is set to `"closed"` in Convex
- [ ] On close: Resend sends an email to the captain's email address with subject "Your jersey run has closed" and a summary (team name, response count, link to the captain's dashboard)
- [ ] On close: Resend sends a notification to `info@sidestep.design` with the same summary
- [ ] Runs already `status === "closed"` are skipped
- [ ] Manual close: admin can also set `status = "closed"` immediately from the admin jersey run view (3-02) — uses the same closure logic
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-10
- Blocks: 3-02

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — P1 Should Have, deadline auto-close + captain notification), Section 5 (In Scope — auto form close, email notification)

## Implementation Notes
- Convex cron jobs: defined in `convex/crons.ts` using `cronJobs.daily()`
- The cron calls an internal Convex action (not a mutation directly) to handle the Resend email sending — actions can make external HTTP calls; mutations cannot
- Convex action pattern: `convex/jerseyRunActions.ts` exports `closeExpiredRuns` — queries for expired open runs, updates each to "closed", sends emails via Resend
- Email content: include team name, response count, and a direct link to the captain's dashboard page (`/portal/orders/<orderId>/run/responses`)
- Use `new Date().toLocaleString("en-CA", { timeZone: "America/Vancouver" })` for the Vancouver timezone display in emails

## TDD Approach
1. Write test: Seed a jersey run with a past deadline and `status: "open"`; run the closure logic; assert status is now "closed" and email was sent to the correct addresses; seed a run with a future deadline; assert it remains "open"
2. Implement: Write the cron job, Convex action for closure + email, wire Resend templates
3. Verify: Manually create a run with a past deadline; trigger the cron function via the Convex dashboard; confirm status changes and email is received
