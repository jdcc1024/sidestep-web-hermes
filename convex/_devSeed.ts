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

/**
 * A full-size, mostly-unfilled roster on the fixture order's home kit (M-01).
 *
 * `seedPortalFixtures` seeds three slots and orders against all three, which
 * photographs the "everyone has ordered" case and nothing else. The design-card
 * roster preview exists for the opposite case — a captain seeds fifteen players
 * and needs to see that it saved — and its overflow cap can only be judged
 * against a card that actually overflows. This tops the home kit up to fifteen
 * slots, leaving the extras unordered so they render muted.
 *
 * Run against the dev deployment with:
 *   npx convex run _devSeed:seedLargeRoster '{"email":"jcc@sidestep.design"}'
 *
 * Idempotent: it tops up to `size` and stops, so re-running adds nothing. It
 * only ever *adds* unfilled slots — nothing existing is edited or removed, and
 * `rosterEntries.remove` still refuses any slot that has orders on it.
 */
const PREVIEW_ROSTER_SIZE = 15;

// Padding names, deliberately ordinary — the point of the capture is the
// muted/filled contrast and the row rhythm, not the names.
const PADDING_PLAYERS = [
  "Jordan Blake",
  "Casey Moreau",
  "Devon Ellis",
  "Harper Vance",
  "Kai Nakamura",
  "Logan Reyes",
  "Marlow Dunn",
  "Noa Sharpe",
  "Parker Iyer",
  "Quinn Adeyemi",
  "Rowan Petit",
  "Sasha Volkov",
  "Toby Marchetti",
  "Umi Castellano",
  "Vera Lindqvist",
];

export const seedLargeRoster = internalMutation({
  args: { email: v.string(), size: v.optional(v.number()) },
  handler: async (ctx, { email, size }) => {
    const user = await findUserByEmail(ctx, email);
    if (!user)
      throw new ConvexError(
        `Found no user with email "${email}". Run seedPortalFixtures first.`,
      );

    const target = size ?? PREVIEW_ROSTER_SIZE;
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_captain", (q) => q.eq("captainId", user._id))
      .collect();
    const order = orders.find((o) => o.teamName === ORDER_WITH_RUN_TEAM);
    if (!order)
      throw new ConvexError(
        `Found no "${ORDER_WITH_RUN_TEAM}" order. Run seedPortalFixtures first.`,
      );

    const run = await ctx.db
      .query("jerseyRuns")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .unique();
    if (!run)
      throw new ConvexError("That order has no run. Run seedPortalFixtures first.");

    // The home kit — designIds[0], the design seedPortalFixtures puts the
    // already-filled slots on, so the card shows filled and unfilled together.
    const designId = order.designIds[0];
    if (!designId) throw new ConvexError("That order has no designs.");

    const existing = (
      await ctx.db
        .query("rosterEntries")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect()
    ).filter((e) => e.designId === designId);

    const now = Date.now();
    const taken = new Set(existing.map((e) => e.name));
    const added: Id<"rosterEntries">[] = [];
    for (const name of PADDING_PLAYERS) {
      if (existing.length + added.length >= target) break;
      if (taken.has(name)) continue;
      added.push(
        await ctx.db.insert("rosterEntries", {
          runId: run._id,
          orderId: order._id,
          designId,
          name,
          number: `${30 + added.length}`,
          source: "captain",
          createdAt: now + added.length,
        }),
      );
    }

    return {
      orderId: order._id,
      designId,
      runId: run._id,
      before: existing.length,
      added: added.length,
      total: existing.length + added.length,
    };
  },
});

/**
 * Unlink (or relink) the fixture order's away kit, so the O-08 removed-designs
 * receipt on `/portal/orders/<id>` can be photographed (N-08).
 *
 * A design counts as *removed* when order entries still point at it but the
 * order no longer lists it — a state only reachable through the edit form,
 * which a headless capture cannot click. The away kit is the right one to drop:
 * Riley Tran's three jerseys are on it, so the section renders with real
 * submitters rather than an empty shell, and the home kit keeps its roster and
 * entries so the rest of the page is unchanged between the two captures.
 *
 * Run against the dev deployment with:
 *   npx convex run _devSeed:setFixtureDesignRemoved '{"email":"jcc@sidestep.design","removed":true}'
 *   npx convex run _devSeed:setFixtureDesignRemoved '{"email":"jcc@sidestep.design","removed":false}'
 *
 * Idempotent and its own undo — `removed: false` puts the away kit back. It
 * only ever edits one order's `designIds`; no design, roster slot or order
 * entry is created or deleted, which is what makes the round trip lossless.
 */
