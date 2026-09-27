# Issue: Customer Participation History

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `jerseyRunResponses` — query by `respondentEmail` matching the logged-in user; join with `jerseyRuns` and `orders` for context
- [ ] API: Convex query `listMyParticipations` — returns all jersey run responses where the respondent's email matches the current user's email
- [ ] Frontend: "Participated In" section on the customer portal dashboard; read-only cards for each participation
- [ ] Tests: Query returns correct responses filtered by email; renders empty state; renders participation cards with correct data

## Description
Add a "Participated In" section to the customer portal dashboard showing orders from other teams' jersey runs where this customer submitted a response. This completes the customer's full order history — not just orders they created as a captain, but also runs they joined as a fan or teammate. The view is read-only and shows the team, jersey details, size, and submission date.

## Acceptance Criteria
- [ ] "Participated In" section appears on the customer portal dashboard below "My Orders" and "My Designs"
- [ ] Each entry shows: team name (from the linked order), submission date, jersey size selected, name on jersey, number on jersey
- [ ] Empty state: "You haven't participated in any team jersey runs yet"
- [ ] Participation entries are matched by the logged-in user's email (matching `jerseyRunResponse.respondentEmail`)
- [ ] Entries are read-only — no editing or cancellation in Phase 1
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-09
- Blocks: none

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — P1 Should Have, captain sees orders participated in)

## Implementation Notes
- The `listMyParticipations` query matches on `respondentEmail` — fans submit their email on the public form without an account, so this is the only linkage available
- Edge case: if a fan used a different email than their Clerk account email, the entries won't appear — acceptable in Phase 1; future phases can improve this with account linking
- Route: add a "Participated In" section to the existing `app/(portal)/dashboard/page.tsx` — no new route needed
- Keep the query simple: `jerseyRunResponses` filtered by `respondentEmail === currentUser.email`, then fetch the linked `jerseyRuns` and `orders` for display context

## TDD Approach
1. Write test: Seed a `jerseyRunResponse` with the current user's email; call `listMyParticipations` → assert the response appears; seed with a different email → assert it doesn't appear; render the dashboard section with mock data → assert participation cards render with correct team name and jersey details
2. Implement: Build the Convex query, add the dashboard section, and build the participation card component
3. Verify: Submit a jersey run response using the same email as a test user's Clerk account; log in as that user; confirm the participation appears in their dashboard
