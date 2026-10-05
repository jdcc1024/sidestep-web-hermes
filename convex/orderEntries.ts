// The public order form's write path. The module keeps its R-01 name because
// `api.orderEntries.submitOrder` is the form's API path; since L-06 it holds
// only that mutation and writes only `orderItems`.
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isListLocked, LIST_LOCKED_MESSAGE, loadItems } from "./_orderItems";
import {
  checkQty,
  checkSize,
  checkSubmitterEmail,
  checkSubmitterName,
} from "../lib/orderEntry/rules";
import {
  checkRosterNumber,
  rosterSlotKey,
} from "../lib/rosterEntry/rules";
import { checkItemName, summarize } from "../lib/orderItem";
import { checkCustomAnswer, isJerseyRunClosed } from "../lib/jerseyRunResponse/rules";

// Public — no auth. The order form's write path (R-02), moved onto order
// items by L-02 (docs/architecture/0004-order-items.md, "Must answer 3").
// One submission carries the player's identity plus 1..N jersey lines
// spanning the order's designs, and writes only `orderItems`:
//
// - Fill before insert. A line whose design + player key matches a fillable
//   item (live, no size, no submitter) fills the oldest one: size, qty,
//   submitter, answers and `orderFormId` are set, `source` is left alone. Filled
//   ids go into a Set so two lines never fill the same row.
// - Otherwise it inserts a `fan` item. Fixed mode copies the picked item's
//   name / number / letter (someone already sized it, or the same player
//   picked two sizes); open mode takes the typed name / number, and a blank
//   name keeps the number.
//
// Nothing is merged or rejected for repeating a player (JCC Q7). Grouping by
// submitter is emergent from the normalized email. Re-validates everything
// the client checked, since this is the one surface anyone on the internet
// can hit, and can never change a size already set or remove anything.
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
        itemId: v.optional(v.id("orderItems")),
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
    if (isJerseyRunClosed(run))
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
    const hasAnswers = Object.keys(customAnswers).length > 0;

    // The order's live items, oldest first: the fill candidates. Filled ids
    // are tracked so two lines in this submission never fill the same row;
    // rows inserted here are sized, so they are never candidates anyway.
    const existing = (await loadItems(ctx, order._id)).sort(
      (a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime,
    );
    const filled = new Set<Id<"orderItems">>();
    const isFillable = (item: Doc<"orderItems">) =>
      item.removedAt === undefined &&
      item.size === undefined &&
      item.submitterEmail === undefined &&
      !filled.has(item._id);

    const now = Date.now();
    const submission = {
      submitterName: nameCheck.value,
      submitterEmail: emailCheck.value,
      customAnswers: hasAnswers ? customAnswers : undefined,
      orderFormId: run._id,
      updatedAt: now,
    };
    const results: Array<{
      itemId: Id<"orderItems">;
      designId: Id<"designs">;
      filled: boolean;
    }> = [];

    for (const line of args.lines) {
      if (!order.designIds.includes(line.designId))
        throw new ConvexError("That design isn't part of this order.");

      const sizeCheck = checkSize(line.size, run.sizeOptions);
      if (!sizeCheck.ok) throw new ConvexError(sizeCheck.error);
      const qtyCheck = checkQty(line.qty);
      if (!qtyCheck.ok) throw new ConvexError(qtyCheck.error);
      const sized = { size: sizeCheck.value, qty: qtyCheck.value };

      // Who this line is: a picked player, or the typed name / number.
      let player: Pick<Doc<"orderItems">, "name" | "number" | "designation">;
      let target: Doc<"orderItems"> | undefined;
      if (line.itemId) {
        const picked = await ctx.db.get(line.itemId);
        if (
          !picked ||
          picked.removedAt !== undefined ||
          picked.orderId !== order._id ||
          picked.name === undefined
        )
          throw new ConvexError(
            "That player is no longer on this order. Refresh the page and pick again.",
          );
        if (picked.designId !== line.designId)
          throw new ConvexError("That player is on a different design.");
        player = {
          name: picked.name,
          number: picked.number,
          designation: picked.designation,
        };
        if (isFillable(picked)) target = picked;
      } else {
        const numberCheck = checkRosterNumber(line.number);
        if (!numberCheck.ok) throw new ConvexError(numberCheck.error);
        const itemNameCheck = checkItemName(line.name);
        if (!itemNameCheck.ok) throw new ConvexError(itemNameCheck.error);
        player = { name: itemNameCheck.value, number: numberCheck.value };
        const name = itemNameCheck.value;
        if (name !== undefined) {
          const key = rosterSlotKey(name, numberCheck.value);
          target = existing.find(
            (item) =>
              item.designId === line.designId &&
              item.name !== undefined &&
              rosterSlotKey(item.name, item.number) === key &&
              isFillable(item),
          );
        }
      }

      if (target) {
        await ctx.db.patch(target._id, { ...sized, ...submission });
        filled.add(target._id);
        results.push({ itemId: target._id, designId: line.designId, filled: true });
      } else {
        const itemId = await ctx.db.insert("orderItems", {
          orderId: order._id,
          designId: line.designId,
          ...player,
          ...sized,
          source: "fan",
          ...submission,
          createdAt: now,
        });
        results.push({ itemId, designId: line.designId, filled: false });
      }
    }

    // Collisions come from the same rule the captain's list shows
    // (`summarize`), read back after this submission's writes.
    const colliding = new Set<string>();
    const after = summarize(await loadItems(ctx, order._id), {
      designIds: order.designIds,
      titles: {},
      namesMode: run.namesMode,
    });
    for (const design of after.designs)
      for (const item of design.items)
        if (item.collision) colliding.add(item._id);
    const items = results.map((r) => ({
      ...r,
      collision: colliding.has(r.itemId),
    }));

    return {
      submitterEmail: emailCheck.value,
      created: items.length,
      collisions: items.filter((r) => r.collision).length,
      items,
    };
  },
});
