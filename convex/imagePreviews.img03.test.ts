// @vitest-environment node
/// <reference types="vite/client" />
// IMG-03 (backlog/IMG-03-stored-web-preview.md) Logic 1: imagePreviews.generate.
//
// Node environment, not edge-runtime: the action runs sharp, a native module.
// convex-test calls a "use node" action's handler in-process, so this is real
// sharp on real bytes, not a mock.
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import sharp from "sharp";
import type { FunctionReference } from "convex/server";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");

// `internal.imagePreviews` doesn't exist until the build, so type it by hand.
const generate = (
  internal as unknown as {
    imagePreviews: {
      generate: FunctionReference<
        "action",
        "internal",
        { assetId: Id<"designAssets"> }
      >;
    };
  }
).imagePreviews.generate;

async function seed(contentType: string, bytes: Uint8Array) {
  const t = convexTest(schema, modules);
  const { assetId, storageId } = await t.run(async (ctx) => {
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
      blocks: [],
      createdAt: now,
      updatedAt: now,
    });
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array(bytes)], { type: contentType }),
    );
    const assetId = await ctx.db.insert("designAssets", {
      designId,
      storageId,
      filename: "file",
      contentType,
      isMain: true,
      uploadedByUserId: userId,
      uploadedByAdmin: false,
      createdAt: now,
    });
    return { assetId, storageId };
  });
  const blobs = () =>
    t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).map((f) => f._id));
  const row = () =>
    t.run(
      (ctx) =>
        ctx.db.get(assetId) as Promise<
          (Record<string, unknown> & { previewStorageId?: Id<"_storage"> }) | null
        >,
    );
  return { t, assetId, storageId, blobs, row };
}

const widePng = () =>
  sharp({
    create: {
      width: 3200,
      height: 1000,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .png()
    .toBuffer();

describe("imagePreviews.generate", () => {
  it("a PNG asset gets a WebP preview no wider or taller than 2048 px, and previewStorageId is set", async () => {
    const { t, assetId, storageId, row } = await seed("image/png", await widePng());
    await t.action(generate, { assetId });

    const after = await row();
    expect(after?.previewStorageId, "previewStorageId set").toBeTruthy();
    expect(after!.previewStorageId).not.toBe(storageId);

    const bytes = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(after!.previewStorageId!);
      return new Uint8Array(await blob!.arrayBuffer());
    });
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width!).toBeLessThanOrEqual(2048);
    expect(meta.height!).toBeLessThanOrEqual(2048);
    // The original is untouched: downloads still serve it.
    expect(after!.storageId).toBe(storageId);
  });

  it("an asset deleted before it runs leaves no orphan blob", async () => {
    const { t, assetId, storageId, blobs } = await seed("image/png", await widePng());
    // The row is gone but its bytes are still readable: the worst race.
    await t.run((ctx) => ctx.db.delete(assetId));
    const before = await blobs();
    expect(before).toEqual([storageId]);

    await t.action(generate, { assetId });
    expect(await blobs(), "no preview blob left behind").toEqual([storageId]);
  });

  it("a PDF asset is skipped: no preview, no new blob", async () => {
    const { t, assetId, blobs, row } = await seed(
      "application/pdf",
      new TextEncoder().encode("%PDF-1.1\n%%EOF\n"),
    );
    const before = await blobs();
    await t.action(generate, { assetId });
    expect((await row())?.previewStorageId).toBeUndefined();
    expect(await blobs()).toEqual(before);
  });
});
