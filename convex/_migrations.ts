import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { prepareBlocks } from "./_designBlocks";
import { itemLabel } from "../lib/orderItem/label";
import { playerKey } from "../lib/rosterEntry/rules";

/**
 * One-off backfill for designs created before the D-02 block model (D-02
 * replaced the single `designs.brief` string with the required `blocks`
 * array). Such rows have no `blocks` field and still carry the legacy `brief`
 * (and pre-D-01 `fileIds`) fields, so a schema push rejects them with
 * "Object is missing the required field `blocks`".
 *
 * Run with:
 *   npx convex run _migrations:backfillDesignBlocks
 *
 * For each stale row it turns the old `brief` into the design's Overview block
 * — the minimum storable brief (see lib/designBlock.overviewBlocks) — and drops
 * the dead `brief` / `fileIds` fields. Idempotent: a row that already has a
 * `blocks` array is skipped, so it's safe to run more than once.
 */
export const backfillDesignBlocks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const designs = await ctx.db.query("designs").collect();
    let fixed = 0;

    for (const design of designs) {
      // These rows predate the current schema, so the generated Doc type no
      // longer knows about `blocks`/`brief`/`fileIds` — read/write them loosely.
      const legacy = design as typeof design & {
        blocks?: unknown;
        brief?: unknown;
        fileIds?: unknown;
      };
      if (Array.isArray(legacy.blocks)) continue;

      const legacyBrief =
        typeof legacy.brief === "string" ? legacy.brief.trim() : "";
      // Overview can't be empty (validateBlocks refuses it), so fall back to the
      // title, then a placeholder, if the old brief was blank.
      const body = legacyBrief || design.title.trim() || "Imported design.";

      const blocks = prepareBlocks([
        { id: crypto.randomUUID(), kind: "text", field: "overview", body },
      ]);

      // `undefined` deletes the dead legacy fields in a Convex patch. The
      // fields aren't on the generated Doc type any more, so patch is cast to
      // accept the dynamic shape.
      const patch = ctx.db.patch as (
        id: typeof design._id,
        value: Record<string, unknown>,
      ) => Promise<void>;
      await patch(design._id, { blocks, brief: undefined, fileIds: undefined });
      fixed++;
    }

    return { scanned: designs.length, fixed };
  },
});

/**
 * One-off cleanup for the R-07 schema swap, which removed `jerseyRuns.fixedRoster`
 * in favour of the `rosterEntries` table. R-07 assumed "no real data to preserve"
 * and shipped no migration, but the dev deployment still holds legacy runs that
 * carry the old field, so every `convex dev` push fails schema validation with
 * "Object contains extra field `fixedRoster` that is not in the validator".
 *
 * Run (after temporarily re-admitting the field as optional in schema.ts):
 *   npx convex run _migrations:dropFixedRoster
 *
 * For each run still carrying the field it drops `fixedRoster` (setting it to
 * `undefined` deletes it in a patch). No name/number data is migrated into
 * `rosterEntries` — a roster entry requires a `designId`, which `fixedRoster`
 * never recorded, so there is nothing to faithfully map. Idempotent: a run
 * without the field is skipped. Once this has run everywhere, delete the
 * temporary `fixedRoster` lines from schema.ts and push clean.
 */
export const dropFixedRoster = internalMutation({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db.query("orderForms").collect();
    let fixed = 0;

    for (const run of runs) {
      // `fixedRoster` is no longer on the generated Doc type — read it loosely.
      const legacy = run as typeof run & { fixedRoster?: unknown };
      if (!("fixedRoster" in legacy) || legacy.fixedRoster === undefined)
        continue;

      // `undefined` deletes the dead field. The field isn't on the generated
      // Doc type, so patch is cast to accept the dynamic shape.
      const patch = ctx.db.patch as (
        id: typeof run._id,
        value: Record<string, unknown>,
      ) => Promise<void>;
      await patch(run._id, { fixedRoster: undefined });
      fixed++;
    }

    return { scanned: runs.length, fixed };
  },
});

