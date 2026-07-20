# Issue: Admin Customer Management

## Status: done

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `users` table (read + update); `intakes` table (read)
- [ ] API: Convex queries `adminListUsers`, `adminListIntakes`; mutation `adminUpdateUser`, `adminUpdateOrder`, `adminUpdateDesign`
- [ ] Frontend: Admin customers page; admin intake leads page; inline record editing on order/design/customer detail views
- [ ] Tests: Admin can edit a customer's name; non-admin cannot; new self-registered users appear in list; intake submissions list renders correctly

## Description
Build the admin customer management area: a customer list showing all registered users (with registration date, order count, and a "new" badge for recent self-registrations), and an intake leads list showing all public form submissions with their details. Also adds inline editing capability to admin detail pages so admins can correct any field on an order, design, or customer record.

## Acceptance Criteria
- [ ] `/admin/customers` page: table of all users — columns: name, email, registration date, order count, "New" badge if registered within the last 7 days; clicking a user opens their profile
- [ ] Customer profile page: all user fields, their orders list (linked), their designs list (linked); admin can edit customer name and email (inline edit with save button)
- [ ] `/admin/leads` page: table of all intake submissions — columns: name, team name, sport, quantity, brief preview, submission date; clicking shows full brief; "Send invite link" button copies an invite link (`/invite?token=<intakeId>`) to clipboard
- [ ] The lead detail view renders `intake.inspirationLinks` (optional `string[]`, added by 2-14) as clickable `<a target="_blank" rel="noreferrer">` links — raw URLs only, no fetching or previewing the linked content
- [ ] Admin can edit any field on the admin order detail page (team name, sport, quantity, jersey specs) via inline edit fields
- [ ] Admin can edit the design title and brief on the admin design detail page
- [ ] All mutations enforce admin-only access in Convex
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-11
- Blocks: none (Phase 2 complete after this)

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Admin, customer management, record editing, intake leads)

## Implementation Notes

> **Built 2026-07-20.** Two criteria were reinterpreted against the current
> schema: "jersey specs" moved off the order onto the design in O-01, so they
> are edited on the new `/admin/designs/[id]` page (linked from the order),
> not on the order detail page. Mutations are `admin.updateUser` /
> `admin.updateOrder` / `admin.updateDesign` — already namespaced, so no
> `admin` prefix on the function names themselves.
- Routes: `app/(admin)/customers/page.tsx`, `app/(admin)/customers/[id]/page.tsx`, `app/(admin)/leads/page.tsx`
- "New" badge: compare `user.createdAt` to `Date.now() - 7 * 24 * 60 * 60 * 1000`
- "Send invite link" button: the invite URL is `/invite?token=<intakeId>` — use `navigator.clipboard.writeText()` and show a "Copied!" toast
- Inline editing pattern: field displays as read-only text with an "Edit" pencil icon; clicking the icon switches to an input; Save/Cancel buttons appear; on Save, call the mutation
- `adminUpdateOrder`, `adminUpdateUser`, `adminUpdateDesign` mutations should accept partial updates (`Partial<>` equivalent in Convex) and merge them

## TDD Approach
1. Write test: Call `adminUpdateUser` with a new name as an admin → assert `users` record updated; call as non-admin → assert throws; render `/admin/customers` with mock data → assert each user row shows name, email, order count, and "New" badge when applicable
2. Implement: Build customer list, lead list, customer profile, inline edit components, and all Convex mutations
3. Verify: Register a test user; confirm they appear with "New" badge in admin; edit their name; confirm the change is reflected in the portal
