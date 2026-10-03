import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin } from "./_auth";
import { joinUsersById } from "./_users";
import { confirmBlocker, summarizeOrder } from "./_orderItems";
import { INTERNAL_STAGES } from "../lib/orderStages";
import { isListConfirmed } from "../lib/orderItem/lock";
import {
  assetSummariesByDesign,
  fileCountsByDesign,
  mainAssetOf,
  resolveDesignAssets,
} from "./_designAssets";
import {
  validateEmail,
  validateOptionalText,
  validateQuantity,
  validateRequiredText,
} from "../lib/adminRecords";
import { ROSTER_DESIGNATION_LABEL } from "../lib/rosterEntry/rules";

const INTERNAL_STAGE_NAMES = new Set<string>(INTERNAL_STAGES);

export const listOrders = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const orders = await ctx.db.query("orders").order("desc").collect();
    const captains = await joinUsersById(ctx, orders, (o) => o.captainId);

    return orders.map((order) => {
      const captain = captains.get(order.captainId);
      return {
        ...order,
        captainName: captain?.name ?? "Unknown",
        captainEmail: captain?.email ?? "",
      };
    });
  },
});

export const listDesigns = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const designs = await ctx.db.query("designs").order("desc").collect();
    const owners = await joinUsersById(ctx, designs, (d) => d.ownerId);
    const fileCounts = await fileCountsByDesign(
      ctx,
      designs.map((d) => d._id),
    );

    return designs.map((design) => {
      const owner = owners.get(design.ownerId);
      return {
        ...design,
        ownerName: owner?.name ?? "Unknown",
        ownerEmail: owner?.email ?? "",
        fileCount: fileCounts.get(design._id) ?? 0,
      };
    });
  },
});

export const getOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    await requireAdmin(ctx);

    const order = await ctx.db.get(orderId);
    if (!order) return null;

    const captain = await ctx.db.get(order.captainId);

    // Linked designs may be empty; resolve each in parallel and drop any
    // that have since been deleted so the UI never blows up on a stale id.
    const linkedDesigns = (
      await Promise.all(order.designIds.map((id) => ctx.db.get(id)))
    ).filter((d): d is Doc<"designs"> => d !== null);

    // Convex storage URLs are short-lived signed URLs — generated per query
    // so the admin can click through to the raw file. null is returned for
    // storage ids that no longer exist.
    // `mainImage` is the thumbnail the order list shows per design, the same
    // picture the captain's order page uses (L-06: admin edits that list).
    const assetSummaries = await assetSummariesByDesign(
      ctx,
      linkedDesigns.map((d) => d._id),
    );
    const designs = await Promise.all(
      linkedDesigns.map(async (design) => ({
        ...design,
        assets: await resolveDesignAssets(ctx, design._id),
        mainImage: assetSummaries.get(design._id)?.mainImage ?? null,
      })),
    );

    // The order's production total (`summary.itemCount`): the same number
    // the captain's list shows, with or without an order form.
    const { form: jerseyRun, summary: list } = await summarizeOrder(ctx, order);
    const jerseyRunResponseCount = list.summary.itemCount;

    return {
      order,
      captain: captain
        ? { name: captain.name, email: captain.email, _id: captain._id }
        : null,
      designs,
      jerseyRun,
      jerseyRunResponseCount,
    };
  },
});

