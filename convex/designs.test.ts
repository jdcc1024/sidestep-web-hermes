// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks, overviewOf } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

// Schema-aware handle so the helpers below can query our own indexes — the
// bare ReturnType<typeof convexTest> widens the data model away.
type Test = TestConvex<typeof schema>;

async function seedOwner(t: Test, subject = "user_owner_clerk") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: subject,
      email: "owner@example.com",
      name: "Owner",
      isAdmin: false,
      createdAt: Date.now(),
    }),
  );
  return {
    userId,
    asUser: t.withIdentity({
      subject,
      email: "owner@example.com",
      name: "Owner",
    }),
  };
}

// Storage ids in convex-test are opaque strings shaped like real ones via
// ctx.storage.store. We don't need real bytes — the validators accept any
// v.id("_storage").
async function fakeStorageId(t: Test) {
  return t.run((ctx) =>
    ctx.storage.store(new Blob(["x"], { type: "text/plain" })),
  );
}

// One uploaded-file payload as the client sends it: the storage id from the
// two-phase upload plus the metadata only the browser knows.
async function fakeFile(
  t: Test,
  overrides: { filename?: string; contentType?: string } = {},
) {
  return {
    storageId: await fakeStorageId(t),
    filename: overrides.filename ?? "mood-board.png",
    contentType: overrides.contentType ?? "image/png",
  };
}

async function assetsOf(
  t: Test,
  designId: Id<"designs">,
) {
  return t.run((ctx) =>
    ctx.db
      .query("designAssets")
      .withIndex("by_design", (q) => q.eq("designId", designId))
      .collect(),
  );
}

describe("designs.createDesign", () => {
  it("inserts a design owned by the caller", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedOwner(t);
    const file = await fakeFile(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Away kit concept",
      blocks: overviewBlocks("Navy with gold accents."),
      files: [file],
    });

    const row = await t.run((ctx) => ctx.db.get(designId));
    expect(row).toMatchObject({ ownerId: userId, title: "Away kit concept" });
    expect(overviewOf(row!.blocks)).toBe("Navy with gold accents.");
  });

  it("creates one asset row per file with its metadata and provenance", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedOwner(t);
    const png = await fakeFile(t, { filename: "crest.png" });
    const pdf = await fakeFile(t, {
      filename: "print-template.pdf",
      contentType: "application/pdf",
    });

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Away kit concept",
      blocks: overviewBlocks("Navy with gold accents."),
      files: [png, pdf],
    });

    const assets = await assetsOf(t, designId);
    expect(assets).toHaveLength(2);
    expect(assets.map((a) => a.storageId)).toEqual([
      png.storageId,
      pdf.storageId,
    ]);
    expect(assets[0]).toMatchObject({
      designId,
      filename: "crest.png",
      contentType: "image/png",
      isMain: false,
      uploadedByUserId: userId,
      uploadedByAdmin: false,
    });
    expect(assets[1]).toMatchObject({
      filename: "print-template.pdf",
      contentType: "application/pdf",
    });
  });

  it("normalizes a blank filename and a parameterized content type", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);
    const storageId = await fakeStorageId(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Odd upload",
      blocks: overviewBlocks("Brief."),
      files: [
        { storageId, filename: "   ", contentType: "IMAGE/SVG+XML; charset=utf-8" },
      ],
    });

    const [asset] = await assetsOf(t, designId);
    expect(asset).toMatchObject({
      filename: "Untitled file",
      contentType: "image/svg+xml",
    });
  });

  it("snapshots admin provenance on an admin's upload", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_admin_clerk",
        email: "staff@sidestep.test",
        name: "Staff",
        isAdmin: true,
        createdAt: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({
      subject: "user_admin_clerk",
      email: "staff@sidestep.test",
      name: "Staff",
    });

    const designId = await asAdmin.mutation(api.designs.createDesign, {
      title: "Staff mock-up",
      blocks: overviewBlocks("Drafted internally."),
      files: [await fakeFile(t)],
    });

    const [asset] = await assetsOf(t, designId);
    expect(asset?.uploadedByAdmin).toBe(true);
  });

  it("rejects createDesign when no files are attached", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);
    await expect(
      asUser.mutation(api.designs.createDesign, {
        title: "Empty",
        blocks: overviewBlocks("Has a brief but no files."),
        files: [],
      }),
    ).rejects.toThrow(/At least one file/);
  });

  it("persists silhouette specs when supplied", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Home kit",
      blocks: overviewBlocks("Bold stripes."),
      files: [await fakeFile(t)],
      jerseyStyle: "  Soccer jersey  ",
      neckline: "Crew Neck",
      sleeveStyle: "Raglan",
    });

    const row = await t.run((ctx) => ctx.db.get(designId));
    expect(row).toMatchObject({
      // jerseyStyle is trimmed; neckline / sleeve match the allowlists.
      jerseyStyle: "Soccer jersey",
      neckline: "Crew Neck",
      sleeveStyle: "Raglan",
    });
  });

  it("creates a design with no specs (specs are optional)", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Idea only",
      blocks: overviewBlocks("No cut decided yet."),
      files: [await fakeFile(t)],
    });

    const row = await t.run((ctx) => ctx.db.get(designId));
    expect(row?.neckline).toBeUndefined();
    expect(row?.sleeveStyle).toBeUndefined();
    expect(row?.jerseyStyle).toBeUndefined();
  });

  it("rejects an invalid neckline", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    await expect(
      asUser.mutation(api.designs.createDesign, {
        title: "Bad cut",
        blocks: overviewBlocks("Brief."),
        files: [await fakeFile(t)],
        neckline: "Turtle",
      }),
    ).rejects.toThrow(/neckline/i);
  });

  it("rejects an invalid sleeve style", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    await expect(
      asUser.mutation(api.designs.createDesign, {
        title: "Bad sleeve",
        blocks: overviewBlocks("Brief."),
        files: [await fakeFile(t)],
        sleeveStyle: "Sleeveless",
      }),
    ).rejects.toThrow(/sleeve/i);
  });
});

