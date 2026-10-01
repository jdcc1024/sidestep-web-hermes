# 0004 Order items: one order list the captain owns (architecture)

Register: `~/sidestep/initiatives/0004-roster-collection/initiative.md` (phase 1)
UX spec: `docs/ux/0004-order-items.md` (§7 rules = requirements, §8 = acceptance)
Mockup: `docs/ux/0004-order-items/mockup.html`
Replaces: the rosterEntry/orderEntry split and the run lock from
`docs/prd/roster-manager-and-lock.md` (R-01..R-07)
Issues: `backlog/L-01-…` … `L-07-…`

## Decision

**One new table, `orderItems`, keyed by order. It replaces both
`rosterEntries` and `orderEntries`.** One row is one item as the captain sees
it: design, optional name / number / C-A letter, size **or none**, qty ≥ 1,
who created it, and (when it came through the order form) the submitter and
their answers. The run (`jerseyRuns`, "order form" in the UI) stops owning
data. It is a way in: an optional, 0..1 link plus deadline that writes items.
(After L-07 the code calls it what the UI does: `jerseyRuns` → `orderForms`,
JCC Q4 = B. This note uses the pre-L-07 names, which L-01..L-06 build on.)

Removal is a soft delete (`removedAt`), so Undo is one patch on the same row.
Every reader goes through one server helper (`loadItems` → `summarize`), so
chips, totals, CSV and admin can't disagree. The lock is one function,
`isListLocked(ctx, order)`, which admins bypass. It keeps today's rule until
L-06, which swaps its body for JCC's Q1 answer, so **Q1 changes exactly one
issue**.

```
TODAY                                         AFTER (L-06)
─────                                         ────────────
order ──1:1── jerseyRun (deadline, lock)      order ──0..1── jerseyRun  (the order form:
                 │                               │                 link, deadline, questions,
       ┌─────────┴──────────┐                    │                 names mode; owns no rows)
 rosterEntry ──0..N── orderEntry                 │
 (name,#,C/A)        (size,qty,submitter)        └──0..N── orderItem
 "not yet filled" = 0 entries                              design, name?, number?, C/A?,
 blank line = entry with no slot                           size? ("Needs size" if absent),
 nothing exists until a run exists                         qty, source, submitter?, answers?,
 remove slot with entries → throws                         runId? (provenance), removedAt?
```

Analogy: today an item is a join across two tables whose parent is a campaign.
After this, an item is a row, the order is its aggregate root, and the form is
just one of three writers. The other two are the captain and the admin.

## Options considered

| | (A) New `orderItems` table ✅ | (B) Keep both tables behind one API | (C) Fold size/qty into `rosterEntries` in place |
|---|---|---|---|
| What the captain calls an item | one row | a slot + 0..N entries, or an entry with no slot | one row |
| Edit "the size of this item" | patch one row | ambiguous when a slot has 2 entries (M and L) | patch one row |
| Remove + exact Undo | soft delete, same `_id` | must delete 1 slot + N entries and recreate them, with new ids | soft delete |
| "Needs size" vs "blank jersey" | `size` absent / `name` absent: two fields on one shape | two different table shapes | one shape |
| Schema change | new table, clean validators; old tables untouched until L-06 | re-parent both to order (`runId` optional) | `name` optional, 6 new optional fields on a live table, orderEntries migrated into it |
| Rollback while building | trivial: old tables still hold the data | n/a | hard: in-place rewrite |
| Name | product-neutral (0006 hats) | keeps "roster/slot" | keeps "roster" |

**Why not (B).** It's the least migration, but the split is the bug. Every
behaviour rule in §7 is about "the item", and in B the item isn't a thing the
database knows about. The facade would re-derive it on every read and
un-derive it on every write. Remove/Undo would recreate rows under new ids.
"Needs size" and "blank" stay two representations that every reader keeps
joining. That is the leaky abstraction we're trying to delete, just moved
behind a function boundary.

