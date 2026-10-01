# Issue: List locks when confirmed; admin edits the same list; retire the old tables

## Phase: 3

## Type: feature

## Size: L (~18 files)

## Description

Initiative 0004, phase 1, last slice. **This is the only issue that depends on
JCC's Gate 1 answers to Q1, Q2 and Q5.** JCC approved the recommended
answers at Gate 1 (2026-10-01): Q1 = A, Q2 = A, Q5 = A ("Email us" =
`mailto:info@sidestep.design`). The alternatives at the end are kept for the record.
Design: `docs/architecture/0004-order-items.md` (Must answer 4, 5).

### 1. The lock rule (Q1 = A)

- `lib/orderItem/lock.ts`: `isListConfirmed(order)` = internal stage
  `"Order Size Confirmed"` has a `completedAt`.
- `convex/_orderItems.ts` `isListLocked` body → `isListConfirmed(order)`. Nothing
  else changes shape: `requireListWriter`, `submitOrder`, `orders.updateOrder`,
  `getMyOrder.locked`, `listForOrder.locked/canEdit` already go through it.
- The deadline only closes the form: `lib/jerseyRun/lock.ts` `effectiveStatus`
  maps open + past deadline → `closed`; drop `locked`, `canLock`, `canUnlock`,
  `statusAfterUnlock`. `jerseyRuns.updateSettings` with a future deadline sets
  `status: "open"` (extending the deadline reopens the form). Run settings
  mutations are guarded by `isListLocked`, not by run status.
- Delete `jerseyRuns.lock` / `unlock` (no UI calls them) and `lockSnapshot`.
  The confirmed basis is protected by the write guard + `updatedAt`/`updatedBy`.

### 2. Confirm gate (Q2 = A)

- `lib/orderItem/checks.ts`: `listProblems(items): Problem[]`, with one rule for
  now, `needs-size`. This is the phase-2 seam, so keep it a list of rule functions.
- `admin.updateOrderStages`: on the transition of "Order Size Confirmed" from not
  completed → completed, load live items on the order's current designs; if
  `listProblems` is non-empty, reject with
  `"<n> items need a size: <label>, <label>, …"` (first 5 labels, then "and n more").
  Unchecking it (unlock) is always allowed. Other stage edits are unaffected even
  if a locked list later gains a Needs-size item via an admin edit.

### 3. Admin edits the same list (rule 8)

`app/admin/orders/[id]/page.tsx` renders `OrderList` for the order (same
component, same `listForOrder`). `canEdit` is true for admin from the server,
locked or not. Show the `Locked for production` state as a badge, not as
hidden controls. Admin copy may use any words.

### 4. Locked note (Q5)

`components/portal/OrderLocked.tsx`: `Locked for production.` `Your list is
confirmed and we're making it now. Need a change? Email us and we'll sort it
out.`, with "Email us" as a `mailto:` to the ops address constant already used
by `convex/jerseyRunActions.ts` (`info@sidestep.design`) — move it to a shared
`lib` constant rather than duplicating it.

### 5. Retire the legacy model

- Migration `retireLegacyRosterTables` (internalMutation, idempotent): deletes
  all `rosterEntries` and `orderEntries` rows, patches runs with
  `status: "locked"` → `"closed"`, and clears `lockSnapshot`. Run it on dev (record
  the output), then remove both tables, `lockSnapshot` and the `locked` literal
  from `convex/schema.ts`.
- Delete `convex/rosterEntries.ts` (+ test), `orderEntries.create/listByRun/countsByRun`,
  `convex/_orderEntries.ts`, `lib/rosterEntry/form.ts` if unused, and
  `backfillOrderItems` (its job is done; note that in the migration file's history comment).
- `grep -rn "rosterEntries\|orderEntries\|lockSnapshot" convex app components lib`
  returns only the `submitOrder` function name/file (the module name `orderEntries.ts`
  may stay, as it's the public form's API path) and migration comments.

## Acceptance Criteria

- [ ] With "Order Size Confirmed" unchecked, a captain can add/edit/remove after the form deadline has passed; the public form is closed (§7.2, Q1 = A)
- [ ] Checking "Order Size Confirmed" on a list with no Needs-size items succeeds; the captain's order page then shows the locked note and **no** add/edit/remove/paste/copy control, and `Download CSV` still works (§8.9)
- [ ] Checking it on a list with 2 Needs-size items is rejected with a message naming both; the stage stays unchecked (Q2 = A)
- [ ] While confirmed: captain `add/update/remove/restore/addMany/copyToDesign` and `orders.updateOrder` are rejected; `submitOrder` is rejected; **admin** edits succeed from the admin order page and the captain's view updates live (§7.8)
- [ ] Unchecking the stage unlocks the list for the captain
- [ ] Extending a closed form's deadline to a future date reopens the public form
- [ ] Locked note copy matches Q5 = A; "Email us" is a working link with `href="mailto:info@sidestep.design"`, keyboard focusable; no raw error text anywhere in the lock paths (§8.10)
- [ ] After `retireLegacyRosterTables` on dev, the schema push succeeds with the legacy tables removed; all order pages and the public form work on the seeded fixtures
- [ ] The grep in section 5 is clean
- [ ] All tests pass; no regressions

## Dependencies

- Blocked by: L-05
- Blocked by JCC decisions Q1, Q2, Q5 (Gate 1): answered A, A, A on 2026-10-01

## Notes

- Files likely touched: `lib/orderItem/{lock,checks}.ts` (+ tests), `convex/_orderItems.ts`, `lib/jerseyRun/lock.ts` (+ test), `convex/jerseyRuns.ts` (+ test), `convex/admin.ts` (+ test), `app/admin/orders/[id]/page.tsx` (+ test), `components/portal/OrderLocked.tsx`, `convex/_migrations.ts` (+ test), `convex/schema.ts`, deletions in section 5.
- If this runs past ~20 files, split section 5 into an L-06b (no behaviour change) and ship 1–4 here. (L-07 is taken by the `jerseyRuns` → `orderForms` rename, which runs after this.)

### If JCC answers differently

- **Q1 = B (captain sends the list):** replace section 1 with `orders.listSentAt?: number`; `isListLocked` = `listSentAt` set; captain mutation `orderItems.sendList({ orderId })` (owner, runs `listProblems` per Q2) and admin `orderItems.reopenList`; a `Send my list to Sidestep` button in the list footer (copy from UX). Sections 3–5 unchanged.
- **Q1 = C (deadline locks everything):** drop sections 1–2; `isListLocked` keeps L-01's body; keep `lib/jerseyRun/lock.ts` and `unlock` for admin; admin reopen = `jerseyRuns.unlock`. Sections 3–5 unchanged (still drop `lockSnapshot`).
- **Q2 = B:** drop the gate; show `listProblems` as a warning on the admin order page.
- **Q5 other:** section 4's copy and link only.
