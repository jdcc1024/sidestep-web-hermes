import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Round-trips one record through every table to prove the schema accepts the
 * shapes documented in backlog/1-02-database-schema.md. Run with:
 *   npx convex run _schemaSmokeTest:run
 * Inserts then deletes — no residue.
 *
 * `designAssets` needs a real storage id, and a mutation can't create one
 * (ctx.storage.store is action-only), so that table is only round-tripped
 * when you pass an id from an existing upload:
 *   npx convex run _schemaSmokeTest:run '{"storageId": "<id>"}'
 * The storage object itself is left alone — we only insert/delete the row.
 */
export const run = internalMutation({
  args: { storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, { storageId }) => {
    const now = Date.now();

    const userId = await ctx.db.insert("users", {
      clerkId: "smoke_clerk_id",
      email: "smoke@example.com",
      name: "Smoke User",
      isAdmin: false,
      createdAt: now,
    });

    // One of every block kind, so the union in the schema is round-tripped
    // rather than just its first member.
    const designId = await ctx.db.insert("designs", {
      ownerId: userId,
      title: "Smoke Design",
      blocks: [
        { id: "smoke-overview", kind: "text", field: "overview", body: "smoke" },
        { id: "smoke-gallery", kind: "gallery", caption: "Smoke", assetIds: [] },
        {
          id: "smoke-palette",
          kind: "palette",
          swatches: [
            {
              id: "smoke-swatch",
              hex: "#102A44",
              role: "primary",
              label: "Navy",
              pantoneCode: "289 C",
            },
          ],
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const designAssetId = storageId
      ? await ctx.db.insert("designAssets", {
          designId,
          storageId,
          filename: "smoke.png",
          contentType: "image/png",
          isMain: true,
          uploadedByUserId: userId,
          uploadedByAdmin: false,
          createdAt: now,
        })
      : null;

    const orderId = await ctx.db.insert("orders", {
      captainId: userId,
      teamName: "Smoke FC",
      sport: "soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds: [designId],
      internalStages: [{ name: "Inquiry", completedAt: now }],
      createdAt: now,
      updatedAt: now,
    });

    const orderFormId = await ctx.db.insert("orderForms", {
      orderId,
      captainId: userId,
      sizeOptions: ["S", "M", "L"],
      namesMode: "open",
      customQuestions: [{ id: "q1", label: "Delivery method?" }],
      deadline: now + 7 * 24 * 60 * 60 * 1000,
      status: "open",
      createdAt: now,
    });

    const rosterEntryId = await ctx.db.insert("rosterEntries", {
      orderId,
      designId,
      name: "Gretzky",
      number: "99",
      designation: "C",
      source: "fan",
      createdAt: now,
      updatedAt: now,
    });

    const orderItemId = await ctx.db.insert("orderItems", {
      orderId,
      rosterEntryId,
      size: "L",
      qty: 2,
      source: "fan",
      submitterName: "Fan One",
      submitterEmail: "fan@example.com",
      customAnswers: { q1: "pickup" },
      orderFormId,
      createdAt: now,
      updatedAt: now,
    });

    const intakeId = await ctx.db.insert("intakes", {
      name: "Lead Person",
      teamName: "Lead Team",
      sport: "basketball",
      estimatedQuantity: 20,
      brief: "looking for jerseys",
      submittedAt: now,
    });

    const inserted = {
      user: await ctx.db.get(userId),
      design: await ctx.db.get(designId),
      ...(designAssetId
        ? { designAsset: await ctx.db.get(designAssetId) }
        : {}),
      order: await ctx.db.get(orderId),
      run: await ctx.db.get(orderFormId),
      rosterEntry: await ctx.db.get(rosterEntryId),
      orderItem: await ctx.db.get(orderItemId),
      intake: await ctx.db.get(intakeId),
    };

    for (const [name, doc] of Object.entries(inserted)) {
      if (!doc) throw new Error(`smoke test: ${name} round-trip returned null`);
    }
    if (inserted.order!.internalStages[0].name !== "Inquiry") {
      throw new Error("smoke test: nested stage field lost in round-trip");
    }
    if (inserted.orderItem!.customAnswers?.q1 !== "pickup") {
      throw new Error("smoke test: customAnswers record lost in round-trip");
    }

    await ctx.db.delete(orderItemId);
    await ctx.db.delete(rosterEntryId);
    await ctx.db.delete(orderFormId);
    await ctx.db.delete(orderId);
    if (designAssetId) await ctx.db.delete(designAssetId);
    await ctx.db.delete(designId);
    await ctx.db.delete(intakeId);
    await ctx.db.delete(userId);

    return { ok: true, tablesChecked: Object.keys(inserted).length };
  },
});
