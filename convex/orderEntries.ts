// The public order form's write path. The module keeps its R-01 name because
// `api.orderEntries.submitOrder` is the form's API path; since L-06 it holds
// only that mutation.
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  insertSizeLine,
  isListLocked,
  LIST_LOCKED_MESSAGE,
  loadRoster,
  resolveEntry,
} from "./_orderItems";
import {
  checkQty,
  checkSize,
  checkSubmitterEmail,
  checkSubmitterName,
} from "../lib/orderEntry/rules";
import { checkRosterNumber } from "../lib/rosterEntry/rules";
import { checkItemName } from "../lib/orderItem";
import { checkCustomAnswer, isOrderFormClosed } from "../lib/orderFormResponse/rules";

// Public — no auth. The order form's write path, on players since R2-02
// (docs/architecture/0004-roster-sizes.md, "Write: the public form"). One
// submission carries the sender's identity plus 1..N jersey lines spanning
// the order's designs. Per line:
//
// - Fixed mode (`rosterEntryId`): the picked player must be live, on this
//   order and on the line's design, and named.
// - Open mode: `resolveEntry` on the typed name / number, so a player already
//   on the design (any case or spacing) gets the line, and a new one is
//   created as a `fan` entry. Lines of one card share a key, so they land on
//   one player.
//
// Then it always **inserts** a `fan` size line carrying this sender, their
// answers and the form. It never changes or removes an existing line or
// player and never sets a letter, so two people who type the same print join
// one player and each keeps their own lines (Gate 1b Q5). Re-validates
// everything the client checked, since this is the one surface anyone on the
// internet can hit. Returns only this submission's own ids.
export const submitOrder = mutation({
  args: {
    orderFormId: v.id("orderForms"),
    submitterName: v.string(),
    submitterEmail: v.string(),
    customAnswers: v.record(v.string(), v.string()),
    lines: v.array(
      v.object({
        designId: v.id("designs"),
        // An explicit pick (the fixed-mode picker). When present the line is
        // that player; otherwise it is matched by the typed name + number.
        rosterEntryId: v.optional(v.id("rosterEntries")),
        name: v.optional(v.string()),
        number: v.optional(v.string()),
        size: v.string(),
        qty: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.orderFormId);
    if (!run) throw new ConvexError("Jersey run not found.");
    if (isOrderFormClosed(run))
      throw new ConvexError("This jersey run is closed.");

    const order = await ctx.db.get(run.orderId);
    if (!order) throw new ConvexError("Order not found.");
    if (await isListLocked(ctx, order))
      throw new ConvexError(LIST_LOCKED_MESSAGE);

    const nameCheck = checkSubmitterName(args.submitterName);
    if (!nameCheck.ok) throw new ConvexError(nameCheck.error);
    const emailCheck = checkSubmitterEmail(args.submitterEmail);
    if (!emailCheck.ok) throw new ConvexError(emailCheck.error);

    if (args.lines.length === 0)
      throw new ConvexError("Add at least one jersey.");

    // Keep only answers to questions the run actually asks — a stale form
    // snapshot (captain edited questions after sharing the link) can carry
    // extras. The same record rides on every line of this submission.
    const knownQuestionIds = new Set(run.customQuestions.map((q) => q.id));
    const customAnswers: Record<string, string> = {};
    for (const [id, value] of Object.entries(args.customAnswers)) {
      if (!knownQuestionIds.has(id)) continue;
      const result = checkCustomAnswer(value);
      if (!result.ok) throw new ConvexError(result.error);
      if (result.value.length > 0) customAnswers[id] = result.value;
    }
    const submission = {
      submitterName: nameCheck.value,
      submitterEmail: emailCheck.value,
      customAnswers:
        Object.keys(customAnswers).length > 0 ? customAnswers : undefined,
      orderFormId: run._id,
    };

    // Loaded once; `resolveEntry` appends each player it creates, so a later
    // line for the same player finds it.
    const { entries } = await loadRoster(ctx, order._id);
    const results: Array<{
      rosterEntryId: Id<"rosterEntries">;
      designId: Id<"designs">;
    }> = [];

    for (const line of args.lines) {
      if (!order.designIds.includes(line.designId))
        throw new ConvexError("That design isn't part of this order.");

      const sizeCheck = checkSize(line.size, run.sizeOptions);
      if (!sizeCheck.ok) throw new ConvexError(sizeCheck.error);
      const qtyCheck = checkQty(line.qty);
      if (!qtyCheck.ok) throw new ConvexError(qtyCheck.error);

      let entry: Doc<"rosterEntries">;
      if (line.rosterEntryId) {
        const picked = await ctx.db.get(line.rosterEntryId);
        if (
          !picked ||
          picked.removedAt !== undefined ||
          picked.orderId !== order._id ||
          !picked.name
        )
          throw new ConvexError(
            "That player is no longer on this order. Refresh the page and pick again.",
          );
        if (picked.designId !== line.designId)
          throw new ConvexError("That player is on a different design.");
        entry = picked;
      } else {
        const numberCheck = checkRosterNumber(line.number);
        if (!numberCheck.ok) throw new ConvexError(numberCheck.error);
        const itemNameCheck = checkItemName(line.name);
        if (!itemNameCheck.ok) throw new ConvexError(itemNameCheck.error);
        ({ entry } = await resolveEntry(
          ctx,
          order,
          line.designId,
          { name: itemNameCheck.value, number: numberCheck.value },
          { source: "fan", entries },
        ));
      }

      await insertSizeLine(ctx, entry, {
        size: sizeCheck.value,
        qty: qtyCheck.value,
        source: "fan",
        submission,
      });
      results.push({ rosterEntryId: entry._id, designId: line.designId });
    }

    return {
      submitterEmail: emailCheck.value,
      created: results.length,
      items: results,
    };
  },
});