**Why not (C).** Same end shape as A, reached the risky way. It rewrites a live
table in place, all its old code paths must keep working mid-migration, and
the table keeps the name UX is retiring. A new table costs one backfill
function, and it keeps the old data readable until the last issue.

## Must answer 1: can items exist without a run? What is the parent?

**Yes. The parent is the order, and every item also carries a design.**
`orderItems.orderId` is required and `runId` is optional provenance: "which
form this came through". It's stamped when a player submits and is never used
for scoping. So:

- Items can be added the moment an order has a design (decision 3). No run, no
  deadline. The order still needs a design first, as today: an item is made
  from a design.
- **A run created later** starts owning nothing. It points at the order, and
  its public form reads and writes that order's items. The picker list in fixed
  mode is the order's named items, whether the captain added them before or
  after the form existed.
- **The 1:1 order→run rule becomes 0..1 and stays enforced** (the guard in
  `jerseyRuns.create` is unchanged). Several forms per order would be one
  `runId` filter away, but nobody has asked for it.
- The run keeps what's really about the form: deadline, custom questions,
  names mode, `sizeOptions`, open/closed.

## Must answer 2: what replaces the split. Remove, Undo, migration

**One table (option A).** Schema (L-01):

```ts
orderItems: defineTable({
  orderId: v.id("orders"),
  designId: v.id("designs"),
  name: v.optional(v.string()),          // absent = "No name"
  number: v.optional(v.string()),        // text: "01" ≠ "1"
  designation: v.optional(v.union(v.literal("C"), v.literal("A"))),
  size: v.optional(v.string()),          // absent = "Needs size"
  qty: v.number(),                       // integer 1..MAX_QTY
  source: v.union(v.literal("captain"), v.literal("fan")),  // who created the row
  submitterName: v.optional(v.string()), // set when a player sent or filled it
  submitterEmail: v.optional(v.string()),// normalized lowercase, as today
  customAnswers: v.optional(v.record(v.string(), v.string())),
  runId: v.optional(v.id("jerseyRuns")), // provenance only
  removedAt: v.optional(v.number()),     // soft delete; Undo clears it
  createdAt: v.number(),                 // display order; migrated rows keep legacy time
  updatedAt: v.number(),
  updatedBy: v.optional(v.id("users")),  // audit: who last changed it (admin after lock)
})
  .index("by_order", ["orderId"])
  .index("by_submitterEmail", ["submitterEmail"]),
```

Field rules: `name` optional (≤ 80), `number` optional (≤ 8), `designation`
C/A/none (reuse `lib/rosterEntry/rules.ts`), `qty` via `checkQty`. `size` on a
captain or admin write must be in `SIZE_OPTIONS` or equal the item's current
value, so a legacy `XXL` survives an unrelated edit. On a form write it must be
in `run.sizeOptions`, as today. `submitter*` and `customAnswers` are
**never accepted from a captain or admin mutation**. Only `submitOrder` sets
them.

**Remove = soft delete, Undo = `restore`.** `remove({itemId})` sets
`removedAt`. `restore({itemId})` clears it. Same `_id`, same fields, same
position (display sorts by `createdAt`). So "restores the same name, number,
size, qty, letter and submitter" holds by construction, not by copying.

Rejected: hard delete + a `restore(snapshot)` mutation. The client would have
to send `submitterName` / `submitterEmail` back, and a public mutation that
accepts a submitter email lets a captain forge "Added by Riley". Worse, it
plants rows in Riley's `listMyResponses` (read by email). Soft delete never
accepts identity from the client. Also rejected: delete after a scheduled
10 s delay. That adds more moving parts for the same result.

Cost of soft delete: every reader must skip removed rows. **Only
`convex/_orderItems.ts` may query `orderItems` by `by_order`**, via `loadItems`,
which filters. The one other index read (`listMyResponses`, by email) filters
explicitly, and each reader has a "removed item excluded" test. Removed rows
are never purged in phase 1 (dozens per order at most).

