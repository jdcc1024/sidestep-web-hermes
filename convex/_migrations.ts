import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { prepareBlocks } from "./_designBlocks";
import { hasAnyItem, loadOrderForm } from "./_orderItems";

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

/**
 * Backfill for initiative 0004 (L-01): copies each order's legacy
 * `rosterEntries` (player slots) + `orderEntries` (jerseys) into `orderItems`,
 * the one order list. Mapping (docs/architecture/0004-order-items.md, "Must
 * answer 2"):
 *
 * - orderEntry on a slot → name / number / letter from the slot; size, qty,
 *   submitter, answers, source and createdAt from the entry. A slot with 3
 *   entries becomes 3 items sharing a name: they are 3 jerseys.
 * - orderEntry with no slot (a blank line) → no name / number / letter, the
 *   rest as above.
 * - slot with no entries ("not yet filled") → name / number / letter, no size
 *   (Needs size), qty 1, source from the slot, no submitter.
 * - entries on a since-unlinked design → copied as-is; the read model lists
 *   them under removed designs.
 *
 * Every item carries the run as `runId` (provenance). The legacy tables are
 * only read, never modified: L-06 deletes them.
 *
 * Run with:
 *   npx convex run _migrations:backfillOrderItems
 *
 * Idempotent per order: an order that already has any `orderItems` row
 * (removed ones included) is skipped, so it's safe to run more than once.
 * One transaction over every order, which is fine for the dev fixtures it is
 * written for (there is no production deployment yet). Returns the number of
 * orders backfilled and items created.
 */
export const backfillOrderItems = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").collect();
    let ordersBackfilled = 0;
    let itemsCreated = 0;

    for (const order of orders) {
      if (await hasAnyItem(ctx, order._id)) continue;
      const run = await loadOrderForm(ctx, order._id);
      if (!run) continue;

      const slots = await ctx.db
        .query("rosterEntries")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      const entries = await ctx.db
        .query("orderEntries")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      const slotById = new Map(slots.map((slot) => [slot._id, slot]));
      const filledSlots = new Set(entries.map((e) => e.rosterEntryId));

      const player = (slot: Doc<"rosterEntries"> | undefined) =>
        slot
          ? {
              name: slot.name,
              number: slot.number,
              designation: slot.designation,
            }
          : {};

      for (const entry of entries) {
        // A dangling slot reference reads as a blank line rather than failing
        // the whole order.
        const slot = entry.rosterEntryId
          ? slotById.get(entry.rosterEntryId)
          : undefined;
        await ctx.db.insert("orderItems", {
          orderId: order._id,
          designId: entry.designId,
          ...player(slot),
          size: entry.size,
          qty: entry.qty,
          source: entry.source,
          submitterName: entry.submitterName,
          submitterEmail: entry.submitterEmail,
          customAnswers: entry.customAnswers,
          runId: run._id,
          createdAt: entry.createdAt,
          updatedAt: entry.createdAt,
        });
        itemsCreated++;
      }

      for (const slot of slots) {
        if (filledSlots.has(slot._id)) continue;
        await ctx.db.insert("orderItems", {
          orderId: order._id,
          designId: slot.designId,
          ...player(slot),
          qty: 1,
          source: slot.source,
          runId: run._id,
          createdAt: slot.createdAt,
          updatedAt: slot.createdAt,
        });
        itemsCreated++;
      }

      if (entries.length > 0 || slots.length > 0) ordersBackfilled++;
    }

    return { orders: ordersBackfilled, itemsCreated };
  },
});
