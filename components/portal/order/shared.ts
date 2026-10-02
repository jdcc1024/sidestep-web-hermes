import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

// What the order page's own queries hand its sections, so each section types
// its props off the query rather than a hand-copied shape that can drift.
export type MyOrder = NonNullable<
  FunctionReturnType<typeof api.orders.getMyOrder>
>;
export type OrderRecord = MyOrder["order"];
export type OrderDesign = MyOrder["designs"][number];

// The run behind the collect card and the names-mode switch; `null` until the
// captain starts collecting, `undefined` while loading.
export type OrderRun = FunctionReturnType<typeof api.jerseyRuns.getByOrder>;

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
