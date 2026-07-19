import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  getCurrentUserOrNull,
  requireAdmin,
  requireCurrentUser,
  requireOrderOwnership,
} from "./_auth";
import {
  MAX_CUSTOM_QUESTIONS,
  MAX_ROSTER_ENTRIES,
  QUESTION_LABEL_MAX_LENGTH,
  ROSTER_NAME_MAX_LENGTH,
  ROSTER_NUMBER_MAX_LENGTH,
  isSizeOption,
} from "../lib/jerseyRun/rules";
import {
  checkCustomAnswer,
  checkJerseyName,
  checkJerseyNumber,
  checkRespondentEmail,
  checkRespondentName,
  checkSize,
  isJerseyRunClosed,
} from "../lib/jerseyRunResponse/rules";
import {
  canLock,
  canUnlock,
  effectiveStatus,
  statusAfterUnlock,
} from "../lib/jerseyRun/lock";

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

export const create = mutation({
  args: {
    orderId: v.id("orders"),
    sizeOptions: v.array(v.string()),
    namesMode: v.union(v.literal("open"), v.literal("fixed")),
    fixedRoster: v.array(
      v.object({
        name: v.string(),
        number: v.optional(v.string()),
      }),
    ),
    customQuestions: v.array(
      v.object({ id: v.string(), label: v.string() }),
    ),
    deadline: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrderOwnership(ctx, args.orderId);

    // One run per order — the captain can edit the existing run if they
    // need to make changes (handled in a later issue). Creating a second
    // run for the same order would orphan responses from the first.
    const existing = await ctx.db
      .query("jerseyRuns")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .unique();
    if (existing) throw new ConvexError("This order already has a jersey run.");

    const sizeOptions = Array.from(new Set(args.sizeOptions)).filter(
      isSizeOption,
    );
    if (sizeOptions.length === 0)
      throw new ConvexError("Pick at least one size.");

    if (args.deadline <= Date.now())
      throw new ConvexError("Deadline must be in the future.");

    if (args.customQuestions.length > MAX_CUSTOM_QUESTIONS)
      throw new ConvexError(
        `Up to ${MAX_CUSTOM_QUESTIONS} custom questions.`,
      );
    const seenQuestionIds = new Set<string>();
    for (const q of args.customQuestions) {
      const label = q.label.trim();
      if (!label) throw new ConvexError("Every question needs a label.");
      if (label.length > QUESTION_LABEL_MAX_LENGTH)
        throw new ConvexError("A custom question is too long.");
      if (!q.id || seenQuestionIds.has(q.id))
        throw new ConvexError("Custom question ids must be unique.");
      seenQuestionIds.add(q.id);
    }

    let fixedRoster: Array<{ name: string; number?: string }> = [];
    if (args.namesMode === "fixed") {
      const cleaned = args.fixedRoster
        .map((entry) => ({
          name: entry.name.trim(),
          number: entry.number?.trim() ?? "",
        }))
        .filter((entry) => entry.name.length > 0);
      if (cleaned.length === 0)
        throw new ConvexError("Add at least one name to the roster.");
      if (cleaned.length > MAX_ROSTER_ENTRIES)
        throw new ConvexError(
          `Rosters are capped at ${MAX_ROSTER_ENTRIES} names.`,
        );
      for (const entry of cleaned) {
        if (entry.name.length > ROSTER_NAME_MAX_LENGTH)
          throw new ConvexError("A roster name is too long.");
        if (entry.number.length > ROSTER_NUMBER_MAX_LENGTH)
          throw new ConvexError("A roster number is too long.");
      }
      fixedRoster = cleaned.map((entry) => ({
        name: entry.name,
        number: entry.number.length > 0 ? entry.number : undefined,
      }));
    }

    const customQuestions = args.customQuestions.map((q) => ({
      id: q.id,
      label: q.label.trim(),
    }));

    return ctx.db.insert("jerseyRuns", {
      orderId: args.orderId,
      captainId: user._id,
      sizeOptions,
      namesMode: args.namesMode,
      // Only persist a roster when the run uses fixed names; omitting the
      // field for open-mode runs keeps the document clean.
      fixedRoster: args.namesMode === "fixed" ? fixedRoster : undefined,
      customQuestions,
      deadline: args.deadline,
      status: "open",
      createdAt: Date.now(),
    });
  },
});