describe("designs.updateDesign", () => {
  it("updates metadata for a design the caller owns", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "First pass",
      blocks: overviewBlocks("Initial brief."),
      files: [await fakeFile(t)],
    });

    await asUser.mutation(api.designs.updateDesign, {
      designId,
      title: "Revised pass",
      blocks: overviewBlocks("Updated brief."),
      addFiles: [],
    });

    const row = await t.run((ctx) => ctx.db.get(designId));
    expect(row).toMatchObject({ title: "Revised pass" });
    expect(overviewOf(row!.blocks)).toBe("Updated brief.");
    expect(await assetsOf(t, designId)).toHaveLength(1);
  });

  it("appends asset rows for newly uploaded files", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Growing design",
      blocks: overviewBlocks("Brief."),
      files: [await fakeFile(t, { filename: "first.png" })],
    });

    await asUser.mutation(api.designs.updateDesign, {
      designId,
      title: "Growing design",
      blocks: overviewBlocks("Brief."),
      addFiles: [await fakeFile(t, { filename: "second.jpg", contentType: "image/jpeg" })],
    });

    const assets = await assetsOf(t, designId);
    expect(assets.map((a) => a.filename)).toEqual(["first.png", "second.jpg"]);
  });

  it("rejects an update that would leave the design with no files", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Only file",
      blocks: overviewBlocks("Brief."),
      files: [await fakeFile(t)],
    });
    // Simulate the pre-D-05 state where a design somehow has no assets — the
    // guard has to hold on the asset rows, not on the submitted array.
    await t.run(async (ctx) => {
      for (const asset of await ctx.db
        .query("designAssets")
        .withIndex("by_design", (q) => q.eq("designId", designId))
        .collect())
        await ctx.db.delete(asset._id);
    });

    await expect(
      asUser.mutation(api.designs.updateDesign, {
        designId,
        title: "Only file",
        blocks: overviewBlocks("Brief."),
        addFiles: [],
      }),
    ).rejects.toThrow(/At least one file/);
  });

  it("updates silhouette specs when supplied", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Spec edit",
      blocks: overviewBlocks("Initial."),
      files: [await fakeFile(t)],
    });

    await asUser.mutation(api.designs.updateDesign, {
      designId,
      title: "Spec edit",
      blocks: overviewBlocks("Initial."),
      addFiles: [],
      jerseyStyle: "Hockey jersey",
      neckline: "V-Neck",
      sleeveStyle: "Regular",
    });

    const row = await t.run((ctx) => ctx.db.get(designId));
    expect(row).toMatchObject({
      jerseyStyle: "Hockey jersey",
      neckline: "V-Neck",
      sleeveStyle: "Regular",
    });
  });

  it("rejects updateDesign when the caller doesn't own the design", async () => {
    const t = convexTest(schema, modules);
    const { asUser: asOwner } = await seedOwner(t, "user_owner_clerk");
    const designId = await asOwner.mutation(api.designs.createDesign, {
      title: "Owned by Owner",
      blocks: overviewBlocks("Brief."),
      files: [await fakeFile(t)],
    });

    // A second user, freshly synced.
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_intruder_clerk",
        email: "intruder@example.com",
        name: "Intruder",
        isAdmin: false,
        createdAt: Date.now(),
      }),
    );
    const asIntruder = t.withIdentity({
      subject: "user_intruder_clerk",
      email: "intruder@example.com",
      name: "Intruder",
    });

    await expect(
      asIntruder.mutation(api.designs.updateDesign, {
        designId,
        title: "Hijacked",
        blocks: overviewBlocks("Hijack."),
        addFiles: [],
      }),
    ).rejects.toThrow(/don't have access/);
  });
});

