// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// IMG-03 Logic 2: designs.removeAsset deletes the preview blob with the original.
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");

async function seed() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const now = Date.now();
    const mkUser = (clerkId: string) =>
      ctx.db.insert("users", {
        clerkId,
        email: `${clerkId}@example.com`,
        name: clerkId,
        isAdmin: false,
        createdAt: now,
      });
    const ownerId = await mkUser("owner");
    await mkUser("stranger");
    const designId = await ctx.db.insert("designs", {
      ownerId,
      title: "Kit",
      blocks: [],
      createdAt: now,
      updatedAt: now,
    });
    const blob = (type: string) =>
      ctx.storage.store(new Blob(["x"], { type }));
    const originalId = await blob("image/png");
    const previewId = await blob("image/webp");
    const keepId = await blob("image/png");
    const base = {
      designId,
      filename: "a.png",
      contentType: "image/png",
      isMain: false,
      uploadedByUserId: ownerId,
      uploadedByAdmin: false,
      createdAt: now,
    };
    // previewStorageId is the field IMG-03 adds to the schema.
    const assetId = await ctx.db.insert("designAssets", {
      ...base,
      storageId: originalId,
      previewStorageId: previewId,
    } as typeof base & { storageId: Id<"_storage"> });
    await ctx.db.insert("designAssets", { ...base, storageId: keepId });
    return { assetId, originalId, previewId };
  });
  const exists = (id: Id<"_storage">) =>
    t.run(async (ctx) => (await ctx.db.system.get(id)) !== null);
  const as = (subject: string) =>
    t.withIdentity({ subject, email: `${subject}@example.com`, name: subject });
  return { t, ...s, exists, as };
}

describe("designs.removeAsset and the preview blob", () => {
  it("deletes the original and the preview", async () => {
    const { assetId, originalId, previewId, exists, as } = await seed();
    await as("owner").mutation(api.designs.removeAsset, { assetId });
    expect(await exists(originalId), "original gone").toBe(false);
    expect(await exists(previewId), "preview gone").toBe(false);
  });

  it("refuses a non-owner non-admin and deletes neither blob", async () => {
    const { t, assetId, originalId, previewId, exists, as } = await seed();
    await expect(
      as("stranger").mutation(api.designs.removeAsset, { assetId }),
    ).rejects.toThrow();
    expect(await exists(originalId)).toBe(true);
    expect(await exists(previewId)).toBe(true);
    expect(await t.run((ctx) => ctx.db.get(assetId))).not.toBeNull();
  });
});