// Replaces an order's internal stage checklist wholesale (issue 2-12). The
// admin checklist UI sends the full 14-stage array every time, each stage
// carrying a `completedAt` timestamp or null. We normalize null to an absent
// field (the schema stores `completedAt` as an optional number) and persist.
// Because Convex is real-time, the customer portal's derived stage updates
// the instant this commits — no refresh on the customer's end.
//
// Stage names are validated against the canonical INTERNAL_STAGES list so a
// hand-rolled client can't smuggle arbitrary labels into the array. Stages
// may be completed out of order per the client requirement — we don't enforce
// any ordering on the timestamps.
export const updateOrderStages = mutation({
  args: {
    orderId: v.id("orders"),
    stages: v.array(
      v.object({
        name: v.string(),
        completedAt: v.union(v.number(), v.null()),
      }),
    ),
  },
  handler: async (ctx, { orderId, stages }) => {
    await requireAdmin(ctx);

    const order = await ctx.db.get(orderId);
    if (!order) throw new ConvexError("Order not found.");

    const seen = new Set<string>();
    const internalStages: Doc<"orders">["internalStages"] = stages.map((stage) => {
      if (!INTERNAL_STAGE_NAMES.has(stage.name))
        throw new ConvexError(`Unknown internal stage: ${stage.name}`);
      if (seen.has(stage.name))
        throw new ConvexError(`Duplicate internal stage: ${stage.name}`);
      seen.add(stage.name);
      // null → omit the field so it reads back as "not completed".
      return stage.completedAt === null
        ? { name: stage.name }
        : { name: stage.name, completedAt: stage.completedAt };
    });

    // The confirm gate (L-06, Q2 = A): checking "Order Size Confirmed" locks
    // the list, so it is refused while an item still needs a size. Only the
    // not-confirmed → confirmed step is gated: unchecking is always allowed,
    // and other stage edits on an already-confirmed order are unaffected.
    if (!isListConfirmed(order) && isListConfirmed({ internalStages })) {
      const blocker = await confirmBlocker(ctx, order);
      if (blocker) throw new ConvexError(blocker);
    }

    await ctx.db.patch(orderId, { internalStages, updatedAt: Date.now() });
  },
});

// The supplier-handoff export payload for one order (3-03). Admin only;
// null for a missing order so the caller renders "not found" rather than
// downloading an empty file. CSV formatting lives in lib/orderExport.ts —
// this query only joins.
//
// A row is one sized order item (one jersey line to produce), carrying its
// name/number/letter and its design's silhouette specs (which live on the
// design since O-01). Rows come from `summarize`, so Needs-size items,
// removed items and items on designs the order no longer links are all
// excluded, and Σ qty equals `summary.itemCount` (R-05, L-02).
//
// `hasRun` means "the rows are jerseys": true with an order form, and also
// without one once the captain has sized items. Only an order with neither
// degrades to one row per linked design — enough for the specs, with the
// order's own details riding alongside.
export const exportOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    await requireAdmin(ctx);

    const order = await ctx.db.get(orderId);
    if (!order) return null;

    const captain = await ctx.db.get(order.captainId);
    const designs = new Map<string, Doc<"designs">>();
    for (const designId of order.designIds) {
      const design = await ctx.db.get(designId);
      if (design) designs.set(designId, design);
    }

    const specsOf = (design: Doc<"designs"> | undefined) => ({
      designTitle: design?.title ?? "Untitled design",
      jerseyStyle: design?.jerseyStyle ?? "",
      neckline: design?.neckline ?? "",
      sleeveStyle: design?.sleeveStyle ?? "",
    });

    const base = {
      teamName: order.teamName,
      sport: order.sport,
      captainName: captain?.name ?? "Unknown",
      captainEmail: captain?.email ?? "",
      estimatedQuantity: order.estimatedQuantity,
      orderDate: order.createdAt,
    };

    const { form: run, summary: list } = await summarizeOrder(ctx, order);
    // Linked-design order (the captain's arrangement), then oldest first
    // within a design — `summarize` already sorts each design by createdAt.
    const sized = list.designs.flatMap((d) =>
      d.items.flatMap((item) =>
        item.size === undefined ? [] : [{ ...item, size: item.size }],
      ),
    );

    if (!run && sized.length === 0) {
      return {
        ...base,
        hasRun: false,
        customQuestions: [],
        rows: order.designIds.map((designId) => ({
          ...specsOf(designs.get(designId)),
          nameOnJersey: "",
          numberOnJersey: "",
          roleOnJersey: "",
          size: "",
          qty: 0,
          submitterName: "",
          submitterEmail: "",
          submittedAt: 0,
          customAnswers: {} as Record<string, string>,
        })),
      };
    }

    const rows = sized.map((item) => ({
      ...specsOf(designs.get(item.designId)),
      nameOnJersey: item.name ?? "",
      numberOnJersey: item.number ?? "",
      // In words, not the stored letter (M-09): whoever reads this file is
      // making the garment and has no key to a one-character code.
      roleOnJersey: item.designation
        ? ROSTER_DESIGNATION_LABEL[item.designation]
        : "",
      size: item.size,
      qty: item.qty,
      submitterName: item.submitterName ?? "",
      submitterEmail: item.submitterEmail ?? "",
      submittedAt: item.createdAt,
      customAnswers: item.customAnswers,
    }));

    return {
      ...base,
      hasRun: true,
      customQuestions: run?.customQuestions ?? [],
      rows,
    };
  },
});

