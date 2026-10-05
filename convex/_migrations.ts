import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { prepareBlocks } from "./_designBlocks";

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
    const runs = await ctx.db.query("jerseyRuns").collect();
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
      id: Id<"jerseyRuns">,
      value: Record<string, unknown>,
    ) => Promise<void>;
    let runsPatched = 0;
    for (const run of await ctx.db.query("jerseyRuns").collect()) {
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

// More runs than this means a real deployment, not dev fixtures: page the
// migration instead of running it in one transaction.
const RENAME_MAX_RUNS = 500;

/**
 * L-07: rename `jerseyRuns` to `orderForms` in the data. Convex has no table
 * rename and can't insert a row with a chosen `_id`, so each run is copied to
 * a new `orderForms` row (every field kept, `createdAt` included), every
 * `orderItems` row that came through it is re-pointed from `runId` to the new
 * `orderFormId`, and the old row is deleted, all in one transaction.
 *
 * Run with:
 *   npx convex run _migrations:renameJerseyRunsToOrderForms
 *
 * Idempotent: a second run finds `jerseyRuns` empty and returns zeros.
 * Removed in L-07's next commit together with `jerseyRuns`.
 */
export const renameJerseyRunsToOrderForms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db.query("jerseyRuns").collect();
    if (runs.length > RENAME_MAX_RUNS) {
      throw new Error(
        `renameJerseyRunsToOrderForms: ${runs.length} runs is over ${RENAME_MAX_RUNS}; paginate it first.`,
      );
    }
    // `runId: undefined` deletes the field in a patch.
    const patchItem = ctx.db.patch as (
      id: Id<"orderItems">,
      value: Record<string, unknown>,
    ) => Promise<void>;
    let itemsRepointed = 0;
    for (const run of runs) {
      const { _id, _creationTime, ...fields } = run;
      void _creationTime;
      const formId = await ctx.db.insert("orderForms", fields);
      // The one allowed direct `by_order` read outside _orderItems.ts:
      // `loadItems` drops removed rows, and those must be re-pointed too.
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", run.orderId))
        .collect();
      for (const item of items) {
        if (item.runId !== _id) continue;
        await patchItem(item._id, { orderFormId: formId, runId: undefined });
        itemsRepointed++;
      }
      await ctx.db.delete(_id);
    }
    return { forms: runs.length, itemsRepointed };
  },
});
