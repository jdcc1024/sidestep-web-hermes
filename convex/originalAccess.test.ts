// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// IMG-05 edges the acceptance file doesn't cover: the single gate itself, and
// what reads and Download answer once an original's bytes are gone.
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { canAccessOriginal } from "./_designAssets";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (clerkId: string, isAdmin: boolean) =>
      ctx.db.insert("users", {
        clerkId,
        email: `${clerkId}@example.com`,
        name: clerkId,
        isAdmin,
        createdAt: now,
      });
    const ownerId = await user("owner", false);
    const strangerId = await user("stranger", false);
    const staffId = await user("staff", true);
    const designId = await ctx.db.insert("designs", {
      ownerId,
      title: "Kit",
      blocks: overviewBlocks("x"),
      createdAt: now,
      updatedAt: now,
    });
    const storageId = await ctx.storage.store(
      new Blob(["original"], { type: "image/png" }),
    );
    const assetId = await ctx.db.insert("designAssets", {
      designId,
      storageId,
      filename: "crest.png",
      contentType: "image/png",
      isMain: true,
      uploadedByUserId: ownerId,
      uploadedByAdmin: false,
      createdAt: now,
    });
    return { ownerId, strangerId, staffId, designId, storageId, assetId };
  });
  const asOwner = t.withIdentity({
    subject: "owner",
    email: "owner@example.com",
    name: "owner",
  });
  return { t, asOwner, ...ids };
}

describe("canAccessOriginal", () => {
  it("should allow the design's owner", async () => {
    const s = await seed();
    const allowed = await s.t.run(async (ctx) =>
      canAccessOriginal(ctx, s.designId, (await ctx.db.get(s.ownerId))!),
    );
    expect(allowed).toBe(true);
  });

  it("should allow an admin who doesn't own the design", async () => {
    const s = await seed();
    const allowed = await s.t.run(async (ctx) =>
      canAccessOriginal(ctx, s.designId, (await ctx.db.get(s.staffId))!),
    );
    expect(allowed).toBe(true);
  });

  it("should refuse a different captain", async () => {
    const s = await seed();
    const allowed = await s.t.run(async (ctx) =>
      canAccessOriginal(ctx, s.designId, (await ctx.db.get(s.strangerId))!),
    );
    expect(allowed).toBe(false);
  });

  it("should refuse when the design no longer exists", async () => {
    const s = await seed();
    const allowed = await s.t.run(async (ctx) => {
      await ctx.db.delete(s.designId);
      return canAccessOriginal(ctx, s.designId, (await ctx.db.get(s.ownerId))!);
    });
    expect(allowed).toBe(false);
  });
});

describe("when an original's bytes are gone", () => {
  it("should report hasFile false on the design page's assets", async () => {
    const s = await seed();
    await s.t.run((ctx) => ctx.storage.delete(s.storageId));
    const design = await s.asOwner.query(api.designs.getMyDesign, {
      designId: s.designId,
    });
    expect(design!.assets[0]!.hasFile).toBe(false);
  });

  it("should report hasFile false on a summary's main image", async () => {
    const s = await seed();
    await s.t.run((ctx) => ctx.storage.delete(s.storageId));
    const [card] = await s.asOwner.query(api.designs.listMyDesigns, {});
    expect(card!.mainImage!.hasFile).toBe(false);
  });

  it("should give the owner null from originalUrl", async () => {
    const s = await seed();
    await s.t.run((ctx) => ctx.storage.delete(s.storageId));
    const url = await s.asOwner.query(api.designs.originalUrl, {
      assetId: s.assetId,
    });
    expect(url).toBeNull();
  });
});