**Captain API (`convex/orderItems.ts`, L-01).** `add`, `addMany` (paste, ≤ 200,
optional size per row), `update` (every field, full replace: an omitted
optional clears it, like `rosterEntries.update` does with the letter),
`remove`, `restore`, `copyToDesign` (name / number / letter only, deduped,
lands as Needs size). Plus the reads `listForOrder` and
`affectedByDesignRemoval`. `update` never changes `designId`, `source`,
submitter or answers. Moving an item to another design = remove + add, as
today.

**Migration (L-01 writes it, L-02 runs it on dev):**
`_migrations:backfillOrderItems`, internal, idempotent per order (it skips an
order that already has items):

| Legacy | → orderItem |
|---|---|
| orderEntry with a slot | name / number / letter from the slot, size / qty / submitter / answers / source / createdAt from the entry, `runId` |
| orderEntry with no slot (blank line) | no name / number, the rest as above |
| rosterEntry with 0 orderEntries ("not yet filled") | name / number / letter, **no size**, source from the slot, no submitter |
| entries on a since-removed design | copied as-is (they still show under "removed designs") |

A slot with 3 entries becomes 3 items that share a name. That's what they are:
3 jerseys. The collision flag (below) and the captain's edit handle the rare
real duplicate. Old tables are left untouched until L-06 deletes them. The
dev data is fixtures (`_devSeed`), so the migration is verified by its unit
test plus a before/after count on dev, not by production care. There is no
production deployment yet.

## Must answer 3: the public form feeds the same list, and nothing changes for players

`orderEntries.submitOrder` keeps its args except for one rename: a line's
`rosterEntryId` becomes `itemId: v.optional(v.id("orderItems"))`.
`jerseyRuns.getPublic` returns the same shape, where `design.roster` is the
order's **live named items**, deduped by `rosterSlotKey` (oldest id wins),
exposing only `{_id, name, number}` as today. The form's fields, steps, copy
and validation are unchanged (rule 10). The only diff in
`JerseyRunPublicForm` is the id type/field name, plus the error text fix
(Must answer 6).

Write rules inside `submitOrder`, one transaction:

- **Fill before insert.** A line that matches a **fillable** item (same design
  + `rosterSlotKey(name, number)`, `size` absent, no submitter, not removed)
  fills it: it sets size, qty, submitter, answers and `runId`, and leaves
  `source` alone. That's today's "a fan fills a captain-seeded slot", so a
  seeded "Needs size" row flips to M (UX §3 journey). Oldest match first. Filled
  ids go into a `Set` so two lines never fill the same row.
- **Otherwise insert** a `source: "fan"` item.
  - *Open mode*: typed name / number (a blank name keeps the number, which
    today is silently dropped: a data fix, invisible to the player).
  - *Fixed mode*: the picked `itemId` must be live, on this order and design,
    and named. If it's fillable it's filled. If not, a new item copies its
    name / number / letter (someone else already sized it, or the same player
    picked two sizes).
- **Collision flag: today's rule, derived at read time.** In an **open-mode**
  form, a named item whose design + key is shared with an item from a
  *different* submitter email gets `collision: true` in `listForOrder`, with
  the same semantics as `rosterEntries.listForRun` today (R-02; UX cites it
  as M-07). Fixed mode never flags, as today. A second pick of the same name
  in fixed mode is a second, visible row ("Added by …"), not a silent merge.
  See Q7 if JCC wants that flagged too.
- Gate: the form is open (`effectiveStatus(run) === "open"`) **and**
  `!isListLocked(order)`. The public path can only insert `fan` rows or fill
  an empty row. It can never change a size already set, remove, or touch
  `removedAt`.

## Must answer 4: the lock (captain vs admin) and R-06's `lockSnapshot`

```
                        ┌───────────────────────────────┐
captain mutation ──────►│ requireListWriter(ctx, order) │── admin? ──► allow (even locked)
admin mutation   ──────►│  owner && !isListLocked(order)│── else ───► ConvexError("This order is locked…")
                        └──────────────┬────────────────┘
submitOrder (public) ── form open && !isListLocked ──┘
orders.updateOrder / getMyOrder.locked ── isOrderLocked = isListLocked (one rule, O-06 kept)
listForOrder ─► { locked, canEdit = admin || (owner && !locked) } ─► UI renders controls iff canEdit
```

