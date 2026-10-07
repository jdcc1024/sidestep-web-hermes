import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  getCurrentUserOrNull,
  requireAdmin,
  requireCurrentUser,
  requireOrderOwnership,
} from "./_auth";
import {
  MAX_CUSTOM_QUESTIONS,
  QUESTION_LABEL_MAX_LENGTH,
  SIZE_OPTIONS,
} from "../lib/orderForm/rules";
import { effectiveStatus } from "../lib/orderForm/lock";
import {
  isListLocked,
  LIST_LOCKED_MESSAGE,
  loadRoster,
  summarizeRosterOrder,
} from "./_orderItems";

// Get the jersey run linked to one of the captain's orders. Returns null
// if no run exists yet — the order detail page uses that to show the
// "set up jersey run" CTA instead of the run details. Throws if the
// caller doesn't own the order (a stronger signal than "not found", so
// the UI can distinguish a missing run from an access violation).
// `effectiveStatus` is the lazily-resolved status (a passed deadline reads
// as closed) so the order page doesn't recompute the rule itself;
// `listLocked` says whether the settings can still change.
export const getByOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;

    const order = await ctx.db.get(orderId);
    if (!order) return null;
    if (order.captainId !== user._id)
      throw new ConvexError("You don't have access to this order.");

    const run = await ctx.db
      .query("orderForms")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .unique();
    if (!run) return null;

    // `listLocked`: the order's list is confirmed, so the form's settings
    // are frozen with it (the same rule `updateSettings` enforces).
    return {
      ...run,
      effectiveStatus: effectiveStatus(run),
      listLocked: await isListLocked(ctx, order),
    };
  },
});

type PickerEntry = {
  _id: Id<"rosterEntries">;
  name: string;
  number: string | undefined;
};

