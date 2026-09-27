# Issue: Jersey Run Creation

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [x] Database: `jerseyRuns` table — write via Convex mutation linked to an order
- [x] API: Convex mutation `createJerseyRun`; query `getJerseyRun`
- [x] Frontend: Jersey run setup form within the order detail page; shareable link generation
- [x] Tests: Run created with correct fields; shareable link generated; fixed roster vs open mode both work; custom questions save correctly

## Description
Build the jersey run creation flow accessible from an order's detail page. The captain defines the run's jersey options (names/numbers mode: open or fixed-roster), adds any custom questions (e.g. "How should we deliver to you?"), and sets a deadline. On save, Convex creates a `jerseyRun` record and returns a unique shareable link the captain can send to their team and fans.

## Acceptance Criteria
- [x] Jersey run setup form fields: jersey size options (checkboxes for available sizes: XS, S, M, L, XL, XXL), names mode (open = fan enters their own, fixed = captain pre-defines a roster list), deadline date picker (required)
- [x] When "fixed roster" is selected: captain can add names (and optionally numbers) to a roster list; fan selects from this list on the submission form
- [x] When "open" is selected: fan types their own name and number on the submission form
- [x] Custom questions: captain can add 0–5 custom questions (each is a text label; fan answers in a free-text field); questions can be reordered and deleted
- [x] On save, a `jerseyRun` record is created in Convex with status "open"
- [x] A shareable public URL is generated: `/run/<jerseyRunId>` — displayed on the order detail page with a copy-to-clipboard button
- [x] The jersey run setup section is visible on the order detail page; it shows "Set up jersey run" if none exists, and the run details + shareable link if one does
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: 2-07
- Blocks: 2-09

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Jersey Run), Section 5 (In Scope — Jersey run)

## Implementation Notes
- Route for jersey run setup is embedded in `app/(portal)/orders/[id]/page.tsx` (or a sub-route `app/(portal)/orders/[id]/run/page.tsx` if the form is complex)
- The shareable link `/run/<jerseyRunId>` must be publicly accessible without auth (handled by not protecting this route in Clerk middleware)
- `customQuestions` in the schema is an array of `{ id: string, label: string }` — generate IDs client-side with `crypto.randomUUID()`
- `fixedRoster` is an array of `{ name: string, number: string | null }` — only populated when `namesMode === "fixed"`
- Deadline: store as ISO string; deadline enforcement is handled in 3-01

## TDD Approach
1. Write test: Submit the form in "open" mode with 2 custom questions and a deadline → assert `createJerseyRun` mutation called with correct `namesMode`, `customQuestions`, and `deadline`; test in "fixed" mode with a roster of 3 names → assert `fixedRoster` is populated
2. Implement: Build the form, Convex mutation, shareable link display with copy button
3. Verify: Create a jersey run in browser; copy the link; open it in an incognito window to confirm it's accessible without login