- **One predicate, `isListLocked(ctx, order)` in `convex/_orderItems.ts`.**
  L-01..L-05 implement it as today's rule (the order's run is effectively
  `locked`), so behaviour doesn't move until the issue that decides it.
  **L-06 (Q1 = A)** replaces the body with a pure
  `isListConfirmed(order)`: the internal stage "Order Size Confirmed" has a
  `completedAt`. Unchecking the stage is the unlock. The deadline then only
  closes the form: `effectiveStatus` maps open + past deadline → `closed`,
  and the `locked` run status goes away.
- **Admin bypass lives server-side in `requireListWriter`**, from the Convex
  `users.isAdmin` cache (written only by `internal.users.applyClerkUser`). No
  function takes an `isAdmin` or identity arg. The UI never decides
  "can edit". It renders `canEdit` from `listForOrder`, so the captain page
  and the admin page are the same component (rule 8, L-06).
- **Confirm gate (Q2 = A, L-06):** `admin.updateOrderStages`, on the
  not-confirmed → confirmed transition of "Order Size Confirmed", runs
  `listProblems(items)` and rejects with
  `"3 items need a size: Jordan Lee #4, …"`. The admin checklist already
  shows `ConvexError.data`.
- **`lockSnapshot` retires (L-06).** It's written by `jerseyRuns.lock` and
  read by nothing but tests (`grep lockSnapshot`). Under rule 8 JCC edits
  after lock, and rule 9 says every surface reads one list, so a frozen copy
  would be the second, disagreeing number that rule 9 exists to prevent. The
  "confirmed basis can't drift" guarantee moves from *a copy* to *the write
  guard* (after lock, only admin writes), with `updatedAt` / `updatedBy` as
  the audit trail. `jerseyRuns.lock` / `unlock` (no UI ever called them) are
  deleted, and stored `locked` runs are patched to `closed`.
- **R-08 (run surface lock controls) is superseded and removed from
  `backlog/`** in this commit. It never shipped. Under Q1 = A the list, not
  the run, is what locks, and JCC locks it from admin. Under Q1 = B, its one
  surviving idea (a captain-side "send" control) is designed in L-06's
  alternative.

## Must answer 5: one read model, and where phase 2 plugs in

```
orderItems ──► loadItems(ctx, orderId)          (only by_order reader; drops removedAt)
                 └─► summarize(items, order, run) (pure, lib/orderItem/summary.ts)
                       designs[]: { designId, title, items: ItemView[],
                                    summary: { itemCount, needsSize, bySize } }
                       summary:   { itemCount, needsSize, bySize }   ← order total
                       removedDesigns[]                              ← O-08 section
                       collision per item (open-mode rule above)
     ┌──────────────┬───────────────┬──────────────────┬───────────────────┐
 listForOrder    admin.getOrder  admin.exportOrder  jerseyRuns._closeRun   listOrderEntries /
 (captain+admin: count           (supplier CSV)     (closure email count)  listMyResponses
  rows, chips,                                                             (legacy view shapes,
  footer, CSV)                                                             same rows)
```

- `itemCount` = Σ qty of **sized** items. `needsSize` = Σ qty of unsized items.
  That's rule 5 ("counts toward needs a size, not toward the item total").
  **The mockup disagrees:** frame 1 says "Home Kit · 4 items · 1 needs a size"
  and "7 items" in the footer, so it counts the Needs-size row, while rule 5
  gives 3 and 6. Designed for rule 5. It's display copy only (Q8), because
  `summarize` returns both numbers. The order total, the per-design count, the admin
  count and the supplier export all equal `itemCount`, so the CSV reconciles
  with the total. The captain's per-design CSV also lists Needs-size rows
  with a blank size, as today's unfilled slots are, because the captain uses
  it to chase.
