import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { prepareBlocks } from "./_designBlocks";
import { overviewBlocks } from "../lib/designBlock";

/**
 * Review fixtures for the screenshot account (B-07).
 *
 * `scripts/snap.mjs` photographs the app as whichever Clerk user `SNAP_UID`
 * names. That account owned no orders and no designs on the dev deployment, so
 * every `/portal/orders/*` capture came back blank or "you don't have access"
 * and `/portal` showed three empty states — the loop could not review any
 * captain-side UI it shipped.
 *
 * This seeds the smallest set of rows that makes those surfaces photographable:
 * two designs, an order **with** a live run (roster slots + order entries, so
 * the C-01/C-02 breakdown views have something to group) and an order **with no
 * run at all**, which is the only way to photograph B-04's `NoRunYet` branch.
 *
 * Run against the dev deployment with:
 *   npx convex run _devSeed:seedPortalFixtures '{"email":"jcc@sidestep.design"}'
 *
 * Idempotent: rows are matched by owner + fixture title, so re-running adopts
 * what's already there instead of stacking duplicates, and a half-finished
 * earlier run is completed rather than duplicated. It is an `internalMutation`
 * (never reachable from the client) and it refuses to create `users` rows — a
 * Clerk account has to exist first, since a `users` row nobody can sign in as
 * is worse than no fixture at all.
 */

// Fixture titles double as the idempotency key — there is no `isFixture` flag
// on the schema, and adding one to production tables to support a dev seed
// would be the tail wagging the dog.
const HOME_KIT_TITLE = "Snap Demo — Home Kit";
const AWAY_KIT_TITLE = "Snap Demo — Away Kit";
const ORDER_WITH_RUN_TEAM = "Snap Demo — Live Run";
const ORDER_WITHOUT_RUN_TEAM = "Snap Demo — No Run Yet";

const RUN_DEADLINE_DAYS = 14;
const RUN_SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "2XL"];

export type SeedPortalFixturesResult = {
  userId: Id<"users">;
  designIds: Id<"designs">[];
  orderWithRunId: Id<"orders">;
  orderWithoutRunId: Id<"orders">;
  runId: Id<"jerseyRuns">;
  /** False when every fixture already existed — i.e. the call was a no-op. */
  created: boolean;
};

export const seedPortalFixtures = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<SeedPortalFixturesResult> => {
    const user = await findUserByEmail(ctx, email);
    if (!user)
      throw new ConvexError(
        `Found no user with email "${email}". Sign in as that account once so its users row exists, then re-run.`,
      );

    const now = Date.now();
    // Every insert flips this, so the caller can tell "seeded" from "already
    // seeded" without diffing counts.
    let created = false;
    const track = <T>(result: { value: T; inserted: boolean }): T => {
      created ||= result.inserted;
      return result.value;
    };

    const homeKit = track(
      await ensureDesign(ctx, user._id, HOME_KIT_TITLE, {
        overview:
          "Sublimated home kit in teal and charcoal. Full-body print, no side panels.",
        now,
      }),
    );
    const awayKit = track(
      await ensureDesign(ctx, user._id, AWAY_KIT_TITLE, {
        overview:
          "Away kit on white with teal trim. Same cut as the home kit, lighter fabric.",
        now,
      }),
    );
    const designIds = [homeKit, awayKit];

    const orderWithRunId = track(
      await ensureOrder(ctx, user._id, ORDER_WITH_RUN_TEAM, {
        estimatedQuantity: 18,
        designIds,
        now,
      }),
    );
    const orderWithoutRunId = track(
      await ensureOrder(ctx, user._id, ORDER_WITHOUT_RUN_TEAM, {
        estimatedQuantity: 10,
        // One design, not two: the empty-run order is the "just created it"
        // state, and a captain who has only picked one kit is the common shape.
        designIds: [homeKit],
        now,
      }),
    );

    const runId = track(
      await ensureRun(ctx, user._id, orderWithRunId, now),
    );
    track(await ensureRoster(ctx, runId, orderWithRunId, designIds, now));
    track(await ensureEntries(ctx, runId, now));

    return {
      userId: user._id,
      designIds,
      orderWithRunId,
      orderWithoutRunId,
      runId,
      created,
    };
  },
});

async function findUserByEmail(
  ctx: MutationCtx,
  email: string,
): Promise<Doc<"users"> | null> {
  const wanted = email.trim().toLowerCase();
  const users = await ctx.db.query("users").collect();
  return users.find((u) => u.email.trim().toLowerCase() === wanted) ?? null;
}

// Find-or-insert, reporting which one happened. An adopted row is left exactly
// as it is — a human may have edited the fixture on purpose, and re-seeding
// shouldn't stomp that.
type Ensured<T> = { value: T; inserted: boolean };

async function ensureDesign(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  title: string,
  { overview, now }: { overview: string; now: number },
): Promise<Ensured<Id<"designs">>> {
  const existing = await ctx.db
    .query("designs")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
  const match = existing.find((d) => d.title === title);
  if (match) return { value: match._id, inserted: false };

  const value = await ctx.db.insert("designs", {
    ownerId,
    title,
    blocks: prepareBlocks(overviewBlocks(overview)),
    jerseyStyle: "Jersey",
    neckline: "Crew",
    sleeveStyle: "Short sleeve",
    createdAt: now,
    updatedAt: now,
  });
  return { value, inserted: true };
}