describe("designs.getMyDesign", () => {
  it("returns assets with resolved URLs and the resolved main image", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "With files",
      blocks: overviewBlocks("Brief."),
      files: [
        await fakeFile(t, {
          filename: "spec.pdf",
          contentType: "application/pdf",
        }),
        await fakeFile(t, { filename: "crest.png" }),
      ],
    });

    const design = await asUser.query(api.designs.getMyDesign, { designId });
    expect(design?.assets.map((a) => a.filename)).toEqual([
      "spec.pdf",
      "crest.png",
    ]);
    for (const asset of design?.assets ?? [])
      expect(typeof asset.url).toBe("string");
    // The PDF is older, so the first web-safe image wins.
    expect(design?.mainAsset?.filename).toBe("crest.png");
  });

  it("returns a null main asset when no file is an image", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Docs only",
      blocks: overviewBlocks("Brief."),
      files: [
        await fakeFile(t, {
          filename: "spec.pdf",
          contentType: "application/pdf",
        }),
      ],
    });

    const design = await asUser.query(api.designs.getMyDesign, { designId });
    expect(design?.mainAsset).toBeNull();
  });

  it("refuses a design the caller doesn't own", async () => {
    const t = convexTest(schema, modules);
    const { asUser: asOwner } = await seedOwner(t, "user_owner_clerk");
    const designId = await asOwner.mutation(api.designs.createDesign, {
      title: "Private",
      blocks: overviewBlocks("Brief."),
      files: [await fakeFile(t)],
    });

    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_intruder_clerk",
        email: "intruder@example.com",
        name: "Intruder",
        isAdmin: false,
        createdAt: Date.now(),
      }),
    );

    await expect(
      t
        .withIdentity({ subject: "user_intruder_clerk" })
        .query(api.designs.getMyDesign, { designId }),
    ).rejects.toThrow(/don't have access/);
  });
});

describe("designs.listMyDesigns", () => {
  it("carries a file count per design", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    await asUser.mutation(api.designs.createDesign, {
      title: "Two files",
      blocks: overviewBlocks("Brief."),
      files: [await fakeFile(t), await fakeFile(t)],
    });

    const designs = await asUser.query(api.designs.listMyDesigns, {});
    expect(designs).toHaveLength(1);
    expect(designs[0]?.fileCount).toBe(2);
  });
});

describe("designs.generateUploadUrl", () => {
  it("returns an upload URL string for an authenticated user", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);
    const url = await asUser.mutation(api.designs.generateUploadUrl, {});
    expect(typeof url).toBe("string");
    expect(url).toContain("http");
  });

  it("rejects generateUploadUrl when caller is unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.designs.generateUploadUrl, {}),
    ).rejects.toThrow(/Not authenticated/);
  });
});