- The captain page gets rows, chips, footer and CSV from **one**
  `listForOrder` subscription, so an edit updates all of them in the same
  render (§8 "without a refresh").
- **Phase 2 seam:** `lib/orderItem/checks.ts` exports
  `listProblems(items: ItemView[]): Problem[]`. L-06 ships it with one rule
  (needs size) and uses it for the confirm gate. Phase 2 adds rules there
  (number unique per design, size in the garment's range, count vs
  estimate) and adds a factory formatter next to `lib/orderExport.ts` over
  the same `ItemView[]`. Neither should need a schema change.

## Must answer 6: no raw ConvexError text reaches a customer

- Cause: the client error's `message` is
  `"[CONVEX M(rosterEntries:remove)] [Request ID: …] Server Error Uncaught ConvexError: … at handler (../convex/…)"`.
  About 12 portal/public call sites put `err.message` into a toast or inline
  error.
- **`lib/userMessage.ts`**: `userMessage(err, fallback)` returns `err.data`
  when `err instanceof ConvexError && typeof err.data === "string"`, and
  otherwise `fallback`. It never returns `err.message`. (Convex already masks
  unexpected errors in prod; this also covers dev and `ConvexError`.)
  Server messages on customer-facing paths are written as customer copy
  (`"This order is locked for production."`, not `"This jersey run is
  locked."`). The admin pages keep `String(err.data)`.
- Rollout: L-01 adds the helper. L-02 uses it in the public form (a
  player-visible error path, so still no happy-path change). L-03/L-04 use it
  in every new component. L-05 sweeps the remaining portal sites and adds
  `lib/userMessage.guard.test.ts`, which fails `verify` if
  `(err|error|e).message` appears under `app/portal`, `components/portal`,
  `components/orderList` or `components/run` (`formState.errors.*.message` is
  exempt).

## Functions and auth (security review)

| Function | Kind | Who | Reads / writes |
|---|---|---|---|
| `orderItems.listForOrder({orderId})` | query | order's captain or admin; null if signed out / not found; throws for others | the order's live items incl. submitter email + answers (the captain sees these today on Responses) |
| `orderItems.add / addMany / update / remove / restore / copyToDesign` | mutation | `requireListWriter`: admin always; captain only on own order and only while unlocked | items on that order only; `designId` must be in `order.designIds` (add / copy); `update` / `remove` / `restore` resolve the order from the item, never from an arg |
| `orderItems.affectedByDesignRemoval({orderId, designId})` | query | captain or admin | submitters + qty on that design |
| `orderEntries.submitOrder` | mutation, **public** | anyone with the link | inserts `fan` items / fills empty rows on that run's order; gated on form open + list not locked; re-validates everything |
| `jerseyRuns.getPublic` | query, **public** | anyone with the link | team name, captain display name, designs, named items `{_id, name, number}` only: no emails, sizes or answers (unchanged exposure) |
| `jerseyRuns.listMyResponses` | query | signed-in user | own items by normalized email; removed excluded |
| `admin.*` (getOrder, exportOrder, listJerseyRuns, updateOrderStages) | query / mutation | `requireAdmin` | items via `loadItems` |
| `_migrations.backfillOrderItems`, `…retireLegacyRosterTables` | internalMutation | CLI only | whole tables |

- **No public function accepts `isAdmin`, a user id, `source`, `submitterName` or
  `submitterEmail` from a captain / admin caller.** The only writer of
  submitter identity is the public form, which is today's trust level: anyone
  can type any name/email there.
- A captain can't read or write another order's items. Every mutation
  resolves `orderId` from the stored item or checks ownership of the passed
  `orderId`. Tests: a foreign captain gets rejected on each mutation.
- Editing a player's item changes what that player later sees in "your
  responses". Intended (decision 2, Q3 = no notification).
- Existing risk, unchanged: `submitOrder` has no rate limit. It's out of scope
  and noted for phase 2 / launch.

## Issues