// Normalize an email the same way submitResponse persists it. Keeping the
// two in lockstep is the whole point — a user signed in with "Pat@x.com"
// must still match a response they submitted as "pat@x.com". Defined as
// a top-level helper rather than inlined so any future caller (an admin
// lookup, an account-linking migration) uses the same rule.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Issue 3-08. Returns the responses the signed-in user has submitted to a
// single run, matched by their Clerk email (normalized the same way the
// submit path stores it). Returns [] for unauthenticated callers so the
// public /run/[id] page can call this unconditionally without branching
// on the auth state at the call site.
export const listMyResponsesForRun = query({
  args: { jerseyRunId: v.id("jerseyRuns") },
  handler: async (ctx, { jerseyRunId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) return [];
    const email = normalizeEmail(identity.email);
    if (email.length === 0) return [];

    const responses = await ctx.db
      .query("jerseyRunResponses")
      .withIndex("by_respondentEmail", (q) => q.eq("respondentEmail", email))
      .collect();

    return responses
      .filter((r) => r.jerseyRunId === jerseyRunId)
      .sort((a, b) => b.submittedAt - a.submittedAt);
  },
});

// Issue 3-08. Returns the signed-in user's responses across every run,
// joined with the linked run and order so the portal dashboard can show
// team name and run context per entry without a follow-up roundtrip.
// Skips orphaned rows whose run or order has been deleted — better to
// silently omit than to leak a half-populated card. Cached lookups
// (runCache/orderCache) keep this O(unique runs) instead of O(responses).
export const listMyResponses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) return [];
    const email = normalizeEmail(identity.email);
    if (email.length === 0) return [];

    const responses = await ctx.db
      .query("jerseyRunResponses")
      .withIndex("by_respondentEmail", (q) => q.eq("respondentEmail", email))
      .collect();

    const runCache = new Map<string, Doc<"jerseyRuns"> | null>();
    const orderCache = new Map<string, Doc<"orders"> | null>();

    const joined: Array<{
      response: Doc<"jerseyRunResponses">;
      run: Doc<"jerseyRuns">;
      teamName: string;
    }> = [];
    for (const response of responses) {
      let run = runCache.get(response.jerseyRunId) ?? null;
      if (!runCache.has(response.jerseyRunId)) {
        run = await ctx.db.get(response.jerseyRunId);
        runCache.set(response.jerseyRunId, run);
      }
      if (!run) continue;

      let order = orderCache.get(run.orderId) ?? null;
      if (!orderCache.has(run.orderId)) {
        order = await ctx.db.get(run.orderId);
        orderCache.set(run.orderId, order);
      }
      if (!order) continue;

      joined.push({ response, run, teamName: order.teamName });
    }

    return joined.sort(
      (a, b) => b.response.submittedAt - a.response.submittedAt,
    );
  },
});