// ─── D-02 Block model ──────────────────────────────────────────────────

describe("design blocks", () => {
  const overview = {
    id: "b-overview",
    kind: "text" as const,
    field: "overview" as const,
    body: "Navy and gold.",
  };

  it("stores text, gallery and palette blocks in the order they were sent", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Away kit",
      blocks: [
        { id: "g1", kind: "gallery", caption: "Mood board", assetIds: [] },
        overview,
        {
          id: "p1",
          kind: "palette",
          swatches: [
            { id: "s1", hex: "#102A44", role: "primary", pantoneCode: "289 C" },
          ],
        },
      ],
      files: [await fakeFile(t)],
    });

    const row = await t.run((ctx) => ctx.db.get(designId));
    expect(row!.blocks.map((b) => b.id)).toEqual(["g1", "b-overview", "p1"]);
  });

  it("normalizes swatch hexes and trims bodies before storing", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Away kit",
      blocks: [
        { ...overview, body: "  Navy and gold.  " },
        {
          id: "p1",
          kind: "palette",
          caption: "   ",
          swatches: [{ id: "s1", hex: "102a44" }],
        },
      ],
      files: [await fakeFile(t)],
    });

    const row = await t.run((ctx) => ctx.db.get(designId));
    expect(overviewOf(row!.blocks)).toBe("Navy and gold.");
    const paletteBlock = row!.blocks.find((b) => b.kind === "palette")!;
    expect(paletteBlock.swatches[0]!.hex).toBe("#102A44");
    expect(paletteBlock.caption).toBeUndefined();
  });

  it("rejects a design with no overview section", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    await expect(
      asUser.mutation(api.designs.createDesign, {
        title: "Away kit",
        blocks: [{ id: "g1", kind: "gallery", assetIds: [] }],
        files: [await fakeFile(t)],
      }),
    ).rejects.toThrow(/overview/i);
  });

  it("rejects a second palette block", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    await expect(
      asUser.mutation(api.designs.createDesign, {
        title: "Away kit",
        blocks: [
          overview,
          { id: "p1", kind: "palette", swatches: [] },
          { id: "p2", kind: "palette", swatches: [] },
        ],
        files: [await fakeFile(t)],
      }),
    ).rejects.toThrow(/one palette/i);
  });

  it("rejects a swatch whose hex isn't a color", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    await expect(
      asUser.mutation(api.designs.createDesign, {
        title: "Away kit",
        blocks: [
          overview,
          {
            id: "p1",
            kind: "palette",
            swatches: [{ id: "s1", hex: "navy" }],
          },
        ],
        files: [await fakeFile(t)],
      }),
    ).rejects.toThrow(/color/i);
  });

  it("rejects the same text section twice", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    await expect(
      asUser.mutation(api.designs.createDesign, {
        title: "Away kit",
        blocks: [
          overview,
          { id: "n1", kind: "text", field: "notes", body: "One" },
          { id: "n2", kind: "text", field: "notes", body: "Two" },
        ],
        files: [await fakeFile(t)],
      }),
    ).rejects.toThrow(/notes/i);
  });

  it("persists a reordered block array on update", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);
    const gallery = { id: "g1", kind: "gallery" as const, assetIds: [] };

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Away kit",
      blocks: [overview, gallery],
      files: [await fakeFile(t)],
    });

    await asUser.mutation(api.designs.updateDesign, {
      designId,
      title: "Away kit",
      blocks: [gallery, overview],
      addFiles: [],
    });

    const row = await t.run((ctx) => ctx.db.get(designId));
    expect(row!.blocks.map((b) => b.id)).toEqual(["g1", "b-overview"]);
  });

  it("returns blocks alongside resolved assets from getMyDesign", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Away kit",
      blocks: [overview],
      files: [await fakeFile(t)],
    });

    const design = await asUser.query(api.designs.getMyDesign, { designId });
    expect(design!.blocks).toHaveLength(1);
    expect(overviewOf(design!.blocks)).toBe("Navy and gold.");
    expect(design!.assets).toHaveLength(1);
  });
});
