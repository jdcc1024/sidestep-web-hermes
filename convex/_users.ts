import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type AnyCtx = MutationCtx | QueryCtx;

// Joins user rows onto a list of records that reference a user by id — the
// captain on an order, the owner on a design, and so on. Convex has no joins,
// so every admin list view was hand-rolling the same fetch-and-cache loop.
//
// Returns a lookup rather than merged rows: the fallback strings for a user
// row that's gone ("Unknown", "") are presentation, and belong at the call
// site's mapper, not buried in here. A missing user is `null` in the map, not
// an absent key, so callers can tell "no such user" from "never asked".
//
// Each distinct id is fetched exactly once, in parallel. That's an N+1 by
// design — fine at Sidestep's volume, where a handful of captains repeat
// across every order.
export async function joinUsersById<T>(
  ctx: AnyCtx,
  rows: readonly T[],
  keyOf: (row: T) => Id<"users">,
): Promise<Map<Id<"users">, Doc<"users"> | null>> {
  const ids = [...new Set(rows.map(keyOf))];
  const users = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return new Map(ids.map((id, i) => [id, users[i]]));
}