Stacked branches, one Gate 2 for the lot, as with F-01..F-03. Each issue
leaves `verify` green and the app coherent, but **don't merge a prefix of
the stack on its own**: L-02..L-05 run on today's lock rule until L-06.

| Id | Title | Blocked by | Size | Changes if JCC answers otherwise |
|---|---|---|---|---|
| L-01 | Order items: table, captain API, read model, backfill | none | M (~11 files) | none |
| L-02 | Switch every reader and the order form onto order items | L-01 | L (~20) | Q7 (one line) |
| L-03 | The order list on the order page: add, edit, remove + Undo | L-02 | L (~18) | Q8 (strings) |
| L-04 | Paste a list with sizes; removal warning covers form-less orders | L-03 | S–M (~8) | none |
| L-05 | Order form card, captain wording, no raw errors | L-04 | M (~16, mostly copy) | Q4, Q6, Q1 = C (copy) |
| L-06 | List locks when confirmed; admin edits the same list; retire the old tables | L-05 | L (~18) | **Q1, Q2, Q5** |
| L-07 | Rename `jerseyRuns` → `orderForms` in code and data (Q4 = B), no behaviour change | L-06 | L (~50, mechanical) | none |

`app/portal/orders/[id]/page.tsx` is touched by L-02..L-05 (a hotspot), which
is why the chain is linear and not a fan-out. L-03 splits the page into
section components so L-04/L-05 edit those, not the page. If L-06 runs past
~20 files, its legacy-table retirement (no behaviour) moves to an L-06b with
no other change.

L-07 is last (PM decision P5): L-06 has already deleted the legacy tables and
`lockSnapshot`, so the rename touches fewer files and L-01..L-06 stay valid
as written with today's names. It's over the ~20-file guideline because it's
one mechanical rename. Splitting it would leave the schema and the code
disagreeing between issues. Its fallback split is at its commit 3 (lib and
component file names).

Rough cost: 4 L × ~$5 + 2 M × ~$3 + 1 S × ~$1.5 ≈ $27 of Claude runs
(L-07 ≈ $5 of that; precedent: a ~120-file mechanical refactor cost ~$3.5).

## Trace: UX §7 rules and §8 criteria → issues