// Captain or admin view of every response submitted to a run. Used by the
// captain dashboard (issue 2-10). Returns the run plus the linked order so
// the dashboard can show team name + deadline without a follow-up query.
// Throws on access violation so the UI can show a 403; returns null if
// the run or order has been deleted.
export const listResponses = query({
  args: { jerseyRunId: v.id("jerseyRuns") },
  handler: async (ctx, { jerseyRunId }) => {
    const user = await requireCurrentUser(ctx);

    const run = await ctx.db.get(jerseyRunId);
    if (!run) return null;
    const order = await ctx.db.get(run.orderId);
    if (!order) return null;

    if (run.captainId !== user._id && !user.isAdmin)
      throw new ConvexError("You don't have access to this jersey run.");

    const responses = await ctx.db
      .query("jerseyRunResponses")
      .withIndex("by_jerseyRun", (q) => q.eq("jerseyRunId", jerseyRunId))
      .collect();

    // Newest first — captain wants to see fresh submissions at the top
    // without having to sort the column manually.
    responses.sort((a, b) => b.submittedAt - a.submittedAt);

    return { run, order, responses };
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

    const responses = await ctx.db
      .query("jerseyRunResponses")
      .withIndex("by_jerseyRun", (q) => q.eq("jerseyRunId", jerseyRunId))
      .collect();

    return {
      jerseyRunId,
      orderId: run.orderId,
      teamName: order.teamName,
      captainEmail: captain.email,
      captainName: captain.name,
      deadline: run.deadline,
      responseCount: responses.length,
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

    const entries = await ctx.db
      .query("orderEntries")
      .withIndex("by_run", (q) => q.eq("runId", jerseyRunId))
      .collect();
    const qtyByDesign = new Map<string, number>();
    for (const e of entries)
      qtyByDesign.set(e.designId, (qtyByDesign.get(e.designId) ?? 0) + e.qty);

    const byDesign = await Promise.all(
      order.designIds.map(async (designId) => {
        const design = await ctx.db.get(designId);
        return {
          designId,
          title: design?.title ?? "Untitled design",
          total: qtyByDesign.get(designId) ?? 0,
        };
      }),
    );
    const total = byDesign.reduce((sum, d) => sum + d.total, 0);

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

// Public — no auth. Called by the fan submission form at /run/[id].
// Re-validates everything the client checked; the public form is the
// one surface anyone on the internet can hit, so trust nothing.
export const submitResponse = mutation({
  args: {
    jerseyRunId: v.id("jerseyRuns"),
    respondentName: v.string(),
    respondentEmail: v.string(),
    size: v.string(),
    jerseyName: v.optional(v.string()),
    jerseyNumber: v.optional(v.string()),
    customAnswers: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.jerseyRunId);
    if (!run) throw new ConvexError("Jersey run not found.");

    if (isJerseyRunClosed(run))
      throw new ConvexError("This jersey run is closed.");

    const nameCheck = checkRespondentName(args.respondentName);
    if (!nameCheck.ok) throw new ConvexError(nameCheck.error);

    const emailCheck = checkRespondentEmail(args.respondentEmail);
    if (!emailCheck.ok) throw new ConvexError(emailCheck.error);

    const sizeCheck = checkSize(args.size, run.sizeOptions);
    if (!sizeCheck.ok) throw new ConvexError(sizeCheck.error);

    const jerseyNameCheck = checkJerseyName(args.jerseyName);
    if (!jerseyNameCheck.ok) throw new ConvexError(jerseyNameCheck.error);

    const jerseyNumberCheck = checkJerseyNumber(args.jerseyNumber);
    if (!jerseyNumberCheck.ok) throw new ConvexError(jerseyNumberCheck.error);

    const knownQuestionIds = new Set(run.customQuestions.map((q) => q.id));
    const customAnswers: Record<string, string> = {};
    for (const [id, value] of Object.entries(args.customAnswers)) {
      if (!knownQuestionIds.has(id)) continue;
      const result = checkCustomAnswer(value);
      if (!result.ok) throw new ConvexError(result.error);
      customAnswers[id] = result.value;
    }

    return ctx.db.insert("jerseyRunResponses", {
      jerseyRunId: args.jerseyRunId,
      respondentName: nameCheck.value,
      respondentEmail: emailCheck.value,
      size: sizeCheck.value,
      jerseyName: jerseyNameCheck.value,
      jerseyNumber: jerseyNumberCheck.value,
      customAnswers,
      submittedAt: Date.now(),
    });
  },
});
