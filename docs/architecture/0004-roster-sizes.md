# 0004 Roster sizes: a roster entry owns its order items (architecture)

Card: `[0004] Technical design + issues: roster entry with several sizes` (t_2d8206d7);
amended for Gate 1b by t_91203601.
Register: `~/sidestep/initiatives/0004-roster-collection/initiative.md` (phase 1b)
UX spec: `docs/ux/0004-roster-sizes.md` (§12 behaviour rules = requirements, §13 = acceptance).
Parts of it are superseded by Gate 1b; see "Superseded in the UX doc" below.
Concept talk + JCC answers: `~/sidestep/docs/gates/0004-concept-roster-vs-items.md`
Gate 1b decisions: `~/sidestep/docs/gates/0004-gate1b.md` → `## JCC decisions`
Builds on: `docs/architecture/0004-order-items.md` (phase 1, L-01..L-07, on main)
Issues: `backlog/R2-01-…` … `R2-05-…`. Parked: `backlog/parked/R2-06-…`.

## Decision

**Bring back a `rosterEntries` table, keyed by order + design, and hang
`orderItems` off it. An item becomes a size line: entry, size (required), qty,
submitter.** The printed values (name, number, letter) move from the item to
the entry. "Needs sizes" stops being an item with no size and becomes an entry
with no live items. Both tables are parented on the **order**, never on the
order form, and an entry is removed with a soft delete of the entry alone.
That is what keeps the two phase-1 bugs (raw error on remove, "can't add
before a run") from coming back.

Printed fields stay **name + number (+ the C/A letter)** for every design, as
today (Gate 1b Q3 = C). Per-design printed fields (front number, labels, CSV
headers) are parked as `backlog/parked/R2-06-…`; "How it slots in later" below
shows why nothing built now has to be migrated for it.

```
PHASE 1 (main today)                       PHASE 1b (this design)
────────────────────                       ──────────────────────
order                                      order
  └─0..N orderItem                           └─0..N rosterEntry   ("player" on screen, Q1)
       design, name?, number?, C/A?,              design, name?, number?, C/A?,
       size? ("Needs size"), qty,                 source, removedAt?
       submitter?, answers?, removedAt?             └─0..N orderItem   (a size line)
                                                         orderId (denormalised), size, qty,
"Sidestep #72" in S, M×3, XL                             submitter?, answers?, orderFormId?, removedAt?
 = 3 unrelated rows
                                           "Sidestep #72" = 1 entry, 3 items. Needs sizes = 0 live items.
```

Analogy: phase 1 made the line item the aggregate root. JCC's model is
order → roster entry → line items, like an invoice whose line items share one
customer reference. The entry is the identity ("what gets printed") and the
items are the quantities ("what gets cut"), each remembering who asked for it.

## Options considered

| | (A) `rosterEntries` + `orderItems` as size lines ✅ | (B) One table: an entry doc with an embedded `sizes[]` array | (C) Keep flat `orderItems`, group rows by name + number at read time |
|---|---|---|---|
| A player exists on its own | yes | yes | no, it's inferred: a typo splits the group |
| Rename / letter change | patch 1 entry | patch 1 doc | patch N rows |
| "Needs sizes" | entry with 0 items | empty array | a sizeless placeholder row (today's shape) |
| Remove + exact Undo | soft delete the entry; items untouched | soft delete the doc | soft delete N rows, restore N |
| "My jerseys" by email (`listMyResponses`) | `orderItems.by_submitterEmail`, as today | no index into array elements: table scan or a second lookup table | as today |
| Per-line submitter + answers | one row each, as today | nested objects in an array; every form submission rewrites the whole player doc (OCC contention when a team submits at once) | as today |
| Public form "fill vs insert" logic | goes away: an item is always inserted under an entry | goes away | stays |
| Migration | group existing rows into entries, link the items, strip moved fields | rewrite every row into a new shape | none |

**Why not (C).** It's the cheapest and changes nothing in the model, but it's
the shape JCC rejected at Gate 2. The "player" is a guess that one typo
breaks, a rename touches N rows, and "needs sizes" stays a fake row. UX §4
rejected it for the same reasons.

**Why not (B).** It's the closest to "one thing", but it fights Convex. You
can't index into array elements, so `listMyResponses` loses its index. Every
public-form submission rewrites the whole player document, so ten players
submitting at once all contend on the same docs. Per-line submitter, answers
and `orderFormId` become nested objects with no validators of their own. (A)
keeps every item-level fact exactly where phase 1 already put it, which is
also what Q5 needs: "we do not lose order items from a person".

**How (A) avoids the phase-1 bugs** that the R-01 two-table split had
(`0004-order-items.md`, "Why not (B)"):

| R-01 bug | Cause | Why it can't recur here |
|---|---|---|
| Remove showed a raw `ConvexError` ("remove those first") | removing a slot with entries threw | Remove patches `removedAt` on the entry, nothing else. It never inspects or deletes children: `loadRoster` hides items whose entry is removed. No error path exists. Messages still go through `userMessage`. |
| Couldn't add anything before an order form existed | slots and entries were parented on the run | Both tables carry `orderId`. `orderFormId` on an item stays provenance only, never scope. |
| Edit "the size of this item" was ambiguous with 2 entries on a slot | the item wasn't a thing the DB knew | The sheet edits **sizes of a player** as deltas per size (below), which is defined for any number of lines. |
| Undo recreated rows under new ids | hard delete + reinsert | Soft delete of one entry: same ids, same items, same submitters, by construction. |

## Data model (R2-01 widens, R2-03 narrows)

```ts
// NEW
rosterEntries: defineTable({
  orderId: v.id("orders"),
  designId: v.id("designs"),            // never changes; moving = remove + add, as today
  name: v.optional(v.string()),         // name on back            (≤ 80)
  number: v.optional(v.string()),       // number on back, text    (≤ 8)
  designation: v.optional(v.union(v.literal("C"), v.literal("A"))),
  source: v.union(v.literal("captain"), v.literal("fan")), // who created the entry
  removedAt: v.optional(v.number()),    // soft delete; restore clears it
  createdAt: v.number(),
  updatedAt: v.number(),
  updatedBy: v.optional(v.id("users")),
}).index("by_order", ["orderId"]),

// CHANGED (final shape after R2-03)
orderItems: defineTable({
  orderId: v.id("orders"),              // denormalised from the entry (immutable): one by_order read
  rosterEntryId: v.id("rosterEntries"),
  size: v.string(),                     // required now
  qty: v.number(),                      // 1..MAX_QTY
  source, submitterName?, submitterEmail?, customAnswers?, orderFormId?,  // unchanged
  removedAt?, createdAt, updatedAt, updatedBy?,                           // unchanged
})
  .index("by_order", ["orderId"])
  .index("by_entry", ["rosterEntryId"])
  .index("by_submitterEmail", ["submitterEmail"]),
  // removed: designId, name, number, designation (they live on the entry)

// designs: unchanged in 0004 phase 1b (no printedFields; parked R2-06)
```

Why these and not the alternatives:

- **Printed values are fixed columns on the entry, not a
  `values: record<fieldId, string>`.** Today there are two text fields and a
  letter, and JCC is the only one who would add a placement. Fixed columns
  give typed validators, a plain CSV and a plain match key. A generic map
  would make every reader, the paste parser and the export generic in
  exchange for a flexibility nobody has asked for. Adding a placement later
  is one optional column (see "How it slots in later").
- **No `frontNumber` / `printedFields` now (Gate 1b Q3 = C).** Both would be
  `v.optional`, and adding an optional field to a Convex table needs no
  migration: existing docs are simply missing it. Shipping them now would put
  dead args on `add` / `update` / `addMany` / `submitOrder` and dead data in
  `getPublic`, all of which need tests, for zero cost saved later.
- **`orderId` is denormalised onto items.** It's immutable on both rows, so it
  can't drift, and it keeps `loadRoster` at two index reads per order with no
  N+1 join. `designId` is **not** denormalised: readers get it from the entry
  in memory.
- **Items keep `removedAt`.** Lowering a size to 0 soft-removes the line (same
  audit trail as phase 1, `updatedBy`), and the migration never hard-deletes a
  sized row.
- **No new index for uniqueness.** Convex mutations are serialisable, and the
  `by_order` range read conflicts with a concurrent insert into the same
  order, so check-then-insert inside one mutation is race-free. An order has
  dozens of entries, so an in-memory filter is fine.

### Invariants (pinned by tests)

1. **One live entry per (order, design, player key).** `playerKey(values)`
   takes the entry's printed text values as an object (`{name, number}`),
   trims each, collapses inner whitespace, lowercases, and joins them. The
   letter is excluded (UX §6). It replaces `rosterSlotKey` and the paste
   parser's private `repeatKey`, so there's one normalisation. The all-blank
   key is `""`, so "one `Blank jerseys` row per design" falls out of the same
   rule (Q4: a blank entry exists only when someone explicitly adds blank
   jerseys).
2. Every write that names a player (add, paste, public form, rename, restore)
   goes through **one** server helper, `resolveEntry(ctx, order, designId,
   values)` in `convex/_orderItems.ts`. It returns the live entry with that
   key or inserts one. That's UX rule 4 (and Gate 1b Q4) in one place.
3. An item's size is always set. "Needs sizes" = a **named** entry with no live
   items. A blank entry with no live items is removed on the write that empties
   it (it would otherwise be an empty "Blank jerseys" row).
4. **Only `convex/_orderItems.ts` reads either table by `by_order`** (via
   `loadRoster`), which drops removed entries, removed items, and items under
   a removed entry. The two other index reads (`by_entry` inside the helpers,
   `by_submitterEmail` in `listMyResponses`) filter both explicitly.
5. **Every item keeps its own submitter** (`source`, `submitterName`,
   `submitterEmail`, `customAnswers`, `orderFormId`). No write rewrites them:
   a match inserts new items, a merge moves items by `rosterEntryId` only.
   That is Gate 1b Q5's "we do not lose order items from a person".

## Writes: captain / admin API (`convex/rosterEntries.ts`, new)

All go through the existing `requireListWriter(ctx, orderId)`: admin always,
captain only on their own order while unlocked. `orderId` is resolved from
the stored entry for every by-id mutation. **No arg carries `isAdmin`, a user
id, `source`, `submitter*` or `customAnswers`.** Validators are strict.

| Function | Args | Behaviour |
|---|---|---|
| `add` | `orderId, designId, name?, number?, designation?, sizes: {size, qty}[]` | `resolveEntry` → insert one **captain** item per size. If the key matched, the sizes are added to that player and the letter, if given, is set on it. Returns `{entryId, matched}`. Rejects nothing typed + no sizes. |
| `update` | `entryId, name?, number?, designation?, sizeDeltas: {size, delta}[], merge?: boolean` | Full replace of the printed values (an omitted optional clears it, as phase 1). **Sizes change by delta, not by total**: +n inserts a captain item; −n takes qty from the player's live items for that size, **newest `createdAt` first** (UX §5), soft-removing a line that reaches 0, and clamps at 0. Deltas mean a fan's jersey that lands while the sheet is open is never silently overwritten (a "desired totals" API would drop it). If the new key matches another live entry: without `merge` it throws `"<Label> is already on <Design>."`. With `merge` it moves this entry's live items to that entry (`patch rosterEntryId`), applies the letter there, and soft-removes this entry. |
| `remove` | `entryId` | Soft delete of the entry only. No-op if already removed. Never throws on children. |
| `restore` | `entryId` | Clears `removedAt`. If a live entry now holds the same key (re-added within the Undo window), it **merges into it** (same helper as rename-merge) instead of breaking invariant 1. |
| `addMany` | `orderId, designId, players: {name?, number?, sizes: {size, qty}[]}[]` (≤ `ROSTER_PASTE_MAX_ROWS`) | Paste. All-or-nothing validation, then `resolveEntry` per player, so a match adds sizes to the existing player (UX §7). Returns `{added, updated, jerseys}`. |
| `copyToDesign` | `orderId, sourceDesignId, targetDesignId` | Copies live entries (values + letter, **no items**) to the target, deduped by key (`planRosterCopy`). Unchanged semantics. |

Size rule: a size must be in `SIZE_OPTIONS`, or already exist on that player
(so a legacy `XXL` survives an edit). `qty` goes through `checkQty`, and a
player's total per size is ≤ `MAX_QTY`. `convex/orderItems.ts` keeps only the
reads `listForOrder` and `affectedByDesignRemoval`. Its flat mutations are
deleted in R2-02, when the last caller moves to `rosterEntries.*`.

## Write: the public form (`orderEntries.submitOrder`)

The args keep their shape, one line per (design, player, size, qty), with one
rename: `itemId` → `rosterEntryId`. Per line: **fixed mode**: the picked
entry must be live, on this order and design, and not blank. **Open mode**:
`resolveEntry` on the typed values. Then **insert** a `fan` item with size,
qty, submitter, answers and `orderFormId`. Lines of one card share a key, so
they land on one entry with no client grouping needed (a mutation reads its
own writes).

The phase-1 **fill-before-insert logic is deleted.** A captain-seeded
"Needs sizes" player gets sizes by having items added under it, which is the
same thing without the "fillable" special case. The gate is unchanged: form
open and `!isListLocked(order)`. The public path can only insert `fan` items.
It never changes or removes an existing item or entry, and never sets a
letter.

**Same print from two emails (Gate 1b Q5 = A without the flag).** Two
different people who type the same name + number on one design join **one**
player, silently. There is no collision flag, stored or derived, and
`submitOrder` no longer returns `collisions`. What makes this safe is
invariant 5: each person's size lines keep their own submitter, so the row
says `Added by Pat and Sam` and the edit sheet's "Sizes added by" lists each
person's lines. Nothing is lost and the captain can still split them by hand.

Retiring the phase-1 flag (it ships today at `lib/orderItem/summary.ts:173`
`collidingIds`, `components/orderList/ItemRow.tsx:90`,
`convex/orderEntries.ts:186-205`):

| Issue | Removes |
|---|---|
| R2-01 | Never adds one: `summarizeRoster` / `PlayerView` have no collision field. `ItemView.collision` becomes optional so the new read model can omit it while the old `summarize` still sets it. |
| R2-02 | The visible flag and the API: `ItemRow.tsx` is replaced by `PlayerRow.tsx` (no flag), and `submitOrder` drops the post-write `summarize` pass and the `collision` / `collisions` fields from its return. The collision tests in `convex/submitOrder.test.ts` become "joins one player, both submitters' lines kept". |
| R2-03 | The dead code: `collidingIds`, `ItemView.collision`, and `collision: false` in test fixtures (deleted with the old `summarize`). |

`orderForms.getPublic` picker: the design's live **named** entries,
`{_id, name, number}` only. That's the same exposure as today, and the dedupe
goes away because entries are already unique.

## Reads: one read model, two views

```
loadRoster(ctx, orderId) ─► { entries, items }   (live only; the only by_order reader)
   └─► summarizeRoster(entries, items, { designIds, titles })   pure, lib/orderItem/summary.ts (replaces summarize in R2-03;
                                                                 no namesMode: phase 1 only needed it for the collision flag)
         designs[]: { designId, title,
                      players: PlayerView[]   ← the list rows (sizes aggregated, lines for "Added by" / "Sizes added by")
                      items:   ItemView[]     ← flattened size lines with the player's values: CSV, admin export, listOrderEntries
                      summary: { jerseyCount, playerCount, needsSizes, bySize } }
         summary (order total, linked designs only) · removedDesigns[]
   ┌───────────────┬─────────────────┬──────────────────┬───────────────────┬────────────────┐
 listForOrder   admin.getOrder    admin.exportOrder  orderForms._closeForm  confirmBlocker
 (rows, chips,   (counts)          (supplier CSV)     (closure email)       (admin gate)
  footer, CSV)
```

- **`items` keeps phase 1's `ItemView` shape**, with `size` now required,
  `rosterEntryId` added and `collision` gone (above). `admin.ts`,
  `listOrderEntries`, `_closeForm` and `lib/rosterExport.ts` keep reading
  `designs[].items` and barely change. That is deliberate: it's what keeps
  R2-03 inside one run. Each jersey row is still one line in the CSV.
- **`PlayerView`**: `{ entryId, designId, name?, number?, designation?,
  source, createdAt, sizes: {size, qty}[] (sortSizes), jerseyCount,
  needsSizes, lines: { itemId, size, qty, source, submitterName?,
  submitterEmail?, customAnswers, createdAt }[] }`. `lines` is what "Added by"
  and "Sizes added by" render; it is never collapsed across submitters.
- Counts (UX rule 6, Q2 "jerseys"): `jerseyCount` = Σ qty of live items on
  linked designs. `playerCount` = live entries with a non-blank value.
  `needsSizes` = named entries with no live items (a count of players, no
  longer a Σ qty). One summary feeds rows, chips, footer, the admin gate and
  the CSV, as in phase 1.
- Display order: players by entry `createdAt`, the blank entry last. Chips use
  `sortSizes`.

### Effect on each surface

| Surface | Change |
|---|---|
| **Lock** | None. `isListLocked` (the "Order Size Confirmed" stage) and `requireListWriter` guard every new mutation exactly as they guard phase 1's. `listForOrder.canEdit` is unchanged. Admin bypass is unchanged. |
| **Confirm gate** | `listProblems` moves from items to players. Message: `2 players need sizes: Jordan Lee #4, Mo #88` (admin copy). |
| **Paste** | The parser groups rows by `playerKey` into players with sizes. An optional 4th "how many" column is allowed. A row matching an existing player gets a note, not a skip. `addMany` sends players. Unknown size → that row adds no line, plus a note (UX §7). |
| **CSV (captain)** | Still one row per jersey, expanded by qty, with today's headers. Sort by name keeps a player's rows together (already the case). |
| **Admin export** | Unchanged rows and columns (`designs[].items`). |
| **Admin nav** | Label `Jersey Runs` → `Order forms` in `components/layout/AdminShell.tsx`; the URL `/admin/jersey-runs` is kept (Gate 1b P3/G6, rides in R2-02). |
| **Breakdown** (`lib/jerseyBreakdown.ts`) | `jerseyLabel` is kept. `itemLabel` becomes `playerLabel(entry)` (name + number, as today). |
| **Copy from design** | Unchanged semantics: copies players without sizes. |
| **`listMyResponses`** | Items by `submitterEmail` (index unchanged), joined to their entry for name, number and design. Skips a removed item or removed entry. |

## Migration of existing `orderItems` rows

Same widen → migrate → narrow pattern as L-07. Dev only (no production
deployment). The record of each run goes into the function's doc comment.

**R2-01 (widen + group).** The schema adds `rosterEntries` and
`orderItems.rosterEntryId` (optional, plus `by_entry`).
`_migrations:groupOrderItemsIntoRosterEntries`, internal, idempotent (skips
items that already have `rosterEntryId`):

| Phase-1 rows sharing order + design + `playerKey({name, number})` | → |
|---|---|
| the group | **one entry**. name/number spelled as the oldest row has them, letter = first non-empty by `createdAt`, source = oldest row's, `createdAt` = min, `updatedAt` / `updatedBy` = latest. `removedAt` = max of the rows' only if **every** row is removed, otherwise live |
| each **sized** row | gets `rosterEntryId`. Keeps its own size, qty, source, submitter, answers, `orderFormId`, `createdAt`, `removedAt` |
| each **sizeless** row | gets `rosterEntryId` too (deleted in R2-03; its name/number/letter already live on the entry) |
| a blank group (no name, no number) with no sized live row | the entry is created removed (an empty "Blank jerseys" row has no meaning) |

It returns `{entries, itemsLinked, sizelessRows, sizelessQtyOver1: [{orderId,
label, qty}], letterConflicts}`. Old readers don't look at `rosterEntryId`,
so the captain's list is unchanged after R2-01.

**Mirror window (R2-01 → R2-03).** While the schema is widened, an item may
carry both `rosterEntryId` and the flat `designId / name / number /
designation`. The new writers (the `rosterEntries.*` API in R2-01, the switched
form and list in R2-02) write both: every new item copies its entry's values.
One helper, `mirrorEntryOntoItems(ctx, entry)`, re-copies them after a rename
or letter change. The readers that R2-03 switches (admin, exports, closure
email, "my jerseys") therefore keep seeing correct names. R2-03 deletes the
helper with the flat fields. Only sized items are written in the window. The
legacy sizeless rows are invisible to the new list, which counts "needs
sizes" from entries, and the R2-03 strip deletes them.

**R2-03 (re-run + strip + narrow).** Re-run the group migration to catch rows
written since. Then `_migrations:stripFlatItemFields` deletes the sizeless
rows and unsets `designId`, `name`, `number` and `designation` on every item.
Then narrow the schema.

**What "no loss" means, exactly.** Every sized jersey keeps its id, size, qty,
submitter, answers and timestamps. Every name, number and letter lands on an
entry. The one fact the new model can't hold is **qty on a sizeless row**
(today a captain can enter "Jordan Lee ×3, Needs size"; a player with no sizes
has no count). Gate 1b Q6 = A: the count is dropped and the migration returns
each such row, by label, so it can be re-entered by hand. The dev fixtures
only seed qty 1 on sizeless rows (`_devSeed.ts`), so the expected count is 0.
Conflicting letters within one group (C on one row, A on another) keep the
oldest and are counted.

## How it slots in later: printed fields per design (parked R2-06)

JCC (Gate 1b Q3): "easy to extend to, BUT it is not something we will do
now". Nothing in R2-01..R2-05 has to be migrated to add it:

```
designs.printedFields?: ("nameBack"|"numberBack"|"numberFront"|"letter")[]   absent = today's name, number, letter
rosterEntries.frontNumber?: string                                            absent = same as the back number
playerKey({ name, number, frontNumber? })   front joins the key only when set AND ≠ number
```

- Both fields are `v.optional`, so existing docs are valid unchanged.
- `playerKey` already takes an object. Treating an absent front number as
  "same as the back" means every key computed before R2-06 is still the same
  key after it, so invariant 1 holds across the change with no re-key pass.
- The args that grow an optional `frontNumber`: `rosterEntries.add / update /
  addMany`, `submitOrder` lines. `getPublic` gains `printedFields` per design.
  `summarizeRoster` gains a `fieldsByDesign` option; the CSV headers follow it.
- Q7 (turning a field off can make two players identical) comes back with it
  and has to be decided then.

Full sketch: `backlog/parked/R2-06-printed-fields-per-design.md`.

## Phase 2 hook: where the rules live

```
lib/orderItem/checks.ts
  ROSTER_RULES: (player, design ctx { players }) => Problem[]          ← about the person / the print
      needsSizes                          (ships in R2-03, used by the confirm gate)
      numberUniqueInDesign   (phase 2)    the numbers on one kit can't repeat
      requiredFieldsFilled   (phase 2)    e.g. this design prints names, so a name is required
  ITEM_RULES:   (line, { player, design }) => Problem | null              ← about the garment
      sizeInGarmentRange     (phase 2)    the size exists for this cut
  ORDER_RULES:  (summary, order) => Problem[]
      countMatchesEstimate   (phase 2)    jerseyCount vs orders.estimatedQuantity
listProblems(summary) runs all three and returns Problem[]; confirmBlocker and the admin page read it.
```

"Number unique" belongs on the **roster** side, and its scope is the
**design**, not the order: a player on Home and Away legitimately wears #72
on both. Phase 2 confirms that with JCC. "Size in range" and "count = qty" are
item and order rules. None of them needs a schema change.

## Functions and auth (security review)

| Function | Kind | Who | Reads / writes |
|---|---|---|---|
| `rosterEntries.add / update / remove / restore / addMany / copyToDesign` | mutation | `requireListWriter`: admin always; captain on their own order, unlocked only | entries + items on that order. `designId` must be in `order.designIds` (add, addMany, copy). By-id calls resolve the order from the stored entry. `update` never changes `designId`, `source`, submitters or answers, and never touches another order's entry, even on merge (the target is looked up within the same order + design) |
| `orderItems.listForOrder` | query | captain of the order or admin; null signed out; throws otherwise | unchanged exposure: players, their lines incl. submitter email + answers (the captain sees these today) |
| `orderItems.affectedByDesignRemoval` | query | captain or admin | unchanged |
| `orderEntries.submitOrder` | mutation, **public** | anyone with the link | inserts `fan` items, and entries via `resolveEntry`, on that form's order only. It can't edit or remove, can't set a letter, and is gated on form open + list unlocked. Re-validates everything. Returns only its own submission's ids (no read-back of other people's lines) |
| `orderForms.getPublic` | query, **public** | anyone with the link | named entries `{_id, name, number}`. No emails, sizes or answers (unchanged) |
| `orderForms.listMyResponses` | query | signed-in user | their own items by normalised email, joined to entries; removed excluded |
| `_migrations.groupOrderItemsIntoRosterEntries`, `…stripFlatItemFields` | internalMutation | CLI only | whole tables |

Spoofing check: a captain can't forge an order-form submission. The public
form sets the submitter's name and email (`source: "fan"`). A paste
(`addMany`, "Ordered by", R3-04) may set a name only, with `source:
"captain"` and never an email, answers or form id, so the sheet reads it as
"from a pasted list", never "through the order form". No other captain/admin
mutation accepts submitter fields, and merge *moves* items without rewriting
them. A fan can't attach to another order's player: `rosterEntryId` is checked
against the form's order and the line's design. A fan *can* add sizes to a
player someone else created by typing the same name + number: that is Gate
1b Q4/Q5 by design, and their lines are attributed to them, not to the
original submitter. Existing risk, unchanged: `submitOrder` has no rate limit.

## Issues

Stacked on one branch, with one Gate 2 for the lot, as with L-01..L-07.
**Don't merge a prefix.** R2-01..R2-02 run in the mirror window above. After
R2-03 the model is final, and R2-04..R2-05 are UX on top of it.

| Id | Title | Blocked by | Size |
|---|---|---|---|
| R2-01 | Roster entries: table, migration, player API, read model (server only, additive) | none | M (~10 files, ~$3.5) |
| R2-02 | The order list and the order form write players: one row, size chips, several sizes per sheet; admin nav label | R2-01 | L (~18, ~$5–6) |
| R2-03 | Retire the flat item fields and the phase-1 collision code: every reader goes through players; narrow the schema | R2-02 | M (~15, ~$3–3.5) |
| R2-04 | Paste a list grouped by player, with a "how many" column | R2-03 | S–M (~4, ~$2) |
| R2-05 | Public order form: several sizes on one jersey card | R2-04 | M (~5, ~$2.5) |
| ~~R2-06~~ | Parked: `backlog/parked/R2-06-printed-fields-per-design.md`. Not in this chain. | — | — |

The chain is linear because `components/run/PublicOrderForm.tsx` (1,048
lines) is touched by R2-02 (id rename, extracting `SizeCounter`) and R2-05,
and `components/orderList/*` by R2-02 and R2-04.
If R2-02 runs past ~20 files, the fallback split is to move the sheet's match
notice and "Merge and save" UI to an R2-02b; the server supports both from
R2-01. Rough total ≈ $16–18 of Claude runs (plan ~$22–24 with phase 1's 36%
overrun), plus SDET cards.

## Risks and what to test

| Risk | Mitigation / test |
|---|---|
| A duplicate player appears (invariant 1) | Every naming path goes through `resolveEntry`. Tests cover add, addMany, submitOrder (both modes), rename, and restore after a re-add. Each ends with exactly one live entry per key |
| A person's jerseys are lost or re-attributed when two people share a print (Q5) | Invariant 5. Test: two emails submit the same name + number → one entry, two items, each with its own `submitterEmail`; a later rename-merge keeps both |
| A reader forgets `removedAt` on either table | Only `loadRoster` reads `by_order`. Per-reader "removed entry hides its items" tests (listForOrder, listMyResponses, admin export, picker) |
| Lowering sizes drops the wrong jersey / a concurrent fan's jersey | Deltas, newest first, clamp at 0. Test: fan adds M while the captain's delta −1 is applied → the fan's line survives and the captain's newest goes |
| Migration miscounts | Unit fixture: 3 sized rows for one player (S, M×3, XL) + a sizeless twin + a removed row + a blank row + a different-number namesake → exact entries and links, then a no-op re-run. Dev before/after `jerseyCount` per order must be equal |
| Public form regresses | `submitOrder.test.ts` kept with the id rename. Fill-path and collision tests are replaced by "adds to the existing player" in both modes |
| `PublicOrderForm.tsx` / `orderList` churn | Linear chain. R2-05 extracts per-card size logic into `lib/orderEntry/` (the R-09 direction from the `.tsx` audit) instead of growing the component |

## Questions (decided at Gate 1b)

All answered by JCC on 2026-10-05; verbatim quotes in
`~/sidestep/docs/gates/0004-gate1b.md` → `## JCC decisions`.

| Q | Decided | Effect here |
|---|---|---|
| C0 | A player = one set of printed values on one design of one order; sizes hang off it | the model above |
| Q1 | "player" on screen; `rosterEntries` / `orderItems` in code | copy in R2-02..R2-05 |
| Q2 | Counts say "jerseys" | copy in R2-02..R2-05 |
| Q3 | C: park R2-06; name + number only for now, easy to extend later | no `printedFields` / `frontNumber`; R2-06 parked; "How it slots in later" |
| Q4 | Yes to all: roster belongs to one order (no team entity); explicit blank entry, one `Blank jerseys` row per design; a matching add / paste / form adds sizes to the existing player | invariants 1–2, unchanged |
| Q5 | A without the flag: join into one player, no warning; never lose a person's lines | no collision flag; invariant 5; retirement table above |
| Q6 | A: drop the count; the migration lists each sizeless qty > 1 row | R2-01 migration report |
| Q7 | Moot, parked with R2-06 | returns with R2-06 |
| P1/P2/P3 | One Gate 2 for R2-01..R2-05, no split; G5 dropped; G6 nav label rides in R2-02 | R2-02 |

## Superseded in the UX doc

`docs/ux/0004-roster-sizes.md` is not edited (UX owns it). Builders ignore
these parts; this design and the R2 issues win:

- §TL;DR bullet 3 and §6 (whole section, incl. the `[CONFIRM]` items and the
  "turning a field off" message): per-design printed fields, number on front.
  Parked with R2-06.
- §4 rule 5 (`Front #27` second line): parked.
- §7 last bullet before the help line ("Number on front … follows the back
  number in paste"): parked.
- §8 last bullet's second sentence (collision flag, `Sizes from 2 people.
  Check they're the same player.`): dropped by Q5. The join itself stays.
- §9 CSV bullet "Headers follow the design's fields": headers stay as today.
- §10/§11 `Same number on the front`, and the §11 "Design page" copy block:
  parked.
- §12 rule 1 (design has printed fields) and rule 8 (collision flag); rule 2
  reads "holds a name, a number and an optional letter".
- §13 the "Number on front" acceptance bullet: parked.
- §14 Q1–Q5 and §15's "Number on front mirrors the back" line: decided /
  parked.
- Mockup frame 8 (design page switches): parked.

## Out of scope

Reusing a roster across orders or seasons (Q4). Per-design printed fields
(parked R2-06). Hats and non-jersey products. Phase-2 validation rules (hook
above). Pricing. A rate limit on the public form.
