# Issue: Retire the flat item fields and the phase-1 collision code: every reader goes through players; narrow the schema

## Phase: 3

## Type: infrastructure

## Size: M (~15 files, ~$3–3.5)

## Description

Initiative 0004, phase 1b. Design: `docs/architecture/0004-roster-sizes.md`
("Migration", "Effect on each surface", "Same print from two emails"). This
ends the mirror window: after it, an order item is only a size line under a
roster entry.

1. Switch the remaining readers from flat item fields to the entry:
   `admin.getOrder`, `admin.exportOrder`, `orderForms.listOrderEntries`,
   `orderForms._closeForm`, `orderForms.listMyResponses` (items by email,
   joined to their entry; skip a removed item or entry),
   `orderItems.affectedByDesignRemoval`, `lib/rosterExport.ts`, and
   `convex/_devSeed.ts` / `_e2e.ts` fixtures (seed entries + items).
2. Delete the old `summarize` together with its `collidingIds` helper,
   `ItemView.collision`, and every `collision: false` in test fixtures
   (`lib/orderItem.test.ts`, `lib/orderItem/checks.test.ts`,
   `lib/rosterExport.test.ts`; the frozen `.tsx` tests only where they no
   longer typecheck). Delete `mirrorEntryOntoItems` and `rosterSlotKey`
   (callers use `playerKey`).
3. Migration `_migrations:stripFlatItemFields` (internal, idempotent): re-runs
   the grouping first, then deletes sizeless items and unsets `designId`,
   `name`, `number` and `designation` on every item. Returns counts. Run on
   dev, record the result, compare `jerseyCount` per order before and after.
4. Narrow the schema: `orderItems.rosterEntryId` and `size` required; drop
   `designId`, `name`, `number`, `designation`.

## Done when
1. An admin opens an order with Sidestep #72 in S, M×3, XL and downloads the export; it has 5 rows for Sidestep #72 with the right sizes, and the order's jersey count matches the captain's footer.
2. A player who submitted through the order form signs in and sees their jerseys with the right name, number and size.

## Logic
- `_migrations.stripFlatItemFields`: after it, no item has `designId`, `name`, `number` or `designation`, and none lacks `size` or `rosterEntryId`; Σ qty of sized items per order is unchanged; a second run returns zeros. Internal only.
- `orderForms.listMyResponses`: returns the caller's items with their entry's name and number; an item under a removed entry is excluded; another user's items never appear, even when they share the caller's player.
- `admin.exportOrder`: rows come one per live item with the entry's values; a non-admin is rejected.

## Dependencies
- Blocked by: R2-02

## Notes
- Files likely touched: `convex/schema.ts`, `convex/_migrations.ts` + test, `convex/admin.ts` + test, `convex/orderForms.ts` + test, `convex/orderItems.ts`, `convex/_orderItems.ts`, `convex/_devSeed.ts`, `convex/_e2e.ts`, `lib/orderItem/summary.ts`, `lib/orderItem.test.ts`, `lib/orderItem/checks.test.ts`, `lib/rosterEntry/rules.ts`, `lib/rosterExport.ts` + test.
- Review checks: no behaviour change visible to captain or admin; `grep -n "item\.name\|item\.number\|item\.designation" convex lib` finds nothing reading the dropped fields; `grep -rn "collision" lib convex components --include=*.ts --include=*.tsx` finds nothing outside comments.
- Order on dev: deploy widened code → run strip → push narrowed schema (as L-07 did).
