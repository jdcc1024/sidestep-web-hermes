# Issue: Order form card, captain wording, no raw errors

## Phase: 3

## Type: improvement

## Size: M (~16 files, mostly copy)

## Description

Initiative 0004, phase 1. UX §4 ("Order form card", "Errors"), §6
(terminology, Q4 = A: captain-facing copy only, code names unchanged), §8.
Design: `docs/architecture/0004-order-items.md` (Must answer 6).

### 1. Order form card (replaces "Collect from your team")

A section component on the order page, below the Order list:

- No form yet: `Order form` / UX §4 help text / button `Make an order form`.
  The button opens today's `StartCollecting` dialog (the deadline is asked
  **here and only here**), relabelled.
- Form exists: `Players add their own name, number and size. It all lands on your list above.`,
  chips `Open` / `Closed` and `Closes <date>`, buttons `Copy link` (reuse
  `ShareLink`/copy pattern) and `Form settings` (→ `/portal/orders/[id]/run/setup`).
- `Form settings` page (`JerseyRunSetup`) holds deadline, custom questions **and
  names mode**, which moves off the order page with the labels
  `Players type their own name and number` / `Players pick their name from your list`.
  The "Nobody can order this design" fixed-mode warning moves to the list's
  design group (same condition: fixed mode, no named items on the design).

### 2. Captain-facing wording sweep

Replace "roster", "slot", "not yet filled", "jersey run", "run", "collecting",
"collected", "responses" in captain-facing copy under `app/portal/**` and
`components/portal/**` with UX §6 terms (`Order list`, `item`, `Needs size`,
`Order form`, `Locked for production`). Includes: header badge
(`<n> items`), the basics card "Collected" field (`Items`), portal dashboard
cards, `OrderLocked` note (keep text until L-06 sets the final copy), design
removal warning, server `ConvexError` strings on captain paths, and the captain
**closure email** (`lib/jerseyRunDeadline.ts`: "Your order form for … closed",
link to the order page). Admin pages and the ops email may keep old words.
The **player-facing** form is out of scope (rule 10): its words don't change.

### 3. Responses page (Q6)

Designed for Q6 = A (retire): delete `app/portal/orders/[id]/run/responses/**`
and its links; the closure email links to the order page; `FanBreakdown` /
`RosterBreakdown` go if unused (the admin run page keeps its own table). If JCC
picks B/C at Gate 1, this section becomes "rename + relink" instead.

### 4. No raw errors anywhere in the portal

Replace every `err.message` / `error.message` in `app/portal/**`,
`components/portal/**`, `components/orderList/**`, `components/run/**` with
`userMessage(err, <specific fallback>)`. Add `lib/userMessage.guard.test.ts`
that reads those trees and fails on `/\b(err|error|e)\.message\b/` (allow
`formState.errors…message`).

## Acceptance Criteria

- [ ] An order with no form shows the `Order form` card with `Make an order form`; the deadline field appears only after pressing it; creating the form shows `Open`, `Closes <date>`, `Copy link`, `Form settings` (§7.3, §8.6)
- [ ] Names mode is set from Form settings with the two new labels; the order page has no names-mode control
- [ ] The words roster, slot, jersey run, collected, responses (case-insensitive, whole word) appear in no rendered captain-facing string under `/portal` — test by rendering the order page, dashboard, edit and form-settings pages with fixtures and scanning text (§8.13)
- [ ] The public order form's rendered text is byte-identical to before this issue (snapshot of the fixed + open fixtures) (§7.10)
- [ ] `userMessage.guard.test.ts` passes, and fails when a `toast.error(…, { description: err.message })` is reintroduced (§8.10)
- [ ] The captain closure email says "order form", not "jersey run", and links to `/portal/orders/<id>` (test on `renderCaptainClosureEmail`)
- [ ] Order form card and settings don't scroll horizontally at 375 (§8.2)
- [ ] Q6 = A: the responses route is gone and nothing links to it (grep test)
- [ ] All tests pass; no regressions

## Dependencies

- Blocked by: L-04

## Notes

- Files likely touched: `app/portal/orders/[id]/page.tsx` (section wiring only), new `components/portal/order/OrderFormCard.tsx` (+ test), `components/portal/StartCollecting.tsx` (+ test), `components/portal/JerseyRunSetup.tsx` (+ test), `components/portal/NamesModeControl.tsx`, `app/portal/page.tsx`, `app/portal/orders/[id]/edit/page.tsx`, `components/portal/DesignRemoval.tsx`, `components/portal/OrderForm.tsx`, `components/portal/DesignForm.tsx` (errors only), `lib/jerseyRunDeadline.ts` (+ test), `lib/userMessage.guard.test.ts`, responses route deletion.
- Q4 = B (rename code too) is **not** this issue: it would be a separate L-07 after L-06.
- Q1 = C (deadline locks everything): the form-card help text must add that the list locks at the deadline. Copy from UX at that point.