| UX | Requirement (short) | Issue(s) |
|---|---|---|
| §7.1 | item = design, name?, number?, C/A?, size or none, qty ≥ 1, who added, answers | L-01 |
| §7.2 | captain adds / edits every field / removes any item until locked | L-01 (API), L-03 (UI) |
| §7.3 | items before any order form; deadline asked only at "Make an order form" | L-01 (parent = order), L-03, L-05 |
| §7.4 | remove whole item, no "remove those first"; Undo exact | L-01 (soft delete), L-03 |
| §7.5 | Needs size shown and counted apart from the total | L-01 (`summarize`), L-03 |
| §7.6 | fixed-names mode works; collision flag as today; no silent duplicate | L-02 |
| §7.7 | paste takes optional size column; bad size → Needs size, named in preview | L-01 (`addMany` size), L-04 |
| §7.8 | admin sees the same list, edits when locked | L-01 (`requireListWriter`), L-06 (admin page, new lock) |
| §7.9 | chips, total, CSV, admin read one list | L-01, L-02, L-03 |
| §7.10 | player-facing form unchanged | L-02 (regression suite) |
| §8.1 | 375×812: list heading visible without scrolling | L-03 |
| §8.2 | 375: nothing scrolls sideways | L-03, L-04, L-05 |
| §8.3 | add "Sidestep #72, M, ×1" in ≤ 4 taps + typing, on the order page | L-03 |
| §8.4 | change a player's item size; chips + footer update without refresh | L-03 |
| §8.5 | remove sized item → "Removed … Undo" → exact restore | L-01, L-03 |
| §8.6 | no form: `+ Add item` and `Paste a list` work; no deadline prompt until "Make an order form" | L-03, L-04, L-05 |
| §8.7 | no-size item shows Needs size; design + footer say how many | L-03 |
| §8.8 | paste with size column; bad size → Needs size, named in preview | L-04 |
| §8.9 | locked: no add/edit/remove control on captain page; Download CSV works | L-03 (today's rule), L-06 (confirmed rule) |
| §8.10 | no `CONVEX` / `ConvexError` / request id / path in customer messages | L-01 (helper), L-02 (public form), L-03, L-04, L-05 (sweep + guard test) |
| §8.11 | keyboard, focus ring, labelled row menus, tap targets ≥ 40px | L-03, L-04 |
| §8.12 | reduced motion: sheet and toast without animation | L-03 |
| §8.13 | no "roster", "slot", "jersey run", "collected", "responses" in captain copy | L-03 (new components), L-05 (sweep) |

## If JCC answers differently at Gate 1

| Question | Recommended (designed) | If otherwise |
|---|---|---|
| Q1 lock | A: confirmed stage locks; deadline closes the form only | **B** "Send my list": L-06 adds `orders.listSentAt`, captain `orderItems.sendList` (runs `listProblems` per Q2) and admin reopen; `isListLocked` = `listSentAt` set; `lockSnapshot` still retires. **C** deadline locks everything: L-06 keeps `lib/jerseyRun/lock.ts` as is, `isListLocked` = run locked, drops the confirm gate; L-05's form-card copy says the deadline locks the list. Only L-06 (+ L-05 copy for C) changes. |
| Q2 confirm with Needs size | A: reject, naming the items | B: L-06 drops the gate; `listProblems` shows as a warning on the admin page instead |
| Q3 notify player | A: no | B: new issue after L-06 (Resend email on captain edit/remove of a `fan` item; S–M) |
| Q4 terminology | A: captain copy only (**JCC chose B**, see below) | **B** code rename: `orderItems` is already neutral, so only `jerseyRuns` → `orderForms` (table, API paths, ~55 files mention it, mechanical; public `/run/[id]` URLs kept). New L-07 after L-06, M–L, ~$5. C: L-05 drops its wording sweep |
| Q5 contact route | "Email us" | L-06 locked-note copy only |
| Q6 Responses page (new) | A: retire | L-05 section 3 becomes rename + relink |
| Q7 fixed-mode repeat flag (new) | A: open mode only, as today | B: one condition in `summarize` (L-02) |
| Q8 what "items" counts (new) | A: rule 5, sized only | B: L-03 display strings only |

## JCC decisions (Gate 1, approved 2026-10-01)

Full record: `~/sidestep/docs/gates/0004-gate1.md` → "JCC decisions".

- **Q1 = A, Q2 = A, Q3 = A** as designed: the list locks when "Order Size
  Confirmed" is checked and the deadline only closes the form (L-06). It can't
  be confirmed while any item needs a size (L-06). No email to players when
  the captain edits their item.
- **Q4 = B: rename the code too.** Captain copy changes in L-05 as designed.
  The code rename is a new issue, **L-07**
  (`backlog/L-07-rename-jersey-runs-to-order-forms.md`), after L-06.
  `jerseyRuns` → `orderForms` everywhere: table, `Id<>`, API paths,
  `jerseyRunId`/`runId` → `orderFormId`, libs, components, tests. Public URLs
  (`/run/[id]`, `/admin/jersey-runs`) and all user-visible copy stay. Dev
  data moves with an internal copy-and-repoint migration. Convex can't rename
  a table or keep `_id`s, so form ids change. That's harmless on dev with no
  production, and it's the reason to rename before launch.
- **Q5 = A: "Email us" is `mailto:info@sidestep.design`** (L-06 locked note,
  UX §4).
- **Q6 = A: retire the Responses page.** L-05 deletes the route; links and the
  closure email go to the order page.
- **Q7 = A, plus a rule: repeats are allowed.** Fixed mode never flags, as
  today. JCC added that the list must take:
  - **same name, different number** as two separate players (shared last
    names). `rosterSlotKey` already includes the number, so these never match,
    fill each other, collide or dedupe. L-02 and L-04 pin it with tests.
  - **the same name + number more than once** as more than one item (one player
    ordering two jerseys). `add` and `addMany` already don't dedupe. **Paste
    changes (L-04):** a row that matches an existing item, or one repeated
    earlier in the paste, is no longer skipped. It is added, and the preview
    says so (`Jordan Lee #4 is already on the list — adds another.`) so an
    accidental double paste is visible before Confirm. The open-mode collision
    flag (two *different* emails, same name + number) stays: it's a warning on
    the row, never a block.
  - `copyToDesign` keeps its dedupe against the target design. It means "make
    sure these players are on that kit too", and running it twice must not
    double the list.
- **Q8 = A: only sized items count.** Design line `3 items · 1 needs a size`,
  footer `6 items`; the item count always equals the size chips, the order
  total, admin count and CSV. As designed (rule 5); the mockup's "4 items" /
  "7 items" are superseded.

## New questions for JCC (answered at Gate 1, kept for the record)

- **Q6. The Responses page** (`/portal/orders/[id]/run/responses`: by-design /
  by-player / by-submitter tables, estimated price). After L-03 the order list
  shows everything it does, and its name is on UX's retired-words list.
  A: **retire it** (L-05 deletes the route, links and closure email go to the
  order page; the admin run page keeps its table). *Recommended*: one list,
  one place. B: keep it read-only, renamed "Who sent what". C: keep as is.
- **Q7. Fixed-names mode, a second pick of the same name.** Today it isn't
  flagged (fixed mode expects shared names). In the new list it shows as a
  second row with "Added by …". A: **keep today's rule** (flag only in
  open mode). *Recommended*: matches rule 6 literally, and the second row is
  visible anyway. B: flag it in fixed mode too (one line in `summarize`, L-02).