/*
 * History: `backfillOrderItems` (initiative 0004, L-01) copied each order's
 * legacy player slots and jersey lines (the R-01 `rosterEntries` /
 * `orderEntries` tables) into `orderItems`, the one order list. It ran on the
 * dev deployment and was removed in L-06 together with the tables it read.
 */

// The two R-01 tables `retireLegacyRosterTables` empties. They are no longer
// in schema.ts, so the generated types don't know them: the migration reads
// and deletes their rows through an untyped view of `ctx.db`.
const LEGACY_TABLES = ["rosterEntries", "orderEntries"] as const;

// The run status L-06 retired; this migration is the one place that names it.
const RETIRED_LOCKED_STATUS = "locked";

type LegacyDb = {
  query: (table: string) => { collect: () => Promise<{ _id: string }[]> };
  delete: (id: string) => Promise<void>;
};

/**
 * L-06: retire the legacy roster model. `orderItems` is the only list now
 * (backfilled by `backfillOrderItems`, see the history note above), and the
 * list locks on the order's "Order Size Confirmed" stage, not on the order
 * form. This empties the two legacy tables, turns any stored `locked` run
 * into `closed` (the deadline only closes the form) and clears its
 * `lockSnapshot`, so the schema can then drop `rosterEntries`,
 * `orderEntries`, `lockSnapshot` and the `locked` status literal.
 *
 * Run with:
 *   npx convex run _migrations:retireLegacyRosterTables
 *
 * Ran on dev 2026-10-03: {rosterEntries: 13, orderEntries: 26, runsPatched: 0};
 * a second run was a no-op. The schema dropped the tables afterwards, so this
 * now only finds rows on a deployment that still holds them (which its schema
 * push would reject first). Kept as the record of what was done.
 *
 * Idempotent: a second run finds nothing to delete or patch. One transaction,
 * which is fine for the dev fixtures (there is no production deployment yet).
 */
export const retireLegacyRosterTables = internalMutation({
  args: {},
  handler: async (ctx) => {
    const db = ctx.db as unknown as LegacyDb;
    const deleted: Record<(typeof LEGACY_TABLES)[number], number> = {
      rosterEntries: 0,
      orderEntries: 0,
    };
    for (const table of LEGACY_TABLES) {
      for (const row of await db.query(table).collect()) {
        await db.delete(row._id);
        deleted[table]++;
      }
    }

    // `locked` and `lockSnapshot` are gone from the generated Doc type too;
    // read them loosely, and patch through a cast like `dropFixedRoster`.
    const patch = ctx.db.patch as (
      id: Id<"orderForms">,
      value: Record<string, unknown>,
    ) => Promise<void>;
    let runsPatched = 0;
    for (const run of await ctx.db.query("orderForms").collect()) {
      const legacy = run as Omit<typeof run, "status"> & {
        status: string;
        lockSnapshot?: unknown;
      };
      const wasLocked = legacy.status === RETIRED_LOCKED_STATUS;
      if (!wasLocked && legacy.lockSnapshot === undefined) continue;
      await patch(run._id, {
        status: wasLocked ? "closed" : legacy.status,
        lockSnapshot: undefined,
      });
      runsPatched++;
    }
    return { ...deleted, runsPatched };
  },
});

/**
 * R2-01 (initiative 0004 phase 1b): group the phase-1 flat order items into
 * roster entries. Rows sharing order + design + `playerKey({name, number})`
 * become one entry, and every row (sized or not) gets `rosterEntryId`. Design:
 * docs/architecture/0004-roster-sizes.md "Migration of existing orderItems
 * rows". The entry takes the oldest row's spelling, source and `createdAt`,
 * the first letter by `createdAt` (a group with two different letters keeps
 * that one and is counted in `letterConflicts`), the latest `updatedAt` /
 * `updatedBy`, and is removed (at the latest `removedAt`) only if every row
 * is. A blank group (no name, no number) with no live sized row gets a
 * removed entry: an empty "Blank jerseys" row means nothing. Rows are only
 * linked, never otherwise changed: each keeps its size, qty, submitter,
 * answers, form, timestamps and `removedAt`.
 *
 * A sizeless row's qty can't be held by the new model (a player with no sizes
 * has no count, Gate 1b Q6 = A): each live one with qty > 1 is returned in
 * `sizelessQtyOver1` by label so it can be re-entered by hand.
 *
 * Run with:
 *   npx convex run _migrations:groupOrderItemsIntoRosterEntries
 *
 * Dev run: (filled in after the dev run)
 *
 * Idempotent: rows that already have `rosterEntryId` are skipped, and a late
 * row for a player who already has a live entry joins it instead of making a
 * second one, so R2-03 can re-run it to catch rows written since. One
 * transaction, which is fine for the dev fixtures (no production deployment).
 */
