# Issue: Switch every reader and the order form onto order items

## Phase: 3

## Type: improvement

## Size: L (~20 files, mostly re-plumbing, no visible change except error text)

## Description

Initiative 0004, phase 1. Design: `docs/architecture/0004-order-items.md`
(Must answer 3, 5, 6). After this issue **every read and every write of order
content goes through `orderItems`**. The legacy `rosterEntries` / `orderEntries`
tables stay in the schema, still hold their data, and are no longer read or
written by any UI path (L-06 deletes them).

**No visible change for captain or player** except that raw server text stops
reaching the public form's error line. The order page keeps its current
layout; L-03 rebuilds it.

### Order form (public): `submitOrder` and `getPublic`

- `orderEntries.submitOrder`: same args, except a line's
  `rosterEntryId: v.optional(v.id("rosterEntries"))` becomes
  `itemId: v.optional(v.id("orderItems"))`. Writes `orderItems` per the design
  note: **fill before insert** (a fillable item: same design + `rosterSlotKey`,
  no size, no submitter, live, oldest first; a `Set` stops two lines filling one
  row), otherwise insert `source: "fan"`. Fixed mode: `itemId` must be live, on
  this order + design, and named; fill it if fillable, otherwise insert a copy of
  its name / number / letter. Open mode: a blank name keeps the typed number.
  Gate: form open **and** `!isListLocked(order)`. Return shape keeps `created`
  and `collisions` (collision computed with the same rule `summarize` uses).
- `jerseyRuns.getPublic`: `design.roster` = the order's live **named** items,
  deduped by `rosterSlotKey` (oldest `_id`), `{ _id, name, number }` only.
- `components/run/JerseyRunPublicForm.tsx`: rename `rosterEntryId` → `itemId`
  and the id type. Error line uses `userMessage(err, "Something went wrong. Please try again.")`.
  **Nothing else in the file changes.**

### Readers

| Reader | Change |
|---|---|
| `app/portal/orders/[id]/page.tsx` | replace `countsByRun` + `listOrderEntries` + `listForRun` with one `orderItems.listForOrder({ orderId })`; map to the existing `RosterRow` / `RosterSheetSlot` / `BreakdownEntry` props through pure mappers in `lib/orderItem/views.ts` so the current components render unchanged |
| `components/portal/RosterSheet.tsx` | re-wire to `orderItems.add/addMany/update/remove/copyToDesign`, keyed by `orderId` (not `runId`) — so the sheet works **before a run exists**; remove no longer errors on a sized player |
| `app/portal/orders/[id]/page.tsx` DesignSection | the "Start collecting below to start building this design's roster" branch goes; the sheet renders whenever the order has the design |
| `convex/jerseyRuns.ts` | `listOrderEntries` (admin run page + responses page) and `listMyResponses` read items (same return shapes; `_id` becomes an item id; `name`/`number`/`designation` from the item); `_closeRun` count = `itemCount`; `lock` snapshot computed from `summarize` (it stays until L-06) |
| `convex/admin.ts` | `getOrder` count, `exportOrder` rows (sized items only, same columns), `listJerseyRuns` count — all via `loadItems` + `summarize` |
| `convex/orders.ts` | `isOrderLocked` → `isListLocked` (same rule today) |
| `convex/orderEntries.ts` | `affectedByDesignRemoval` / `removedDesigns` keep their `runId` args for now but read items of `run.orderId` (L-04 re-keys the UI) |
| `convex/_devSeed.ts` | seed `orderItems` directly (both fixture orders; the no-run order gets 2 captain items, one Needs size) |

### Dev data

Run `npx convex run _migrations:backfillOrderItems` on the **dev** deployment
once the schema is pushed. Record in the handoff: its return value, and for
each order with a run, old `orderEntries.countsByRun.total` vs new
`listForOrder.summary.itemCount` (must be equal).

## Acceptance Criteria

- [ ] `JerseyRunPublicForm.test.tsx` and `submitOrder.test.ts` pass with only the id rename (§7.10)
- [ ] Open mode: a player line matching a captain's Needs-size item (same design, name, number; case/space-insensitive) fills that item (size, qty, submitter set; same `_id`); a non-matching line inserts a `fan` item (§7.6)
- [ ] Fixed mode: picking a Needs-size item fills it; picking an already-sized item, or picking one item in two sizes in one submission, inserts additional items with the same name / number / letter, and none is silently merged (§7.6)
- [ ] Open mode collision: two different emails on the same design + name + number → both items `collision: true` in `listForOrder`; same email twice → no collision; fixed mode → never (§7.6; JCC Q7 = A)
- [ ] Same name, different number (`Lee #4`, `Lee #9`): two separate items; neither fills the other's Needs-size item; no collision in either mode; `getPublic`'s picker lists both
- [ ] Same name + number submitted twice (same or different email, either mode) produces two items; nothing is merged or rejected
- [ ] `submitOrder` is rejected when `isListLocked`, and when the form is closed
- [ ] `getPublic` exposes only `_id`, `name`, `number` per picker entry; removed and unnamed items are absent
- [ ] Order page total, per-design counts, size chips, roster preview and CSV export all come from the single `listForOrder` subscription (§7.9); existing page tests pass
- [ ] On an order **with no run**, the captain can open the roster sheet and add a player (§7.3); removing a sized player succeeds (no "remove those first") (§7.4)
- [ ] Every reader in the table above excludes removed items (one test each)
- [ ] Admin `exportOrder` row count and `getOrder` count equal `summary.itemCount` for the same order
- [ ] Public form error line never shows `[CONVEX`, `Request ID`, `ConvexError` or a file path — test with a mocked `submitOrder` rejecting a raw `Error` (§8.10)
- [ ] Dev backfill done; per-order totals match (numbers in the handoff)
- [ ] All tests pass; no regressions

## Dependencies

- Blocked by: L-01

## Notes

- Files likely touched: `convex/orderEntries.ts`, `convex/submitOrder.test.ts`, `convex/orderEntries.test.ts`, `convex/jerseyRuns.ts` (+ test), `convex/admin.ts` (+ test), `convex/orders.ts`, `convex/_devSeed.ts` (+ test), `components/run/JerseyRunPublicForm.tsx` (+ test), `components/portal/RosterSheet.tsx` (+ test), `app/portal/orders/[id]/page.tsx` (+ test), `lib/orderItem/views.ts` (+ test).
- Leave `convex/rosterEntries.ts`, `orderEntries.create/listByRun/countsByRun` and `convex/_orderEntries.ts` in place, unused. L-06 deletes them with the tables. Don't widen this diff.
- `listMyResponses` must filter `removedAt` itself: it reads `by_submitterEmail`, not `loadItems`.
- JCC answered Q7 = A: keep the `namesMode === "open"` condition in `summarize` as designed.