async function ensureOrder(
  ctx: MutationCtx,
  captainId: Id<"users">,
  teamName: string,
  {
    estimatedQuantity,
    designIds,
    now,
  }: {
    estimatedQuantity: number;
    designIds: Id<"designs">[];
    now: number;
  },
): Promise<Ensured<Id<"orders">>> {
  const existing = await ctx.db
    .query("orders")
    .withIndex("by_captain", (q) => q.eq("captainId", captainId))
    .collect();
  const match = existing.find((o) => o.teamName === teamName);
  if (match) return { value: match._id, inserted: false };

  const value = await ctx.db.insert("orders", {
    captainId,
    teamName,
    sport: "Dodgeball",
    estimatedQuantity,
    hasOwnDesign: true,
    designIds,
    internalStages: [{ name: "Inquiry", completedAt: now }],
    createdAt: now,
    updatedAt: now,
  });
  return { value, inserted: true };
}

async function ensureRun(
  ctx: MutationCtx,
  captainId: Id<"users">,
  orderId: Id<"orders">,
  now: number,
): Promise<Ensured<Id<"jerseyRuns">>> {
  const existing = await ctx.db
    .query("jerseyRuns")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .unique();
  if (existing) return { value: existing._id, inserted: false };

  const value = await ctx.db.insert("jerseyRuns", {
    orderId,
    captainId,
    sizeOptions: RUN_SIZE_OPTIONS,
    // Open names, so the public form shows the free-text path — the one a fan
    // actually sees when a captain hasn't pre-seeded a roster.
    namesMode: "open",
    customQuestions: [{ id: "q-shorts", label: "Do you also want shorts?" }],
    // Comfortably in the future: a past deadline would lazily resolve to
    // "locked" (R-06) and every captain surface would photograph read-only.
    deadline: now + RUN_DEADLINE_DAYS * 24 * 60 * 60 * 1000,
    status: "open",
    createdAt: now,
  });
  return { value, inserted: true };
}

// Player slots across both designs, so the responses page's "By roster" view
// has more than one group to draw.
const ROSTER_FIXTURE = [
  { name: "Avery Quinn", number: "7", designIndex: 0 },
  { name: "Sam Okafor", number: "12", designIndex: 0 },
  { name: "Riley Tran", number: "23", designIndex: 1 },
];

async function ensureRoster(
  ctx: MutationCtx,
  runId: Id<"jerseyRuns">,
  orderId: Id<"orders">,
  designIds: Id<"designs">[],
  now: number,
): Promise<Ensured<Id<"rosterEntries">[]>> {
  const existing = await ctx.db
    .query("rosterEntries")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .collect();
  // All-or-nothing on the run: partially topping up a roster a human has been
  // editing would be worse than leaving it alone.
  if (existing.length > 0)
    return {
      value: existing
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((e) => e._id),
      inserted: false,
    };

  const value: Id<"rosterEntries">[] = [];
  for (const [i, slot] of ROSTER_FIXTURE.entries()) {
    value.push(
      await ctx.db.insert("rosterEntries", {
        runId,
        orderId,
        designId: designIds[slot.designIndex] ?? designIds[0],
        name: slot.name,
        number: slot.number,
        source: "captain",
        createdAt: now + i,
      }),
    );
  }
  return { value, inserted: true };
}

// Ordered jerseys. Three sizes so the size-breakdown chip row has a spread,
// one line with no roster slot (a spare) so the "By fan" view differs from
// "By roster", and two lines from one submitter so fan grouping is visible.
const ENTRY_FIXTURE = [
  {
    rosterIndex: 0,
    size: "M",
    qty: 1,
    submitterName: "Avery Quinn",
    submitterEmail: "avery.quinn@example.com",
    shorts: "Yes",
  },
  {
    rosterIndex: 1,
    size: "L",
    qty: 1,
    submitterName: "Sam Okafor",
    submitterEmail: "sam.okafor@example.com",
    shorts: "No",
  },
  {
    rosterIndex: 2,
    size: "S",
    qty: 1,
    submitterName: "Riley Tran",
    submitterEmail: "riley.tran@example.com",
    shorts: "Yes",
  },
  {
    // No roster slot: a spare jersey ordered alongside Riley's own.
    rosterIndex: null,
    size: "2XL",
    qty: 2,
    submitterName: "Riley Tran",
    submitterEmail: "riley.tran@example.com",
    shorts: "No",
  },
] as const;

async function ensureEntries(
  ctx: MutationCtx,
  runId: Id<"jerseyRuns">,
  now: number,
): Promise<Ensured<Id<"orderEntries">[]>> {
  const existing = await ctx.db
    .query("orderEntries")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .collect();
  if (existing.length > 0)
    return { value: existing.map((e) => e._id), inserted: false };

  const roster = (
    await ctx.db
      .query("rosterEntries")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect()
  ).sort((a, b) => a.createdAt - b.createdAt);
  if (roster.length === 0)
    throw new ConvexError("Cannot seed order entries before roster slots.");

  const value: Id<"orderEntries">[] = [];
  for (const [i, line] of ENTRY_FIXTURE.entries()) {
    // A blank line still needs a design to group under (R-01 denormalizes it),
    // so a spare borrows the design of the slot it was ordered alongside.
    const slot = roster[line.rosterIndex ?? roster.length - 1];
    value.push(
      await ctx.db.insert("orderEntries", {
        runId,
        designId: slot.designId,
        rosterEntryId: line.rosterIndex === null ? undefined : slot._id,
        size: line.size,
        qty: line.qty,
        source: "fan",
        submitterName: line.submitterName,
        // Stored trim+lowercase, matching checkSubmitterEmail — the by-fan
        // grouping keys on this exact value.
        submitterEmail: line.submitterEmail.trim().toLowerCase(),
        customAnswers: { "q-shorts": line.shorts },
        createdAt: now + i,
      }),
    );
  }
  return { value, inserted: true };
}