export const groupOrderItemsIntoRosterEntries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const unlinked = (await ctx.db.query("orderItems").collect())
      .filter((item) => item.rosterEntryId === undefined)
      .sort((a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime);

    const groupKey = (orderId: string, designId: string, key: string) =>
      JSON.stringify([orderId, designId, key]);

    const groups = new Map<string, Doc<"orderItems">[]>();
    for (const item of unlinked) {
      const k = groupKey(item.orderId, item.designId, playerKey(item));
      const group = groups.get(k) ?? [];
      group.push(item);
      groups.set(k, group);
    }

    // Live entries from earlier runs (or the new API), so late rows join them.
    const liveEntries = new Map<string, Id<"rosterEntries">>();
    for (const entry of await ctx.db.query("rosterEntries").collect())
      if (entry.removedAt === undefined)
        liveEntries.set(
          groupKey(entry.orderId, entry.designId, playerKey(entry)),
          entry._id,
        );

    let entries = 0;
    let itemsLinked = 0;
    let sizelessRows = 0;
    let letterConflicts = 0;
    const sizelessQtyOver1: {
      orderId: Id<"orders">;
      label: string;
      qty: number;
    }[] = [];

    for (const [k, rows] of groups) {
      let entryId = liveEntries.get(k);
      if (entryId === undefined) {
        const oldest = rows[0];
        const letters = new Set(rows.flatMap((r) => r.designation ?? []));
        if (letters.size > 1) letterConflicts += 1;
        const latest = rows.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
        const allRemoved = rows.every((r) => r.removedAt !== undefined);
        const blankWithoutJerseys =
          playerKey(oldest) === "" &&
          !rows.some((r) => r.size !== undefined && r.removedAt === undefined);
        const removedAt = allRemoved
          ? Math.max(...rows.map((r) => r.removedAt!))
          : blankWithoutJerseys
            ? Date.now()
            : undefined;
        entryId = await ctx.db.insert("rosterEntries", {
          orderId: oldest.orderId,
          designId: oldest.designId,
          name: oldest.name,
          number: oldest.number,
          designation: rows.find((r) => r.designation)?.designation,
          source: oldest.source,
          removedAt,
          createdAt: oldest.createdAt,
          updatedAt: latest.updatedAt,
          updatedBy: latest.updatedBy,
        });
        entries += 1;
      }

      for (const row of rows) {
        await ctx.db.patch(row._id, { rosterEntryId: entryId });
        itemsLinked += 1;
        if (row.size !== undefined) continue;
        sizelessRows += 1;
        if (row.qty > 1 && row.removedAt === undefined)
          sizelessQtyOver1.push({
            orderId: row.orderId,
            label: itemLabel(row),
            qty: row.qty,
          });
      }
    }

    return { entries, itemsLinked, sizelessRows, sizelessQtyOver1, letterConflicts };
  },
});

/*
 * History: `renameJerseyRunsToOrderForms` (initiative 0004, L-07) copied each
 * `jerseyRuns` row to `orderForms` (new ids) and re-pointed `orderItems.runId`
 * to `orderFormId`. Ran on dev 2026-10-04: {forms: 2, itemsRepointed: 26}; a
 * second run returned zeros. Removed in L-07 with the `jerseyRuns` table.
 */
