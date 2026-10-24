// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// B-09 Logic: designs.removeAsset and designs.setMainAsset when a file's
// original is missing from storage (row kept, blob gone).
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
    const base = {
      designId,
      contentType: "image/png",
      isMain: false,
      uploadedByUserId: ownerId,
      uploadedByAdmin: false,
      createdAt: now,
    };
    const presentOriginal = await blob("image/png");
    const present = await ctx.db.insert("designAssets", {
      ...base,
      filename: "present.png",
      storageId: presentOriginal,
      isMain: true,
    });
    // The gone file: has a preview, and its original is deleted below.
    const goneOriginal = await blob("image/png");
    const gonePreview = await blob("image/webp");
    const gone = await ctx.db.insert("designAssets", {
      ...base,
      filename: "gone.png",
      storageId: goneOriginal,
      previewStorageId: gonePreview,
    } as typeof base & { filename: string; storageId: Id<"_storage"> });
    await ctx.storage.delete(goneOriginal);
    await ctx.db.patch(designId, {
      blocks: [
        { id: "g1", kind: "gallery", assetIds: [present, gone] },
      ] as never,
    });
    return { designId, present, gone, gonePreview };
  });
  const exists = (id: Id<"_storage">) =>
    t.run(async (ctx) => (await ctx.db.system.get(id)) !== null);
  const row = (id: Id<"designAssets">) => t.run((ctx) => ctx.db.get(id));
  const as = (subject: string) =>
    t.withIdentity({ subject, email: `${subject}@example.com`, name: subject });
  return { t, ...s, exists, row, as };
}

describe("B-09 designs.removeAsset on a file whose original is gone", () => {
  it("removes it: row gone, preview blob gone, galleries stripped", async () => {
    const { t, designId, present, gone, gonePreview, exists, row, as } =
      await seed();
    await as("owner").mutation(api.designs.removeAsset, { assetId: gone });
    expect(await row(gone), "row deleted").toBeNull();
    expect(await exists(gonePreview), "preview deleted").toBe(false);
    expect(await row(present), "the other file stays").not.toBeNull();
    const design = await t.run((ctx) => ctx.db.get(designId));
    expect(JSON.stringify(design!.blocks)).not.toContain(gone);
    expect(JSON.stringify(design!.blocks)).toContain(present);
  });

  it("refuses a different captain and changes nothing", async () => {
    const { gone, gonePreview, exists, row, as } = await seed();
    await expect(
      as("stranger").mutation(api.designs.removeAsset, { assetId: gone }),
    ).rejects.toThrow();
    expect(await row(gone)).not.toBeNull();
    expect(await exists(gonePreview)).toBe(true);
  });

  it("still refuses to remove the design's last file", async () => {
    const { present, gone, row, as } = await seed();
    await as("owner").mutation(api.designs.removeAsset, { assetId: gone });
    await expect(
      as("owner").mutation(api.designs.removeAsset, { assetId: present }),
    ).rejects.toThrow(/at least one file/i);
    expect(await row(present)).not.toBeNull();
  });
});

describe("B-09 designs.setMainAsset", () => {
  it("sets a present file as main", async () => {
    const { t, designId, present, gone, row, as } = await seed();
    // Make the gone file main first so the move to `present` is a real change.
    await t.run((ctx) => ctx.db.patch(gone, { isMain: true }));
    await t.run((ctx) => ctx.db.patch(present, { isMain: false }));
    await as("owner").mutation(api.designs.setMainAsset, { assetId: present });
    expect((await row(present))!.isMain).toBe(true);
    expect((await row(gone))!.isMain).toBe(false);
    expect(designId).toBeTruthy();
  });

  it("refuses a different captain", async () => {
    const { t, present, gone, row, as } = await seed();
    await t.run((ctx) => ctx.db.patch(present, { isMain: false }));
    await t.run((ctx) => ctx.db.patch(gone, { isMain: true }));
    await expect(
      as("stranger").mutation(api.designs.setMainAsset, { assetId: present }),
    ).rejects.toThrow();
    expect((await row(present))!.isMain).toBe(false);
  });

  it("refuses a file whose original is gone and keeps the current main", async () => {
    const { gone, present, row, as } = await seed();
    await expect(
      as("owner").mutation(api.designs.setMainAsset, { assetId: gone }),
    ).rejects.toThrow(/missing/i);
    expect((await row(gone))!.isMain).toBe(false);
    expect((await row(present))!.isMain).toBe(true);
  });
});
