# Issue: Order items: table, captain API, read model, backfill

## Phase: 3

## Type: feature

## Size: M (~11 files, backend + pure lib, no UI)

## Description

Initiative 0004, phase 1 ("one order list the captain owns"). Design:
`docs/architecture/0004-order-items.md` (Decision, Must answer 1, 2, 4, 5, 6).
UX: `docs/ux/0004-order-items.md` §7.

This issue is **additive**. It adds the `orderItems` table, the captain/admin
API over it, the single read model, the error-message helper, and the backfill
from the legacy tables. It changes no existing function and no UI. L-02 switches
the readers over.

### Schema (`convex/schema.ts`)

Add `orderItems` exactly as in the design note (fields: `orderId`, `designId`,
`name?`, `number?`, `designation?`, `size?`, `qty`, `source`, `submitterName?`,
`submitterEmail?`, `customAnswers?`, `runId?`, `removedAt?`, `createdAt`,
`updatedAt`, `updatedBy?`; indexes `by_order` on `orderId`, `by_submitterEmail`).
Leave `rosterEntries`, `orderEntries` and `jerseyRuns` unchanged.

### Pure lib (`lib/orderItem/`)

- `rules.ts`: `checkItemName` (optional, trimmed, blank → undefined, ≤ 80),
  `checkItemSize(value | undefined, allowed, current?)` (blank/undefined → none;
  otherwise must be in `allowed` or equal `current`). Reuse `checkRosterNumber`,
  `checkRosterDesignation`, `checkQty`, `rosterSlotKey`. Don't duplicate them.
- `summary.ts`: `summarize(items, { designIds, titles, namesMode })` →
  `{ designs: [{ designId, title, items, summary }], summary, removedDesigns }`,
  where `summary = { itemCount, needsSize, bySize }`. `itemCount` = Σ qty of
  sized items; `needsSize` = Σ qty of unsized items; `bySize` via `sortSizes`.
  Items on designs no longer in `designIds` go to `removedDesigns` (title,
  itemCount, submitters) and **not** into the totals. `collision` per item: open
  mode only, a named item whose design + `rosterSlotKey` is shared with an item
  from a **different** `submitterEmail`. Items sort by `createdAt`.
- `lib/userMessage.ts`: `userMessage(err, fallback)` returns `err.data` for a
  `ConvexError` whose data is a string, otherwise `fallback`. It never returns
  `err.message`.

### Server helpers (`convex/_orderItems.ts`)

- `loadItems(ctx, orderId)` is the **only** `by_order` reader of `orderItems`,
  and it drops `removedAt` rows.
- `isListLocked(ctx, order)`: **today's rule**. The order's run exists and
  `isLocked(run)`. (L-06 replaces the body. Keep it one function.)
- `requireListWriter(ctx, orderId)`: current user; admin → allowed regardless of
  lock; else must own the order and `!isListLocked`. Returns `{ user, order }`.
  Messages are customer copy (`"This order is locked for production."`).

### API (`convex/orderItems.ts`)

| Function | Args | Rule |
|---|---|---|
| `listForOrder` (query) | `{ orderId }` | null if signed out / order missing; throws if caller is neither owner nor admin. Returns `summarize(…)` plus `locked`, `canEdit` (= admin, or owner && !locked), `form: { runId, namesMode } \| null` |
| `add` | `{ orderId, designId, name?, number?, designation?, size?, qty }` | `requireListWriter`; design on order; size ∈ `SIZE_OPTIONS` or none; `source: "captain"`; returns id |
| `addMany` | `{ orderId, designId, rows: [{ name?, number?, size? }] }` | as `add`, 1..`ROSTER_PASTE_MAX_ROWS`, all-or-nothing, not deduped (client previewed) |
| `update` | `{ itemId, name?, number?, designation?, size?, qty }` | order resolved from the item; `requireListWriter`; **full replace** of those five fields (omitted optional = cleared); size may keep its current value (legacy `XXL`); never touches design, source, submitter, answers; sets `updatedAt`, `updatedBy` |
| `remove` | `{ itemId }` | `requireListWriter`; sets `removedAt` (no "remove those first") |
| `restore` | `{ itemId }` | `requireListWriter`; clears `removedAt`; no-op if not removed |
| `copyToDesign` | `{ orderId, sourceDesignId, targetDesignId }` | port of `rosterEntries.copyToDesign`: named items only, name / number / letter, deduped by `rosterSlotKey` against live target items, land Needs size; returns `{ copied, skipped }` |
| `affectedByDesignRemoval` (query) | `{ orderId, designId }` | owner or admin; submitters + qty of live items on that design |

