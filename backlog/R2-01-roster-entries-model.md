# Issue: Roster entries: table, migration, player API, read model (server only)

## Phase: 3

## Type: infrastructure

## Size: M (~10 files, ~$3.5)

## Description

Initiative 0004, phase 1b. JCC wants one player (a roster entry) to own
several sizes (order items). Design: `docs/architecture/0004-roster-sizes.md`
("Data model", "Writes", "Reads", "Migration"). UX rules:
`docs/ux/0004-roster-sizes.md` §12, minus what the design note lists under
"Superseded in the UX doc" (Gate 1b: name + number only, no collision flag).

This issue is **additive and server-only**. No screen changes, and the
existing `orderItems.*` functions and the public form keep working untouched.

1. **Schema (widen).** Add `rosterEntries` (fields and index as in the design
   note: name, number, designation, source, soft delete; nothing else). Add
   `orderItems.rosterEntryId: v.optional(v.id("rosterEntries"))` plus a
   `by_entry` index. Nothing is removed yet, and `designs` is not touched.
2. **`lib/rosterEntry/rules.ts`:** `playerKey({name, number})`: each value
   trimmed, inner whitespace collapsed, lowercased, joined; letter excluded;
   all-blank → `""`. It takes an object so a later field can join the key
   (parked R2-06). `rosterSlotKey(name, number)` becomes a thin wrapper over
   `playerKey` so existing callers agree with it.
3. **`convex/_orderItems.ts`:** `loadRoster(ctx, orderId)` → live entries plus
   live items whose entry is live and linked; it becomes the only `by_order`
   reader of both tables. `resolveEntry(ctx, order, designId, values)` (find
   the live entry by key or insert one). `mirrorEntryOntoItems(ctx, entry)`
   (the mirror window, see the design note).
4. **`convex/rosterEntries.ts` (new):** `add`, `update` (printed values +
   `sizeDeltas` + `merge`), `remove`, `restore`, `addMany`, `copyToDesign`,
   exactly as the design note's table. All go through `requireListWriter`.
   New items also get the flat `designId / name / number / designation`
   copied from their entry (mirror window).
5. **`lib/orderItem/summary.ts`:** `summarizeRoster(entries, items,
   {designIds, titles})` returning `designs[].players` (`PlayerView` as in the
   design note: sizes aggregated per size, plus every line with its own
   submitter for "Added by" / "Sizes added by"), `designs[].items` (flattened
   lines with the player's values, same `ItemView` shape plus `rosterEntryId`)
   and `summary {jerseyCount, playerCount, needsSizes, bySize}`. There is no
   collision field on `PlayerView` or on the new `items`: make
   `ItemView.collision` optional so the old `summarize` (kept until R2-03) can
   still set it.
6. **Migration** `_migrations:groupOrderItemsIntoRosterEntries` (internal,
   idempotent), mapping as in the design note, returning
   `{entries, itemsLinked, sizelessRows, sizelessQtyOver1, letterConflicts}`.
   Run it on dev, and paste the result into its doc comment.

## Done when
1. A captain opens an order seeded before this change and sees the same list, counts and CSV as before (no visible change).

## Logic
- `_migrations.groupOrderItemsIntoRosterEntries`: Sidestep #72 as S, M×3, XL plus a sizeless "sidestep  72" twin on one design become 1 entry with 4 linked items; "Lee #4" and "Lee #9" stay 2 entries; a group whose rows are all removed gives a removed entry; a sizeless row with qty 3 is reported in `sizelessQtyOver1`; a second run returns zero new entries. Internal only (not on `api`).
- `rosterEntries.add`: Sidestep #72 with S×1, M×3, XL×1 makes 1 entry + 3 items (Σ 5); adding " SIDESTEP " #72 with L adds an item to that entry and returns `matched: true`; a captain on someone else's order is rejected; a captain on a locked order is rejected while an admin succeeds.
- `rosterEntries.update`: `sizeDeltas` M −2 on a player whose M lines are captain×1 (older) and fan×2 (newer) leaves the captain's line untouched and the fan's at 0 (soft-removed); renaming onto an existing player throws without `merge` and with `merge: true` leaves one live entry holding both sets of lines with their submitters unchanged.
- `rosterEntries.remove` / `restore`: remove hides the entry and all its items from `loadRoster` without touching item rows; restore brings back the same item ids; restoring after the same player was re-added merges into one live entry.
- `rosterEntries.addMany`: two pasted players, one matching an existing entry, result in `{added: 1, updated: 1}` and still one entry per key; 201 players is rejected.
- `summarizeRoster`: jerseyCount = Σ live item qty on linked designs; needsSizes counts named entries with no live items; a blank entry is not a player; a player whose lines came from two different submitter emails is one `PlayerView` whose `lines` keep both emails.

## Dependencies
- Blocked by: none

## Notes
- Files likely touched: `convex/schema.ts`, `convex/_orderItems.ts`, `convex/rosterEntries.ts` (new) + test, `convex/_migrations.ts` + test, `lib/rosterEntry/rules.ts`, `lib/orderItem/summary.ts`, `lib/orderItem/index.ts`, `lib/rosterEntry.test.ts`, `lib/orderItem.test.ts`.
- Review checks (read the diff): no function in `rosterEntries.ts` accepts `isAdmin`, a user id, `source`, `submitter*` or `customAnswers`; every by-id mutation resolves the order from the stored entry; `merge` looks up its target within the same order + design only; no write rewrites an existing item's submitter fields; the schema adds no per-design field list and no front-number field (Gate 1b Q3, parked as `backlog/parked/R2-06-…`).
- Read `convex/_generated/ai/guidelines.md` first.
- Gate 1b Q6: a sizeless qty > 1 is reported, not stored. Q5: no collision flag in the new read model.