export const setFixtureDesignRemoved = internalMutation({
  args: { email: v.string(), removed: v.boolean() },
  handler: async (ctx, { email, removed }) => {
    const user = await findUserByEmail(ctx, email);
    if (!user)
      throw new ConvexError(
        `Found no user with email "${email}". Run seedPortalFixtures first.`,
      );

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_captain", (q) => q.eq("captainId", user._id))
      .collect();
    const order = orders.find((o) => o.teamName === ORDER_WITH_RUN_TEAM);
    if (!order)
      throw new ConvexError(
        `Found no "${ORDER_WITH_RUN_TEAM}" order. Run seedPortalFixtures first.`,
      );

    const awayKit = (
      await ctx.db
        .query("designs")
        .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
        .collect()
    ).find((d) => d.title === AWAY_KIT_TITLE);
    if (!awayKit)
      throw new ConvexError(
        `Found no "${AWAY_KIT_TITLE}" design. Run seedPortalFixtures first.`,
      );

    const others = order.designIds.filter((id) => id !== awayKit._id);
    const designIds = removed ? others : [...others, awayKit._id];
    await ctx.db.patch(order._id, { designIds, updatedAt: Date.now() });

    return { orderId: order._id, designId: awayKit._id, designIds, removed };
  },
});

/**
 * Bring the fixture designs' silhouette specs back onto the allowlists
 * (D-10), so the design page's spec pickers photograph with a real answer
 * checked.
 *
 * `ensureDesign` deliberately never touches a design it adopted — a human may
 * have edited the fixture on purpose — which means designs seeded before the
 * allowlists settled still carry values like "Crew" and "Short sleeve". The
 * pickers render those honestly, as an off-list option, but that isn't the
 * state a reviewer wants to look at.
 *
 * Run against the dev deployment with:
 *   npx convex run _devSeed:resetFixtureDesignSpecs '{"email":"jcc@sidestep.design"}'
 *
 * Idempotent, and only ever writes the three spec fields.
 */
export const resetFixtureDesignSpecs = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await findUserByEmail(ctx, email);
    if (!user)
      throw new ConvexError(
        `Found no user with email "${email}". Run seedPortalFixtures first.`,
      );

    const designs = await ctx.db
      .query("designs")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const design of designs)
      await ctx.db.patch(design._id, {
        jerseyStyle: "Soccer jersey",
        neckline: "Crew Neck",
        sleeveStyle: "Regular",
        updatedAt: Date.now(),
      });

    return { patched: designs.map((d) => d._id) };
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
    // Necklines and sleeve styles are allowlists (lib/design/rules) — the
    // fixture has to use legal values or the design page's spec pickers
    // render an off-list answer and the captures lie about the real UI.
    jerseyStyle: "Soccer jersey",
    neckline: "Crew Neck",
    sleeveStyle: "Regular",
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
// One captain and one assistant among the three, so every roster surface has
// a letter to photograph (M-09) — and two of the three have none, which is the
// ratio a real team has.
const ROSTER_FIXTURE = [
  { name: "Avery Quinn", number: "7", designIndex: 0, designation: "C" as const },
  { name: "Sam Okafor", number: "12", designIndex: 0, designation: "A" as const },
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
  if (existing.length > 0) {
    // The one exception, and it is deliberately narrow: a deployment seeded
    // before M-09 has these exact three players with no letter on any of them,
    // so the surfaces that render one have nothing to photograph. Matched by
    // fixture name and applied only where the field is absent, so it never
    // overwrites a letter a human moved.
    for (const slot of ROSTER_FIXTURE) {
      const row = existing.find(
        (e) => e.name === slot.name && e.designation === undefined,
      );
      if (row && slot.designation)
        await ctx.db.patch(row._id, { designation: slot.designation });
    }
    return {
      value: existing
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((e) => e._id),
      inserted: false,
    };
  }

  const value: Id<"rosterEntries">[] = [];
  for (const [i, slot] of ROSTER_FIXTURE.entries()) {
    value.push(
      await ctx.db.insert("rosterEntries", {
        runId,
        orderId,
        designId: designIds[slot.designIndex] ?? designIds[0],
        name: slot.name,
        number: slot.number,
        designation: slot.designation,
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
