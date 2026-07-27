import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type AnyCtx = MutationCtx | QueryCtx;

export type QtyByDesign = {
  total: number;
  byDesign: Array<{ designId: Id<"designs">; title: string; total: number }>;
};

// The one Σ-qty-grouped-by-design rollup (R-04): sum every order entry on the
// run by its design, then project onto the order's *current* designs. An entry
// on a since-removed design (no longer in `order.designIds`) sits in the tally
// but is never read, so it drops out of both the per-design breakdown and the
// grand total — `total` always reconciles with the sum of `byDesign`. Every
// linked design appears in order; one with no entries shows total 0.
//
// This is the single source the live count (`orderEntries.countsByRun`) and
// the frozen lock snapshot (`jerseyRuns.lock`) both derive from — the whole
// point of the snapshot is that the frozen basis matches what the captain saw
// live, and that guarantee now rests on one copy of the arithmetic, not two.
//
// Auth, the empty-shape fallback for a missing run/order, and `lockedAt` are
// policy/presentation and stay at the call sites — this owns only the rollup.
export async function qtyByDesign(
  ctx: AnyCtx,
  run: Doc<"jerseyRuns">,
  order: Doc<"orders">,
): Promise<QtyByDesign> {
  const entries = await ctx.db
    .query("orderEntries")
    .withIndex("by_run", (q) => q.eq("runId", run._id))
    .collect();

  // One pass tallies Σ qty per design id across every entry on the run.
  const totals = new Map<string, number>();
  for (const e of entries)
    totals.set(e.designId, (totals.get(e.designId) ?? 0) + e.qty);

  // Project onto the order's current designs only — this is what excludes
  // removed-design entries (their qty is in the map but never read).
  const byDesign = await Promise.all(
    order.designIds.map(async (designId) => {
      const design = await ctx.db.get(designId);
      return {
        designId,
        title: design?.title ?? "Untitled design",
        total: totals.get(designId) ?? 0,
      };
    }),
  );
  const total = byDesign.reduce((sum, d) => sum + d.total, 0);

  return { total, byDesign };
}