// ─── Customer management and record editing (issue 2-13) ───────────────

// Field rules are shared with the inline-edit UI via lib/adminRecords so the
// two can't drift. `reject` turns a validator's message into a ConvexError.
function reject(message: string | null): void {
  if (message) throw new ConvexError(message);
}

// Presentation-safe view of a user row: everything except the Clerk id,
// which is an auth-system secret the admin UI has no use for.
function publicUserFields(user: Doc<"users">) {
  return {
    _id: user._id,
    _creationTime: user._creationTime,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}

// Every registered user with the counts the customer list table shows.
// Orders and designs are collected once and grouped in memory rather than
// queried per user — one pass beats N index reads at any volume we'll see.
export const listCustomers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const users = await ctx.db.query("users").collect();
    const orders = await ctx.db.query("orders").collect();
    const designs = await ctx.db.query("designs").collect();

    const tally = <T>(rows: readonly T[], keyOf: (row: T) => string) => {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const key = keyOf(row);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return counts;
    };

    const orderCounts = tally(orders, (o) => o.captainId);
    const designCounts = tally(designs, (d) => d.ownerId);

    return users
      .map((user) => ({
        ...publicUserFields(user),
        orderCount: orderCounts.get(user._id) ?? 0,
        designCount: designCounts.get(user._id) ?? 0,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// One customer's profile: their record plus everything they own, so the
// profile page renders without follow-up queries. null when the row is gone.
export const getCustomer = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_captain", (q) => q.eq("captainId", userId))
      .order("desc")
      .collect();

    const designs = await ctx.db
      .query("designs")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .collect();

    const fileCounts = await fileCountsByDesign(
      ctx,
      designs.map((d) => d._id),
    );

    return {
      user: publicUserFields(user),
      orders,
      designs: designs.map((design) => ({
        ...design,
        fileCount: fileCounts.get(design._id) ?? 0,
      })),
    };
  },
});

// Admin correction of a customer record. Partial by construction: an omitted
// arg is left alone, so the inline-edit UI can save one field at a time.
//
// Note this writes only the Convex row — Clerk remains the source of truth
// for the identity behind it. users.refreshFromClerk only fills blank
// name/email, so a correction made here sticks, but a later name change in
// Clerk won't propagate over it (see 3-07, User Sync Architecture Revisit).
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, { userId, name, email }) => {
    await requireAdmin(ctx);

    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("Customer not found.");

    const patch: Partial<Doc<"users">> = {};
    if (name !== undefined) {
      reject(validateRequiredText(name, "Name"));
      patch.name = name.trim();
    }
    if (email !== undefined) {
      reject(validateEmail(email));
      patch.email = email.trim();
    }

    if (Object.keys(patch).length > 0) await ctx.db.patch(userId, patch);
  },
});

// Admin correction of an order's own fields. Silhouette specs are not here —
// they moved onto the design in O-01 and are edited via `updateDesign`.
export const updateOrder = mutation({
  args: {
    orderId: v.id("orders"),
    teamName: v.optional(v.string()),
    sport: v.optional(v.string()),
    estimatedQuantity: v.optional(v.number()),
    hasOwnDesign: v.optional(v.boolean()),
  },
  handler: async (ctx, { orderId, ...fields }) => {
    await requireAdmin(ctx);

    const order = await ctx.db.get(orderId);
    if (!order) throw new ConvexError("Order not found.");

    const patch: Partial<Doc<"orders">> = {};
    if (fields.teamName !== undefined) {
      reject(validateRequiredText(fields.teamName, "Team name"));
      patch.teamName = fields.teamName.trim();
    }
    if (fields.sport !== undefined) {
      reject(validateRequiredText(fields.sport, "Sport"));
      patch.sport = fields.sport.trim();
    }
    if (fields.estimatedQuantity !== undefined) {
      reject(validateQuantity(fields.estimatedQuantity));
      patch.estimatedQuantity = fields.estimatedQuantity;
    }
    if (fields.hasOwnDesign !== undefined)
      patch.hasOwnDesign = fields.hasOwnDesign;

    if (Object.keys(patch).length > 0)
      await ctx.db.patch(orderId, { ...patch, updatedAt: Date.now() });
  },
});

