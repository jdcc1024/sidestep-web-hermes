# Issue: Jersey Run Public Form

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [x] Database: `jerseyRunResponses` table — write via Convex mutation; read `jerseyRuns` to render form
- [x] API: Convex query `getPublic` (public); mutation `submitResponse`
- [x] Frontend: Public (no-auth) fan submission page at `/run/<id>`; closed state when deadline passed or status is "closed"
- [x] Tests: Submission validation; empty name/number triggers warning; closed form shows correct state; fixed vs open mode renders correctly

## Description
Build the publicly accessible jersey run form that fans and teammates fill out without creating an account. The form is reached via the shareable link the captain generates. It renders the team's jersey options, dynamically adapts to the captain's configuration (open vs fixed names/numbers, custom questions), warns on empty name or number, and shows a "closed" state if the deadline has passed or the captain has closed the run.

## Acceptance Criteria
- [x] Public route `/run/[id]` — accessible without authentication
- [x] Form fields: respondent's real name (required), email (required, for captain's reference), jersey selection (from run's size options), name on jersey (with "leave blank for no name" note — triggers a warning modal before submit if blank), number on jersey (same blank-warning behavior), answers to any custom questions defined by the captain
- [x] When `namesMode === "fixed"`: show a dropdown/select of the captain's fixed roster; respondent picks their entry
- [x] When `namesMode === "open"`: show free-text fields for name and number
- [x] Empty name or number: allow submission but display a warning ("Are you sure you want to leave your jersey name/number blank?") with Confirm / Go Back options
- [x] On submission, create a `jerseyRunResponse` record in Convex
- [x] Show a confirmation message after successful submission: "You're in! Your captain will be in touch."
- [x] If jersey run `status === "closed"` or deadline has passed: show a "This jersey run has closed" message; hide the form
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: 2-08
- Blocks: 2-10, 3-01, 3-04

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Jersey Run), Section 5 (In Scope), Section 9 (Testing Strategy)

## Implementation Notes
- Route: `app/(run)/[id]/page.tsx` — use a separate route group `(run)` with no auth middleware applied
- The "closed" check: compare `jerseyRun.deadline` to the current date (server-side in the query) and/or check `jerseyRun.status === "closed"`
- Deadline check at the database query level is more reliable than client-side — have the `getJerseyRun` query return `{ ...run, isExpired: run.deadline < Date.now() }`
- Warning for blank name/number: implement as a confirmation dialog (simple `window.confirm` or a modal component) — triggered on submit if either field is empty
- This form is intentionally lightweight — no Clerk, no user context, just a Convex public query and mutation

## TDD Approach
1. Write test: Render the form with a mock open jersey run → submit with all fields → assert `submitJerseyRunResponse` called with correct data; render a closed/expired run → assert form is hidden and closed message shows; submit with blank name → assert warning dialog appears before mutation fires
2. Implement: Build the page, Convex query, mutation, and confirmation dialog
3. Verify: Open the shareable link in an incognito window; submit a response; confirm it appears in the captain's dashboard (2-10)
