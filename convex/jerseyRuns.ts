import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
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
} from "../lib/jerseyRun/rules";
import {
  canLock,
  canUnlock,
  effectiveStatus,
  isLocked,
  statusAfterUnlock,
} from "../lib/jerseyRun/lock";
import { qtyByDesign } from "./_orderEntries";

// Get the jersey run linked to one of the captain's orders. Returns null
// if no run exists yet — the order detail page uses that to show the
// "set up jersey run" CTA instead of the run details. Throws if the
// caller doesn't own the order (a stronger signal than "not found", so
// the UI can distinguish a missing run from an access violation).
// `effectiveStatus` (R-06) is the lazily-resolved status (accounting for
// a passed deadline) so the order page (O-06) can render read-only
// without recomputing the lock rule itself.
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
      .query("jerseyRuns")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .unique();
    if (!run) return null;

    return { ...run, effectiveStatus: effectiveStatus(run) };
  },
});

// Public — used by the fan submission form (R-02) and the captain's run
// detail view. Returns the run plus the captain's display name and the
// order's team name so the public page can render a friendly header
// without exposing captain email or other PII. Also returns the order's
// designs, each with its seeded roster slots, so the form can show a
// per-design picker (collapsing to one implicit choice for a single-
// design order) and, in fixed mode, let the fan pick a pre-seeded name.
// Only slot name/number are exposed — never submitter emails or other PII.
// `effectiveStatus` (R-06) is the lazily-resolved status, so the public
// form and captain run-detail view can show "locked" the moment the
// deadline passes without a scheduler having touched the row yet.
export const getPublic = query({
  args: { jerseyRunId: v.id("jerseyRuns") },
  handler: async (ctx, { jerseyRunId }) => {
    const run = await ctx.db.get(jerseyRunId);
    if (!run) return null;

    const order = await ctx.db.get(run.orderId);
    const captain = await ctx.db.get(run.captainId);

    const rosterEntries = await ctx.db
      .query("rosterEntries")
      .withIndex("by_run", (q) => q.eq("runId", jerseyRunId))
      .collect();

    const designs = await Promise.all(
      (order?.designIds ?? []).map(async (designId) => {
        const design = await ctx.db.get(designId);
        const roster = rosterEntries
          .filter((e) => e.designId === designId)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((e) => ({ _id: e._id, name: e.name, number: e.number }));
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
      .query("jerseyRuns")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .unique();
    if (existing) throw new ConvexError("This order already has a jersey run.");

    if (args.deadline <= Date.now())
      throw new ConvexError("Deadline must be in the future.");

    // A fixed-mode run seeds its named slots through the roster sheet on the
    // design cards (rosterEntries, M-02). Every run starts open — the mode
    // only matters once there are slots to pick from, and by then the
    // captain is on the order page where the control lives.
    return ctx.db.insert("jerseyRuns", {
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
// already `rosterEntries`, so open → fixed promotes them into the picker
// list and fixed → open only loosens a constraint. Neither loses data,
// hence no confirmation. Locked runs reject like every other roster write.
export const setNamesMode = mutation({
  args: {
    jerseyRunId: v.id("jerseyRuns"),
    namesMode: v.union(v.literal("open"), v.literal("fixed")),
  },
  handler: async (ctx, { jerseyRunId, namesMode }) => {
    const run = await ctx.db.get(jerseyRunId);
    if (!run) throw new ConvexError("Jersey run not found.");
    await requireOrderOwnership(ctx, run.orderId);

    if (isLocked(run)) throw new ConvexError("This jersey run is locked.");

    await ctx.db.patch(jerseyRunId, { namesMode });
    return jerseyRunId;
  },
});

// The management edit behind /run/setup (M-05). Creation takes only a
// deadline, so this is where a captain moves the date or adds the custom
// questions the fan form asks. Sizes and names mode are deliberately absent:
// the first isn't a captain decision any more, the second has its own
// mutation next to the designs it affects.
export const updateSettings = mutation({
  args: {
    jerseyRunId: v.id("jerseyRuns"),
    deadline: v.number(),
    customQuestions: v.array(
      v.object({ id: v.string(), label: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.jerseyRunId);
    if (!run) throw new ConvexError("Jersey run not found.");
    await requireOrderOwnership(ctx, run.orderId);

    if (isLocked(run)) throw new ConvexError("This jersey run is locked.");

    if (args.deadline <= Date.now())
      throw new ConvexError("Deadline must be in the future.");

    await ctx.db.patch(args.jerseyRunId, {
      deadline: args.deadline,
      customQuestions: cleanCustomQuestions(args.customQuestions),
    });
    return args.jerseyRunId;
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

// Issue 3-08 / R-07. Returns the jerseys the signed-in user has ordered
// across every run — their own order entries, matched by normalized
// submitter email (the same lowercasing the submit path stores). Each
// entry is joined with its run, the linked order's team name, its design
// title, and (when it fills a slot) the roster name/number, so the portal
// dashboard renders each jersey card without a follow-up roundtrip. Skips
// orphaned entries whose run/order/design has been deleted — better to
// omit than leak a half-populated card. Cached lookups keep this
// O(unique runs+designs) rather than O(entries). Newest first.
export const listMyResponses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) return [];
    const email = normalizeEmail(identity.email);
    if (email.length === 0) return [];

    const entries = await ctx.db
      .query("orderEntries")
      .withIndex("by_submitterEmail", (q) => q.eq("submitterEmail", email))
      .collect();

    const runCache = new Map<string, Doc<"jerseyRuns"> | null>();
    const orderCache = new Map<string, Doc<"orders"> | null>();
    const designTitleCache = new Map<string, string>();
    const rosterCache = new Map<string, Doc<"rosterEntries"> | null>();

    const joined: Array<{
      entry: {
        _id: Id<"orderEntries">;
        designTitle: string;
        name: string | undefined;
        number: string | undefined;
        size: string;
        qty: number;
        createdAt: number;
      };
      run: Doc<"jerseyRuns">;
      teamName: string;
    }> = [];

    for (const entry of entries) {
      let run = runCache.get(entry.runId) ?? null;
      if (!runCache.has(entry.runId)) {
        run = await ctx.db.get(entry.runId);
        runCache.set(entry.runId, run);
      }
      if (!run) continue;

      let order = orderCache.get(run.orderId) ?? null;
      if (!orderCache.has(run.orderId)) {
        order = await ctx.db.get(run.orderId);
        orderCache.set(run.orderId, order);
      }
      if (!order) continue;

      if (!designTitleCache.has(entry.designId)) {
        const design = await ctx.db.get(entry.designId);
        designTitleCache.set(entry.designId, design?.title ?? "Untitled design");
      }

      let name: string | undefined;
      let number: string | undefined;
      if (entry.rosterEntryId) {
        if (!rosterCache.has(entry.rosterEntryId)) {
          rosterCache.set(
            entry.rosterEntryId,
            await ctx.db.get(entry.rosterEntryId),
          );
        }
        const slot = rosterCache.get(entry.rosterEntryId);
        name = slot?.name;
        number = slot?.number;
      }

      joined.push({
        entry: {
          _id: entry._id,
          designTitle: designTitleCache.get(entry.designId)!,
          name,
          number,
          size: entry.size,
          qty: entry.qty,
          createdAt: entry.createdAt,
        },
        run,
        teamName: order.teamName,
      });
    }

    return joined.sort((a, b) => b.entry.createdAt - a.entry.createdAt);
  },
});

// Captain or admin view of every jersey ordered on a run — the order
// entries (R-01 model) that replaced the flat jerseyRunResponses table.
// Used by the captain dashboard (2-10) and admin oversight (3-02). Each
// entry is enriched with its design title and, when it fills a slot, the
// roster name/number (blank/bulk lines carry neither). Returns the run +
// linked order so the dashboard shows team name + deadline without a
// follow-up query. Newest first — fresh submissions at the top. Throws on
// access violation so the UI can show a 403; null if the run or order has
// been deleted.
export const listOrderEntries = query({
  args: { jerseyRunId: v.id("jerseyRuns") },
  handler: async (ctx, { jerseyRunId }) => {
    const user = await requireCurrentUser(ctx);

    const run = await ctx.db.get(jerseyRunId);
    if (!run) return null;
    const order = await ctx.db.get(run.orderId);
    if (!order) return null;

    if (run.captainId !== user._id && !user.isAdmin)
      throw new ConvexError("You don't have access to this jersey run.");

    const rawEntries = await ctx.db
      .query("orderEntries")
      .withIndex("by_run", (q) => q.eq("runId", jerseyRunId))
      .collect();

    // Resolve each referenced design title and roster slot once.
    const designTitles = new Map(
      await Promise.all(
        [...new Set(rawEntries.map((e) => e.designId))].map(
          async (id) =>
            [id, (await ctx.db.get(id))?.title ?? "Untitled design"] as const,
        ),
      ),
    );
    const rosterIds = [
      ...new Set(
        rawEntries
          .map((e) => e.rosterEntryId)
          .filter((id): id is Id<"rosterEntries"> => id !== undefined),
      ),
    ];
    const rosters = new Map(
      await Promise.all(
        rosterIds.map(async (id) => [id, await ctx.db.get(id)] as const),
      ),
    );

    const entries = rawEntries
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((e) => {
        const slot = e.rosterEntryId ? rosters.get(e.rosterEntryId) : null;
        return {
          _id: e._id,
          submitterName: e.submitterName,
          submitterEmail: e.submitterEmail,
          designId: e.designId,
          designTitle: designTitles.get(e.designId) ?? "Untitled design",
          name: slot?.name,
          number: slot?.number,
          // The letter, off the same slot the name comes from (M-09) — the
          // by-roster view renders it beside the name.
          designation: slot?.designation,
          size: e.size,
          qty: e.qty,
          source: e.source,
          customAnswers: e.customAnswers ?? {},
          createdAt: e.createdAt,
        };
      });

    return { run, order, entries };
  },
});

// Internal — used by the deadline-enforcement cron (issue 3-01). Returns
// every open run whose deadline has already passed so the action can
// close each one. Scanning the table is fine at phase 1 volume; a
// `by_status_deadline` index can come later if the catalog grows.
export const _listExpiredOpenRuns = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const runs = await ctx.db.query("jerseyRuns").collect();
    return runs
      .filter((run) => run.status === "open" && run.deadline < now)
      .map((run) => run._id);
  },
});

// Internal — closes a single run and returns the context needed to send
// the notification emails. Returns null when the run is already closed,
// has been deleted, or its order/captain has vanished — the action skips
// those silently. Idempotent: running it twice on the same id is safe.
export const _closeRun = internalMutation({
  args: { jerseyRunId: v.id("jerseyRuns") },
  handler: async (ctx, { jerseyRunId }) => {
    const run = await ctx.db.get(jerseyRunId);
    if (!run || run.status !== "open") return null;

    await ctx.db.patch(jerseyRunId, { status: "closed" });

    const order = await ctx.db.get(run.orderId);
    const captain = await ctx.db.get(run.captainId);
    if (!order || !captain) return null;

    const entries = await ctx.db
      .query("orderEntries")
      .withIndex("by_run", (q) => q.eq("runId", jerseyRunId))
      .collect();
    const jerseyCount = entries.reduce((sum, e) => sum + e.qty, 0);

    return {
      jerseyRunId,
      orderId: run.orderId,
      teamName: order.teamName,
      captainEmail: captain.email,
      captainName: captain.name,
      deadline: run.deadline,
      responseCount: jerseyCount,
    };
  },
});

// Admin-only manual close (issue 3-02 will surface this in the UI).
// Schedules the same action the cron uses so the email side-effect
// stays in one place and admins don't have to wait for it.
export const closeRunByAdmin = mutation({
  args: { jerseyRunId: v.id("jerseyRuns") },
  handler: async (ctx, { jerseyRunId }) => {
    await requireAdmin(ctx);

    const run = await ctx.db.get(jerseyRunId);
    if (!run) throw new ConvexError("Jersey run not found.");
    if (run.status === "closed") return { alreadyClosed: true };

    await ctx.scheduler.runAfter(
      0,
      internal.jerseyRunActions.closeRunWithNotification,
      { jerseyRunId },
    );
    return { alreadyClosed: false };
  },
});

// Freeze the confirmed production basis (R-06). Captain or admin only.
// Takes a Σ-qty-by-design snapshot the same way orderEntries.countsByRun
// computes it, so the frozen number matches what the captain saw live
// right before locking. Works on a run whose deadline has already passed
// (lazily "locked" but never materialized) — this is how that state gets
// written to the DB with a snapshot.
export const lock = mutation({
  args: { jerseyRunId: v.id("jerseyRuns") },
  handler: async (ctx, { jerseyRunId }) => {
    const user = await requireCurrentUser(ctx);
    const run = await ctx.db.get(jerseyRunId);
    if (!run) throw new ConvexError("Jersey run not found.");
    if (run.captainId !== user._id && !user.isAdmin)
      throw new ConvexError("You don't have access to this jersey run.");

    if (!canLock(run))
      throw new ConvexError("This jersey run is already locked.");

    const order = await ctx.db.get(run.orderId);
    if (!order) throw new ConvexError("Order not found.");

    // Same rollup orderEntries.countsByRun serves live, so the frozen basis
    // provably matches what the captain saw the moment before locking (A-08).
    const { total, byDesign } = await qtyByDesign(ctx, run, order);

    await ctx.db.patch(jerseyRunId, {
      status: "locked",
      lockSnapshot: { lockedAt: Date.now(), total, byDesign },
    });
    return jerseyRunId;
  },
});

// Reverse a lock (R-06). Admin can always unlock; a captain only while
// the run's deadline hasn't passed (PRD §6). A run unlocked before its
// deadline reopens fully ("open"); one unlocked after its deadline goes
// to "closed" instead, so the unlock actually sticks — see
// lib/jerseyRun/lock.ts for why "open" would instantly re-lock there.
// The frozen snapshot is cleared: an unlocked run has no confirmed basis,
// live counts apply again.
export const unlock = mutation({
  args: { jerseyRunId: v.id("jerseyRuns") },
  handler: async (ctx, { jerseyRunId }) => {
    const user = await requireCurrentUser(ctx);
    const run = await ctx.db.get(jerseyRunId);
    if (!run) throw new ConvexError("Jersey run not found.");
    if (run.captainId !== user._id && !user.isAdmin)
      throw new ConvexError("You don't have access to this jersey run.");

    if (effectiveStatus(run) !== "locked")
      throw new ConvexError("This jersey run is not locked.");

    if (!canUnlock(run, { isAdmin: user.isAdmin }))
      throw new ConvexError(
        "The deadline has passed — ask an admin to unlock this run.",
      );

    await ctx.db.patch(jerseyRunId, {
      status: statusAfterUnlock(run),
      lockSnapshot: undefined,
    });
    return jerseyRunId;
  },
});