// Admin correction of a design: its title and the silhouette specs that live
// on it since O-01. The optional specs are clearable — an empty string
// removes the field rather than storing "".
//
// The brief is no longer here: it became the `blocks` array in D-02, and the
// shared block editor writes it through the owner-or-admin mutations in
// convex/designs.ts. Since D-06 the admin page mounts that editor, so staff
// and captain edit a brief through one code path — this mutation stays for
// the fields the editor doesn't own.
export const updateDesign = mutation({
  args: {
    designId: v.id("designs"),
    title: v.optional(v.string()),
    jerseyStyle: v.optional(v.string()),
    neckline: v.optional(v.string()),
    sleeveStyle: v.optional(v.string()),
  },
  handler: async (ctx, { designId, ...fields }) => {
    await requireAdmin(ctx);

    const design = await ctx.db.get(designId);
    if (!design) throw new ConvexError("Design not found.");

    const patch: Partial<Doc<"designs">> = {};
    if (fields.title !== undefined) {
      reject(validateRequiredText(fields.title, "Title"));
      patch.title = fields.title.trim();
    }
    for (const key of ["jerseyStyle", "neckline", "sleeveStyle"] as const) {
      const value = fields[key];
      if (value === undefined) continue;
      reject(validateOptionalText(value, key));
      const trimmed = value.trim();
      // Convex treats `undefined` in a patch as "remove this field".
      patch[key] = trimmed === "" ? undefined : trimmed;
    }

    if (Object.keys(patch).length > 0)
      await ctx.db.patch(designId, { ...patch, updatedAt: Date.now() });
  },
});

// One design for the admin design detail page, with its owner and the
// short-lived signed URLs for its uploaded files (same treatment as
// `getOrder`). null when the design is gone.
//
// Since D-06 the page mounts the same block editor and file pool the captain
// uses, and both gate their buttons on who is looking — so this carries the
// `viewer` shape `designs.getMyDesign` carries, with `isAdmin` necessarily
// true here.
export const getDesign = query({
  args: { designId: v.id("designs") },
  handler: async (ctx, { designId }) => {
    const admin = await requireAdmin(ctx);

    const design = await ctx.db.get(designId);
    if (!design) return null;

    const owner = await ctx.db.get(design.ownerId);
    const assets = await resolveDesignAssets(ctx, designId);

    // Which orders reference this design — an admin editing a design wants
    // to know what it's committed to before changing the cut.
    const orders = (await ctx.db.query("orders").collect()).filter((o) =>
      o.designIds.includes(designId),
    );

    return {
      design,
      owner: owner ? publicUserFields(owner) : null,
      assets,
      mainAsset: mainAssetOf(assets),
      orders: orders.map((o) => ({ _id: o._id, teamName: o.teamName })),
      viewer: { userId: admin._id, isAdmin: admin.isAdmin },
    };
  },
});

// Every jersey run across every customer. Used by the admin oversight
// page (issue 3-02). Joins team name from the linked order and captain
// name/email from the user record so the list table can render without
// follow-up queries. Response count is computed per run — fine at phase 1
// volume; a denormalized counter on the run can come later if needed.
export const listJerseyRuns = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const runs = await ctx.db.query("jerseyRuns").order("desc").collect();

    const captains = await joinUsersById(ctx, runs, (r) => r.captainId);
    // Same dedupe-then-fetch shape as joinUsersById, on the orders table.
    const orderIds = [...new Set(runs.map((r) => r.orderId))];
    const orderRows = await Promise.all(orderIds.map((id) => ctx.db.get(id)));
    const orders = new Map(orderIds.map((id, i) => [id, orderRows[i]]));

    return Promise.all(
      runs.map(async (run) => {
        const order = orders.get(run.orderId);
        const captain = captains.get(run.captainId);

        const list = order ? (await summarizeOrder(ctx, order)).summary : null;
        const responseCount = list?.summary.itemCount ?? 0;

        return {
          _id: run._id,
          orderId: run.orderId,
          status: run.status,
          deadline: run.deadline,
          createdAt: run.createdAt,
          namesMode: run.namesMode,
          teamName: order?.teamName ?? "Unknown team",
          captainName: captain?.name ?? "Unknown",
          captainEmail: captain?.email ?? "",
          // The order's production total (R-07), as on the captain's list.
          responseCount,
        };
      }),
    );
  },
});
