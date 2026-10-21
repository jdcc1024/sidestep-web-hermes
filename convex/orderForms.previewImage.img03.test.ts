// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// IMG-03 Logic 3: orderForms.getPublic serves the stored preview when there is one.
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

async function seed(withPreview: boolean) {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkId: "cap",
      email: "cap@example.com",
      name: "Cap",
      isAdmin: false,
      createdAt: now,
    });
    const designId = await ctx.db.insert("designs", {
      ownerId: userId,
      title: "Kit",
      blocks: overviewBlocks("x"),
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      captainId: userId,
      teamName: "Wildcats",
      sport: "Hockey",
      estimatedQuantity: 10,
      hasOwnDesign: false,
      designIds: [designId],
      internalStages: [],
      createdAt: now,
      updatedAt: now,
    });
    const orderFormId = await ctx.db.insert("orderForms", {
      orderId,
      captainId: userId,
      sizeOptions: ["M"],
      namesMode: "open",
      customQuestions: [],
      deadline: now + 7 * 86_400_000,
      status: "open",
      createdAt: now,
    });
    const storageId = await ctx.storage.store(
      new Blob(["x".repeat(10)], { type: "image/png" }),
    );
    const previewId = await ctx.storage.store(
      new Blob(["y"], { type: "image/webp" }),
    );
    const base = {
      designId,
      filename: "secret_name.png",
      contentType: "image/png",
      isMain: true,
      uploadedByUserId: userId,
      uploadedByAdmin: false,
      createdAt: now,
    };
    // previewStorageId is the field IMG-03 adds to the schema.
    await ctx.db.insert("designAssets", {
      ...base,
      storageId,
      ...(withPreview ? { previewStorageId: previewId } : {}),
    } as typeof base & { storageId: Id<"_storage"> });
    return {
      orderFormId,
      originalUrl: await ctx.storage.getUrl(storageId),
      previewUrl: await ctx.storage.getUrl(previewId),
    };
  });
  const main = async () => {
    const data = await t.query(api.orderForms.getPublic, {
      orderFormId: s.orderFormId,
    });
    return {
      data,
      image: data!.designs[0]!.mainImage as {
        url: string;
        contentType: string;
      } | null,
    };
  };
  return { ...s, main };
}

describe("getPublic mainImage with a stored preview", () => {
  it("with a preview, mainImage.url is the preview's URL, not the original's", async () => {
    const { main, previewUrl, originalUrl } = await seed(true);
    const { image, data } = await main();
    expect(image?.url).toBe(previewUrl);
    expect(image?.url).not.toBe(originalUrl);
    expect(JSON.stringify(data)).not.toContain(originalUrl!);
  });

  it("without one (not generated yet), mainImage is null and the payload never contains the original's URL (IMG-04)", async () => {
    const { main, originalUrl } = await seed(false);
    const { image, data } = await main();
    expect(image).toBeNull();
    expect(JSON.stringify(data)).not.toContain(originalUrl!);
  });
});