No function accepts `isAdmin`, a user id, `source`, `submitterName`,
`submitterEmail` or `customAnswers`.

### Backfill (`convex/_migrations.ts`)

`backfillOrderItems` (internalMutation, idempotent per order: skip an order
that already has any `orderItems` row). Mapping in the design note's table:
entry with slot / blank entry / empty slot / removed-design entry. It carries
`createdAt`, `source`, submitter and answers, and sets `runId`. Returns
`{ orders, itemsCreated }`. Doc comment gives the run command. The legacy tables
are not modified.

## Acceptance Criteria

- [ ] `orderItems` table and indexes exist; `npm run verify` passes with no other schema change (§7.1)
- [ ] A captain can `add` an item to an order **with no run** (no deadline, no form) and it appears in `listForOrder` (§7.3, §8.6)
- [ ] `add` with no size stores no `size`; `summarize` counts it in `needsSize`, not `itemCount`, per design and overall (§7.5, §8.7)
- [ ] `update` changes every editable field of a `fan`-sourced item (name, number, letter, size, qty) and leaves `submitterName`, `submitterEmail`, `customAnswers`, `source`, `createdAt` unchanged (§7.2)
- [ ] `update` passing a submitter field is rejected by the validator (arg not accepted)
- [ ] `remove` on a sized, player-submitted item succeeds; `listForOrder` no longer returns it and the totals drop; `restore` brings back the **same `_id`** with identical name, number, size, qty, letter, submitter and position (§7.4, §8.5)
- [ ] Captain of order X cannot `add`/`update`/`remove`/`restore`/`copyToDesign`/`listForOrder` on order Y (each rejected)
- [ ] When `isListLocked` is true: captain writes are rejected with a message containing no "jersey run"/"roster"; **admin** `add`/`update`/`remove`/`restore` succeed (§7.8)
- [ ] `listForOrder` returns `canEdit: false, locked: true` to a captain on a locked order and `canEdit: true` to an admin
- [ ] `addMany` stores the size per row when given, none when not; rejects 0 or > 200 rows; one bad row rejects the batch (§7.7 server half)
- [ ] `copyToDesign` copies name / number / letter only, skips existing keys, lands items as Needs size, returns accurate counts
- [ ] `summarize`: items on a design not in `designIds` are excluded from totals and listed in `removedDesigns`; collision is flagged only in open mode and only across different submitter emails (§7.6 read side, §7.9)
- [ ] `userMessage` returns the ConvexError string data; returns the fallback for a plain `Error` whose message contains `[CONVEX`, `Request ID` or `ConvexError` (§8.10)
- [ ] `backfillOrderItems` on a fixture (slot with 2 entries, empty slot with letter, blank entry qty 3, entry on a removed design) creates exactly 5 items with the mapped fields; a second run creates 0
- [ ] All tests pass; no existing test changes

## Dependencies

- Blocked by: none

## Notes

- Read `convex/_generated/ai/guidelines.md` first. Validate every arg. Use `ConvexError` with a string for user-facing failures.
- Files likely touched: `convex/schema.ts`, `convex/orderItems.ts` (+ `.test.ts`), `convex/_orderItems.ts`, `convex/_migrations.ts` (+ test, new or in `orderItems.test.ts`), `lib/orderItem/{rules,summary,index}.ts` (+ tests), `lib/userMessage.ts` (+ test).
- `ItemView` (what `listForOrder` returns per item): `_id, designId, name?, number?, designation?, size?, qty, source, submitterName?, submitterEmail?, customAnswers, createdAt, collision`. Captain and admin both see submitter email and answers; the captain sees them today on Responses.
- Sort by `createdAt` in `summarize`, not index order: migrated rows get a new `_creationTime`.
- TDD: convex-test for the API and auth matrix, plain vitest for `summarize`/rules/`userMessage`.