- **Q8. What "items" counts on the list.** Rule 5 says a Needs-size item
  doesn't count toward the item total. The mockup's design line and footer
  count it ("4 items · 1 needs a size", "7 items" over chips that sum to 6).
  A: **follow rule 5**: `3 items · 1 needs a size`, footer `6 items`, which
  matches the size chips, the header total and what we make. *Recommended*.
  B: follow the mockup: "items" = rows on the list, and "needs a size" is a
  subset. Either way the production total (header, admin, CSV) counts sized
  items only. Changes only L-03's display strings.

## Risks and what to test

| Risk | Mitigation / test |
|---|---|
| A reader forgets `removedAt` | Only `loadItems` reads `by_order`; per-reader "removed item excluded" tests (L-02) |
| Migration miscounts | Unit test with fixture: slot + 2 entries, empty slot, blank line, removed-design entry → 5 items with exact fields; rerun no-op. L-02 records dev before/after `itemCount` = old `countsByRun.total` per order |
| Public form regresses (rule 10) | `JerseyRunPublicForm.test.tsx` and `submitOrder.test.ts` kept, with only the id rename; fill-vs-insert cases added (both modes, two sizes on one pick, a race where the captain sized the row first) |
| Captain forges player identity | No captain / admin mutation accepts submitter fields; test that `update` ignores / rejects them |
| Lock drift between UI and server | `canEdit` / `locked` come from the server; tests for admin-edits-when-locked, captain-rejected-when-locked, form rejects when locked |
| Stacked branch half-merged | Gate 2 merges L-01..L-06 together (PM packet says so) |
| Legacy `XXL` sizes on old runs | Captain `update` accepts the item's current size; `sortSizes` already slots `XXL` |
| Mockup "7 items" vs rule 5 | Q8 at Gate 1; designed for rule 5; L-03 display strings only |
| `page.tsx` merge churn | Linear chain; L-03 extracts section components |
| Reduced motion for sonner toast | sonner has its own CSS transitions: L-03 checks with `scripts/check-reduced-motion.mjs` or a targeted CSS rule, verified by SDET |

## Out of scope (phase 1)

Hats / non-jersey items (0006: `designId` + one size catalog would need to
change). Factory format and validation rules (phase 2, see the seam above).
Pricing on the list. Player notifications (Q3). Rate limiting the public form.
