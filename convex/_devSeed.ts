import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { prepareBlocks } from "./_designBlocks";
import { hasAnyItem, loadItems } from "./_orderItems";
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
 * two designs, an order **with** a live run (order items, players and a spare,
 * so the C-01/C-02 breakdown views have something to group) and an order
 * **with no run at all** (two captain items, one Needs size), which is the
 * only way to photograph B-04's `NoRunYet` branch. Since L-02 every row is an
 * `orderItems` row; the legacy roster/order entry tables are never written.
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
  orderFormId: Id<"orderForms">;
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

    const orderFormId = track(
      await ensureRun(ctx, user._id, orderWithRunId, now),
    );
    track(
      await ensureItems(ctx, orderWithRunId, designIds, orderFormId, RUN_ORDER_ITEMS, now),
    );
    track(
      await ensureItems(
        ctx,
        orderWithoutRunId,
        [homeKit],
        null,
        NO_RUN_ORDER_ITEMS,
        now,
      ),
    );

    return {
      userId: user._id,
      designIds,
      orderWithRunId,
      orderWithoutRunId,
      orderFormId,
      created,
    };
  },
});

/**
 * A full-size, mostly-unsized roster on the fixture order's home kit (M-01).
 *
 * `seedPortalFixtures` seeds three players, all sized, which photographs the
 * "everyone has ordered" case and nothing else. The design-card roster
 * preview exists for the opposite case — a captain adds fifteen players and
 * needs to see that it saved — and its overflow cap can only be judged
 * against a card that actually overflows. This tops the home kit up to
 * fifteen named items, the added ones Needs size so they render muted.
 *
 * Run against the dev deployment with:
 *   npx convex run _devSeed:seedLargeRoster '{"email":"jcc@sidestep.design"}'
 *
 * Idempotent: it tops up to `size` and stops, so re-running adds nothing. It
 * only ever *adds* captain items — nothing existing is edited or removed.
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

    // The home kit — designIds[0], the design seedPortalFixtures puts sized
    // players on, so the card shows filled and unfilled together.
    const designId = order.designIds[0];
    if (!designId) throw new ConvexError("That order has no designs.");

    const existing = (await loadItems(ctx, order._id)).filter(
      (i) => i.designId === designId && i.name !== undefined,
    );

    const now = Date.now();
    const taken = new Set(existing.map((i) => i.name));
    const added: Id<"orderItems">[] = [];
    for (const name of PADDING_PLAYERS) {
      if (existing.length + added.length >= target) break;
      if (taken.has(name)) continue;
      added.push(
        await ctx.db.insert("orderItems", {
          orderId: order._id,
          designId,
          name,
          number: `${30 + added.length}`,
          qty: 1,
          source: "captain",
          createdAt: now + added.length,
          updatedAt: now + added.length,
        }),
      );
    }

    return {
      orderId: order._id,
      designId,
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
 * A design counts as *removed* when order items still point at it but the
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
 * only ever edits one order's `designIds`; no design or order item is
 * created or deleted, which is what makes the round trip lossless.
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
): Promise<Ensured<Id<"orderForms">>> {
  const existing = await ctx.db
    .query("orderForms")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .unique();
  if (existing) return { value: existing._id, inserted: false };

  const value = await ctx.db.insert("orderForms", {
    orderId,
    captainId,
    sizeOptions: RUN_SIZE_OPTIONS,
    // Open names, so the public form shows the free-text path — the one a fan
    // actually sees when a captain hasn't pre-seeded a roster.
    namesMode: "open",
    customQuestions: [{ id: "q-shorts", label: "Do you also want shorts?" }],
    // Comfortably in the future: a past deadline would lazily close the form,
    // and the public-form capture would show the closed state.
    deadline: now + RUN_DEADLINE_DAYS * 24 * 60 * 60 * 1000,
    status: "open",
    createdAt: now,
  });
  return { value, inserted: true };
}

// One fixture item: which of the order's designs it sits on, the player (if
// any), and — when it came in through the form — who sent it.
type ItemFixture = {
  designIndex: number;
  name?: string;
  number?: string;
  designation?: "C" | "A";
  size?: string;
  qty: number;
  source: "captain" | "fan";
  submitter?: { name: string; email: string; shorts: string };
};

// The order with a run. Players across both designs, so the breakdown views
// have more than one group to draw; one captain and one assistant among the
// three, so every surface has a letter to photograph (M-09). Each player is
// a captain's item a player then sized through the form. Three sizes so the
// size chips have a spread, one spare with no name so the "By fan" view
// differs from "By roster", and two jerseys from one submitter so fan
// grouping is visible.
const RUN_ORDER_ITEMS: ItemFixture[] = [
  {
    designIndex: 0,
    name: "Avery Quinn",
    number: "7",
    designation: "C",
    size: "M",
    qty: 1,
    source: "captain",
    submitter: { name: "Avery Quinn", email: "avery.quinn@example.com", shorts: "Yes" },
  },
  {
    designIndex: 0,
    name: "Sam Okafor",
    number: "12",
    designation: "A",
    size: "L",
    qty: 1,
    source: "captain",
    submitter: { name: "Sam Okafor", email: "sam.okafor@example.com", shorts: "No" },
  },
  {
    designIndex: 1,
    name: "Riley Tran",
    number: "23",
    size: "S",
    qty: 1,
    source: "captain",
    submitter: { name: "Riley Tran", email: "riley.tran@example.com", shorts: "Yes" },
  },
  {
    // No name: a spare jersey ordered alongside Riley's own.
    designIndex: 1,
    size: "2XL",
    qty: 2,
    source: "fan",
    submitter: { name: "Riley Tran", email: "riley.tran@example.com", shorts: "No" },
  },
];

// The order with no run: what a captain types onto the list before making a
// form — one jersey sized, one still Needs size. Numbers only, no names: this
// order shares the home kit, and `seedLargeRoster` counts the kit's named
// players, which must all be on the order with the run.
const NO_RUN_ORDER_ITEMS: ItemFixture[] = [
  { designIndex: 0, number: "4", size: "M", qty: 1, source: "captain" },
  { designIndex: 0, number: "9", qty: 1, source: "captain" },
];

// All-or-nothing per order: topping up a list a human has been editing (or
// re-adding items they removed) would be worse than leaving it alone.
async function ensureItems(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  designIds: Id<"designs">[],
  orderFormId: Id<"orderForms"> | null,
  fixture: readonly ItemFixture[],
  now: number,
): Promise<Ensured<null>> {
  if (await hasAnyItem(ctx, orderId)) return { value: null, inserted: false };

  for (const [i, item] of fixture.entries()) {
    await ctx.db.insert("orderItems", {
      orderId,
      designId: designIds[item.designIndex] ?? designIds[0],
      name: item.name,
      number: item.number,
      designation: item.designation,
      size: item.size,
      qty: item.qty,
      source: item.source,
      ...(item.submitter && orderFormId
        ? {
            submitterName: item.submitter.name,
            // Stored trim+lowercase, matching checkSubmitterEmail — the by-fan
            // grouping keys on this exact value.
            submitterEmail: item.submitter.email.trim().toLowerCase(),
            customAnswers: { "q-shorts": item.submitter.shorts },
            orderFormId,
          }
        : {}),
      createdAt: now + i,
      updatedAt: now + i,
    });
  }
  return { value: null, inserted: true };
}