// The fixed-mode picker for one design: the order's live named players, in
// the order they were added. Entries are already one per player, so there is
// nothing to dedupe. Only `_id`, name and number leave the server — never a
// size, letter, submitter or answer.
function pickerFor(
  entries: readonly Doc<"rosterEntries">[],
  designId: Id<"designs">,
): PickerEntry[] {
  return entries
    .filter((entry) => entry.designId === designId && entry.name)
    .sort((a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime)
    .map((entry) => ({
      _id: entry._id,
      name: entry.name!,
      number: entry.number,
    }));
}

// Public — used by the fan submission form (R-02) and the captain's run
// detail view. Returns the run plus the captain's display name and the
// order's team name so the public page can render a friendly header
// without exposing captain email or other PII. Also returns the order's
// designs, each with its picker list (`pickerFor`), so the form can show a
// per-design picker (collapsing to one implicit choice for a single-
// design order) and, in fixed mode, let the fan pick a player the captain
// added — whether before or after the form existed.
// `effectiveStatus` is the lazily-resolved status, so the public form shows
// as closed the moment the deadline passes without a scheduler having
// touched the row yet.
export const getPublic = query({
  args: { orderFormId: v.id("orderForms") },
  handler: async (ctx, { orderFormId }) => {
    const run = await ctx.db.get(orderFormId);
    if (!run) return null;

    const order = await ctx.db.get(run.orderId);
    const captain = await ctx.db.get(run.captainId);

    const { entries } = order
      ? await loadRoster(ctx, order._id)
      : { entries: [] };

    const designs = await Promise.all(
      (order?.designIds ?? []).map(async (designId) => {
        const design = await ctx.db.get(designId);
        const roster = pickerFor(entries, designId);
        return {
          _id: designId,
          title: design?.title ?? "Untitled design",
          roster,
        };
      }),
    );

    return {
      run,
      effectiveStatus: effectiveStatus(run),
      // The list is confirmed, so `submitOrder` refuses even an open form.
      listLocked: order ? await isListLocked(ctx, order) : false,
      teamName: order?.teamName ?? "",
      captainName: captain?.name ?? "",
      designs,
    };
  },
});

// What a custom question is allowed to be, server-side. Returns the trimmed
// list to write; throws a user-facing ConvexError on the first bad row.
function cleanCustomQuestions(
  questions: readonly { id: string; label: string }[],
): { id: string; label: string }[] {
  if (questions.length > MAX_CUSTOM_QUESTIONS)
    throw new ConvexError(`Up to ${MAX_CUSTOM_QUESTIONS} custom questions.`);

  const seenQuestionIds = new Set<string>();
  return questions.map((q) => {
    const label = q.label.trim();
    if (!label) throw new ConvexError("Every question needs a label.");
    if (label.length > QUESTION_LABEL_MAX_LENGTH)
      throw new ConvexError("A custom question is too long.");
    if (!q.id || seenQuestionIds.has(q.id))
      throw new ConvexError("Custom question ids must be unique.");
    seenQuestionIds.add(q.id);
    return { id: q.id, label };
  });
}

// "Start collecting" (M-05). A deadline is the only thing the captain
// decides here: sizes are a fixed catalog they're never asked about, names
// mode is switched afterwards from the order page (`setNamesMode`), and
// custom questions are edited from /run/setup once the run exists.
//
// `sizeOptions` stays on the row rather than being derived at read time so
// runs created before the fixed catalog keep the narrower list they were
// created with (PRD §5 — no migration), and per-run scoping remains
// available if it's ever wanted back.
export const create = mutation({
  args: {
    orderId: v.id("orders"),
    deadline: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrderOwnership(ctx, args.orderId);

    // One run per order — the captain edits the existing run from
    // /run/setup if they need to make changes. Creating a second run for
    // the same order would orphan responses from the first.
    const existing = await ctx.db
      .query("orderForms")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .unique();
    if (existing) throw new ConvexError("This order already has a jersey run.");

    if (args.deadline <= Date.now())
      throw new ConvexError("Deadline must be in the future.");

    // A fixed-mode run picks from the named items on the order list. Every
    // run starts open — the mode
    // only matters once there are slots to pick from, and by then the
    // captain is on the order page where the control lives.
    return ctx.db.insert("orderForms", {
      orderId: args.orderId,
      captainId: user._id,
      sizeOptions: [...SIZE_OPTIONS],
      namesMode: "open",
      customQuestions: [],
      deadline: args.deadline,
      status: "open",
      createdAt: Date.now(),
    });
  },
});

// Switch how the public form collects names (M-05). Write-once at create
// until now; the control lives on the order page beside the designs it
// affects, and switching is safe in both directions — fan-typed names are
// already named order items, so open → fixed promotes them into the picker
// list and fixed → open only loosens a constraint. Neither loses data,
// hence no confirmation. A confirmed (locked) list rejects it like every
// other captain list write.
export const setNamesMode = mutation({
  args: {
    orderFormId: v.id("orderForms"),
    namesMode: v.union(v.literal("open"), v.literal("fixed")),
  },
  handler: async (ctx, { orderFormId, namesMode }) => {
    const run = await ctx.db.get(orderFormId);
    if (!run) throw new ConvexError("We couldn't find that order form.");
    const { order } = await requireOrderOwnership(ctx, run.orderId);

    if (await isListLocked(ctx, order))
      throw new ConvexError(LIST_LOCKED_MESSAGE);

    await ctx.db.patch(orderFormId, { namesMode });
    return orderFormId;
  },
});

// The management edit behind /run/setup (M-05). Creation takes only a
// deadline, so this is where a captain moves the date or adds the custom
// questions the fan form asks. Sizes and names mode are deliberately absent:
// the first isn't a captain decision any more, the second has its own
// mutation next to the designs it affects. The deadline must be in the
// future, so saving always (re)opens the form: extending a closed form's
// deadline is how a captain reopens it (L-06). A confirmed list rejects it.
export const updateSettings = mutation({
  args: {
    orderFormId: v.id("orderForms"),
    deadline: v.number(),
    customQuestions: v.array(
      v.object({ id: v.string(), label: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.orderFormId);
    if (!run) throw new ConvexError("We couldn't find that order form.");
    const { order } = await requireOrderOwnership(ctx, run.orderId);

    if (await isListLocked(ctx, order))
      throw new ConvexError(LIST_LOCKED_MESSAGE);

    if (args.deadline <= Date.now())
      throw new ConvexError("Deadline must be in the future.");

    await ctx.db.patch(args.orderFormId, {
      deadline: args.deadline,
      customQuestions: cleanCustomQuestions(args.customQuestions),
      status: "open",
    });
    return args.orderFormId;
  },
});

// Normalize an email the same way the order-entry submit path
// (orderEntries.submitOrder → checkSubmitterEmail) persists it. Keeping the
// two in lockstep is the whole point — a user signed in with "Pat@x.com"
// must still match a jersey they ordered as "pat@x.com". Defined as a
// top-level helper rather than inlined so any future caller (an admin
// lookup, an account-linking migration) uses the same rule.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// The signed-in caller's normalized email, or null. The app's Clerk session
// token carries no email claim (lib/clerkProfile.ts), so `identity.email` is
// null in practice; the caller's `users` row holds the email
// `users.refreshFromClerk` fetched server-side from Clerk's API. A token that
// does carry one (tests, a future JWT template) is used as is.
async function callerEmail(ctx: QueryCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const raw = identity.email ?? (await getCurrentUserOrNull(ctx))?.email;
  const email = raw ? normalizeEmail(raw) : "";
  return email.length > 0 ? email : null;
}

// Issue 3-08 / R-07 / R2-03. Returns the jerseys the signed-in user has
// ordered across every run: their own live size lines, matched by normalized
// submitter email (the same lowercasing the submit path stores). Each is
// joined with its player (name/number), its run, the linked order's team
// name and its design title, so the portal dashboard renders each jersey
// card without a follow-up roundtrip. Skips a removed line, a line under a
// removed player, and orphans whose player/run/order has been deleted —
// better to omit than leak a half-populated card. Cached lookups keep this
// O(unique players+runs+designs) rather than O(items). Newest first.
export const listMyResponses = query({
  args: {},
  handler: async (ctx) => {
    const email = await callerEmail(ctx);
    if (!email) return [];

    // Not `loadRoster` (that reads by order), so removed lines and players
    // are skipped here explicitly (invariant 4).
    const items = (
      await ctx.db
        .query("orderItems")
        .withIndex("by_submitterEmail", (q) => q.eq("submitterEmail", email))
        .collect()
    ).filter((i) => i.removedAt === undefined);

    const playerCache = new Map<string, Doc<"rosterEntries"> | null>();
    const runCache = new Map<string, Doc<"orderForms"> | null>();
    const orderCache = new Map<string, Doc<"orders"> | null>();
    const designTitleCache = new Map<string, string>();

    const joined: Array<{
      entry: {
        _id: Id<"orderItems">;
        designTitle: string;
        name: string | undefined;
        number: string | undefined;
        size: string;
        qty: number;
        createdAt: number;
      };
      run: Doc<"orderForms">;
      teamName: string;
    }> = [];

    for (const item of items) {
      if (
        item.orderFormId === undefined ||
        item.rosterEntryId === undefined ||
        item.size === undefined
      )
        continue;

      let player = playerCache.get(item.rosterEntryId) ?? null;
      if (!playerCache.has(item.rosterEntryId)) {
        player = await ctx.db.get(item.rosterEntryId);
        playerCache.set(item.rosterEntryId, player);
      }
      if (!player || player.removedAt !== undefined) continue;

      let run = runCache.get(item.orderFormId) ?? null;
      if (!runCache.has(item.orderFormId)) {
        run = await ctx.db.get(item.orderFormId);
        runCache.set(item.orderFormId, run);
      }
      if (!run) continue;

      let order = orderCache.get(run.orderId) ?? null;
      if (!orderCache.has(run.orderId)) {
        order = await ctx.db.get(run.orderId);
        orderCache.set(run.orderId, order);
      }
      if (!order) continue;

      if (!designTitleCache.has(player.designId)) {
        const design = await ctx.db.get(player.designId);
        designTitleCache.set(player.designId, design?.title ?? "Untitled design");
      }

      // `entry` is the jersey card's shape (the item, with its player's
      // printed values), kept from before players existed.
      joined.push({
        entry: {
          _id: item._id,
          designTitle: designTitleCache.get(player.designId)!,
          name: player.name,
          number: player.number,
          size: item.size,
          qty: item.qty,
          createdAt: item.createdAt,
        },
        run,
        teamName: order.teamName,
      });
    }

    return joined.sort((a, b) => b.entry.createdAt - a.entry.createdAt);
  },
});

// Captain or admin view of every jersey ordered on a run's order — the
// order's live, sized items (a Needs-size player isn't a jersey yet), in
// the entry shape the responses and admin run pages render; `_id` is the
// item id. Each is enriched with its design title; name/number/letter come
// off its player (blank/bulk jerseys carry none). Returns the run +
// linked order so the dashboard shows team name + deadline without a
// follow-up query. Newest first — fresh submissions at the top. Throws on
// access violation so the UI can show a 403; null if the run or order has
// been deleted.
export const listOrderEntries = query({
  args: { orderFormId: v.id("orderForms") },
  handler: async (ctx, { orderFormId }) => {
    const user = await requireCurrentUser(ctx);

    const run = await ctx.db.get(orderFormId);
    if (!run) return null;
    const order = await ctx.db.get(run.orderId);
    if (!order) return null;

    if (run.captainId !== user._id && !user.isAdmin)
      throw new ConvexError("You don't have access to this order form.");

    // Every live size line joined to its live player, on any design (a
    // design since unlinked from the order still shows its jerseys here).
    const roster = await loadRoster(ctx, order._id);
    const players = new Map(roster.entries.map((e) => [e._id, e]));
    const sized = roster.items.flatMap((item) => {
      const player = players.get(item.rosterEntryId!);
      return player ? [{ item, player }] : [];
    });

    // Resolve each referenced design title once.
    const designTitles = new Map(
      await Promise.all(
        [...new Set(sized.map(({ player }) => player.designId))].map(
          async (id) =>
            [id, (await ctx.db.get(id))?.title ?? "Untitled design"] as const,
        ),
      ),
    );

    const entries = sized
      .sort((a, b) => b.item.createdAt - a.item.createdAt)
      .map(({ item, player }) => ({
        _id: item._id,
        // A captain's item has no sender; the views show a blank, as for a
        // legacy line with no name.
        submitterName: item.submitterName ?? "",
        submitterEmail: item.submitterEmail ?? "",
        designId: player.designId,
        designTitle: designTitles.get(player.designId) ?? "Untitled design",
        name: player.name,
        number: player.number,
        // The by-roster view renders the letter beside the name (M-09).
        designation: player.designation,
        size: item.size!,
        qty: item.qty,
        source: item.source,
        customAnswers: item.customAnswers ?? {},
        createdAt: item.createdAt,
      }));

    return { run, order, entries };
  },
});

// Internal — used by the deadline-enforcement cron (issue 3-01). Returns
// every open run whose deadline has already passed so the action can
// close each one. Scanning the table is fine at phase 1 volume; a
// `by_status_deadline` index can come later if the catalog grows.
export const _listExpiredOpenForms = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const runs = await ctx.db.query("orderForms").collect();
    return runs
      .filter((run) => run.status === "open" && run.deadline < now)
      .map((run) => run._id);
  },
});

// Internal — closes a single run and returns the context needed to send
// the notification emails. Returns null when the run is already closed,
// has been deleted, or its order/captain has vanished — the action skips
// those silently. Idempotent: running it twice on the same id is safe.
export const _closeForm = internalMutation({
  args: { orderFormId: v.id("orderForms") },
  handler: async (ctx, { orderFormId }) => {
    const run = await ctx.db.get(orderFormId);
    if (!run || run.status !== "open") return null;

    await ctx.db.patch(orderFormId, { status: "closed" });

    const order = await ctx.db.get(run.orderId);
    const captain = await ctx.db.get(run.captainId);
    if (!order || !captain) return null;

    // The order's production total, the same number the captain's list shows.
    const { summary: list } = await summarizeRosterOrder(ctx, order);

    return {
      orderFormId,
      orderId: run.orderId,
      teamName: order.teamName,
      captainEmail: captain.email,
      captainName: captain.name,
      deadline: run.deadline,
      responseCount: list.summary.jerseyCount,
    };
  },
});

// Admin-only manual close (issue 3-02 will surface this in the UI).
// Schedules the same action the cron uses so the email side-effect
// stays in one place and admins don't have to wait for it.
export const closeFormByAdmin = mutation({
  args: { orderFormId: v.id("orderForms") },
  handler: async (ctx, { orderFormId }) => {
    await requireAdmin(ctx);

    const run = await ctx.db.get(orderFormId);
    if (!run) throw new ConvexError("We couldn't find that order form.");
    if (run.status === "closed") return { alreadyClosed: true };

    await ctx.scheduler.runAfter(
      0,
      internal.orderFormActions.closeFormWithNotification,
      { orderFormId },
    );
    return { alreadyClosed: false };
  },
});
