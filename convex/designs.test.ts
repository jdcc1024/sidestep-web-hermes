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

  it("leaves blocks untouched when updateDesign omits them", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);

    const designId = await asUser.mutation(api.designs.createDesign, {
      title: "Away kit",
      blocks: [overview, { id: "g1", kind: "gallery", assetIds: [] }],
      files: [await fakeFile(t)],
    });

    // The edit form owns title/specs/files; the block editor owns blocks. A
    // form submit must not clobber a brief the editor just changed.
    await asUser.mutation(api.designs.updateDesign, {
      designId,
      title: "Away kit v2",
      addFiles: [],
    });

    const row = await t.run((ctx) => ctx.db.get(designId));
    expect(row!.title).toBe("Away kit v2");
    expect(row!.blocks.map((b) => b.id)).toEqual(["b-overview", "g1"]);
  });
});

// The block editor's write path (D-03). Each operation is its own mutation so
// the client sends the change, not a whole array it might be holding stale —
// and every one of them re-runs the D-02 validators server-side.
describe("design block mutations", () => {
  const overview = {
    id: "b-overview",
    kind: "text" as const,
    field: "overview" as const,
    body: "Navy and gold.",
  };
  const gallery = { id: "g1", kind: "gallery" as const, assetIds: [] };

  type AsUser = Awaited<ReturnType<typeof seedOwner>>["asUser"];

  async function seedDesign(t: Test, asUser: AsUser) {
    return asUser.mutation(api.designs.createDesign, {
      title: "Away kit",
      blocks: [overview, gallery],
      files: [await fakeFile(t)],
    });
  }

  async function seedAdmin(t: Test) {
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_staff_clerk",
        email: "staff@sidestep.test",
        name: "Staff",
        isAdmin: true,
        createdAt: Date.now(),
      }),
    );
    return t.withIdentity({
      subject: "user_staff_clerk",
      email: "staff@sidestep.test",
      name: "Staff",
    });
  }

  async function blockIds(t: Test, designId: Id<"designs">) {
    const row = await t.run((ctx) => ctx.db.get(designId));
    return row!.blocks.map((b) => b.id);
  }

  describe("addBlock", () => {
    it("appends a new text section to the end of the brief", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await asUser.mutation(api.designs.addBlock, {
        designId,
        block: {
          id: "c1",
          kind: "text",
          field: "concept",
          body: "  Retro stripes.  ",
        },
      });

      const row = await t.run((ctx) => ctx.db.get(designId));
      expect(row!.blocks.map((b) => b.id)).toEqual(["b-overview", "g1", "c1"]);
      const concept = row!.blocks.find(
        (b) => b.kind === "text" && b.field === "concept",
      )!;
      expect(concept.kind === "text" && concept.body).toBe("Retro stripes.");
    });

    it("rejects a section the design already uses", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await expect(
        asUser.mutation(api.designs.addBlock, {
          designId,
          block: { id: "o2", kind: "text", field: "overview", body: "Again." },
        }),
      ).rejects.toThrow(/overview can only appear once/i);
    });

    it("rejects an empty text body", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await expect(
        asUser.mutation(api.designs.addBlock, {
          designId,
          block: { id: "c1", kind: "text", field: "concept", body: "   " },
        }),
      ).rejects.toThrow(/can't be empty/i);
    });

    it("rejects a second palette", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await asUser.mutation(api.designs.createDesign, {
        title: "Away kit",
        blocks: [overview, { id: "p1", kind: "palette", swatches: [] }],
        files: [await fakeFile(t)],
      });

      await expect(
        asUser.mutation(api.designs.addBlock, {
          designId,
          block: { id: "p2", kind: "palette", swatches: [] },
        }),
      ).rejects.toThrow(/one palette/i);
    });

    it("rejects a block id already on the design", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await expect(
        asUser.mutation(api.designs.addBlock, {
          designId,
          block: { id: "g1", kind: "gallery", assetIds: [] },
        }),
      ).rejects.toThrow(/same id/i);
    });

    it("refuses a caller who neither owns the design nor is an admin", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const { asUser: asStranger } = await seedOwner(t, "user_stranger_clerk");

      await expect(
        asStranger.mutation(api.designs.addBlock, {
          designId,
          block: { id: "c1", kind: "text", field: "concept", body: "Mine now." },
        }),
      ).rejects.toThrow(/access/i);
      expect(await blockIds(t, designId)).toEqual(["b-overview", "g1"]);
    });

    it("lets an admin edit someone else's design — same editor, same rules", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const asAdmin = await seedAdmin(t);

      await asAdmin.mutation(api.designs.addBlock, {
        designId,
        block: { id: "n1", kind: "text", field: "notes", body: "Staff note." },
      });

      expect(await blockIds(t, designId)).toEqual(["b-overview", "g1", "n1"]);
    });

    it("rejects an unauthenticated caller", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await expect(
        t.mutation(api.designs.addBlock, {
          designId,
          block: { id: "c1", kind: "text", field: "concept", body: "Hi." },
        }),
      ).rejects.toThrow(/Not authenticated/);
    });
  });

  describe("updateBlock", () => {
    it("rewrites a block in place, keeping its position", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await asUser.mutation(api.designs.updateBlock, {
        designId,
        block: { ...overview, body: "Charcoal with a gold sash." },
      });

      const row = await t.run((ctx) => ctx.db.get(designId));
      expect(row!.blocks.map((b) => b.id)).toEqual(["b-overview", "g1"]);
      expect(overviewOf(row!.blocks)).toBe("Charcoal with a gold sash.");
    });

    it("bumps updatedAt so list surfaces resort", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const before = (await t.run((ctx) => ctx.db.get(designId)))!.updatedAt;

      await asUser.mutation(api.designs.updateBlock, {
        designId,
        block: { ...overview, body: "Revised." },
      });

      const after = (await t.run((ctx) => ctx.db.get(designId)))!.updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it("rejects a block that isn't on the design", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await expect(
        asUser.mutation(api.designs.updateBlock, {
          designId,
          block: { id: "ghost", kind: "text", field: "notes", body: "Hi." },
        }),
      ).rejects.toThrow(/no longer/i);
    });

    it("refuses to change a block's kind", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await expect(
        asUser.mutation(api.designs.updateBlock, {
          designId,
          block: { id: "g1", kind: "palette", swatches: [] },
        }),
      ).rejects.toThrow(/kind/i);
    });

    it("rejects emptying the Overview body", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await expect(
        asUser.mutation(api.designs.updateBlock, {
          designId,
          block: { ...overview, body: "" },
        }),
      ).rejects.toThrow(/can't be empty/i);
    });

    it("refuses a caller who neither owns the design nor is an admin", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const { asUser: asStranger } = await seedOwner(t, "user_stranger_clerk");

      await expect(
        asStranger.mutation(api.designs.updateBlock, {
          designId,
          block: { ...overview, body: "Vandalized." },
        }),
      ).rejects.toThrow(/access/i);
    });
  });

  // The palette editor (D-04) sends the whole palette block: its swatches are
  // an ordered list inside one block, so add/remove/reorder are all one
  // updateBlock carrying the list the owner ended up with.
  describe("palette editing", () => {
    const palette = {
      id: "p1",
      kind: "palette" as const,
      swatches: [
        { id: "s1", hex: "#102A44", role: "primary" as const },
        { id: "s2", hex: "#FFFFFF" },
      ],
    };

    async function seedPalette(t: Test, asUser: AsUser) {
      const designId = await seedDesign(t, asUser);
      await asUser.mutation(api.designs.addBlock, { designId, block: palette });
      return designId;
    }

    it("stores the palette's swatches in the order they were sent", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedPalette(t, asUser);

      const row = await t.run((ctx) => ctx.db.get(designId));
      const stored = row!.blocks.find((b) => b.kind === "palette")!;
      expect(stored.kind === "palette" && stored.swatches).toEqual(
        palette.swatches,
      );
    });

    it("persists a reordered, relabelled swatch list", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedPalette(t, asUser);

      await asUser.mutation(api.designs.updateBlock, {
        designId,
        block: {
          ...palette,
          caption: "Kit colors",
          swatches: [
            { id: "s2", hex: "#FFFFFF", role: "secondary", label: "Numbers" },
            { id: "s1", hex: "#102A44", role: "primary", pantoneCode: "289 C" },
          ],
        },
      });

      const row = await t.run((ctx) => ctx.db.get(designId));
      const stored = row!.blocks.find((b) => b.kind === "palette")!;
      expect(stored.kind === "palette" && stored.caption).toBe("Kit colors");
      expect(stored.kind === "palette" && stored.swatches).toEqual([
        { id: "s2", hex: "#FFFFFF", role: "secondary", label: "Numbers" },
        { id: "s1", hex: "#102A44", role: "primary", pantoneCode: "289 C" },
      ]);
    });

    it("canonicalizes a typed hex and drops a blank Pantone code", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedPalette(t, asUser);

      await asUser.mutation(api.designs.updateBlock, {
        designId,
        block: {
          ...palette,
          swatches: [{ id: "s1", hex: "c8102e", pantoneCode: "   " }],
        },
      });

      const row = await t.run((ctx) => ctx.db.get(designId));
      const stored = row!.blocks.find((b) => b.kind === "palette");
      const swatch = stored?.kind === "palette" ? stored.swatches[0] : null;
      expect(swatch?.hex).toBe("#C8102E");
      expect(swatch).not.toHaveProperty("pantoneCode");
    });

    it("rejects a swatch whose hex isn't a color", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedPalette(t, asUser);

      await expect(
        asUser.mutation(api.designs.updateBlock, {
          designId,
          block: { ...palette, swatches: [{ id: "s1", hex: "navy" }] },
        }),
      ).rejects.toThrow(/color/i);
    });

    it("drops the palette without touching the rest of the brief", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedPalette(t, asUser);

      await asUser.mutation(api.designs.removeBlock, {
        designId,
        blockId: "p1",
      });

      expect(await blockIds(t, designId)).toEqual(["b-overview", "g1"]);
    });
  });

  describe("removeBlock", () => {
    it("drops the block and keeps the rest in order", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await asUser.mutation(api.designs.createDesign, {
        title: "Away kit",
        blocks: [
          overview,
          gallery,
          { id: "n1", kind: "text", field: "notes", body: "Note." },
        ],
        files: [await fakeFile(t)],
      });

      await asUser.mutation(api.designs.removeBlock, {
        designId,
        blockId: "g1",
      });

      expect(await blockIds(t, designId)).toEqual(["b-overview", "n1"]);
    });

    it("refuses to remove the Overview — every list reads it", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await expect(
        asUser.mutation(api.designs.removeBlock, {
          designId,
          blockId: "b-overview",
        }),
      ).rejects.toThrow(/overview/i);
      expect(await blockIds(t, designId)).toEqual(["b-overview", "g1"]);
    });

    it("rejects a block that isn't on the design", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await expect(
        asUser.mutation(api.designs.removeBlock, {
          designId,
          blockId: "ghost",
        }),
      ).rejects.toThrow(/no longer/i);
    });

    it("refuses a caller who neither owns the design nor is an admin", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const { asUser: asStranger } = await seedOwner(t, "user_stranger_clerk");

      await expect(
        asStranger.mutation(api.designs.removeBlock, {
          designId,
          blockId: "g1",
        }),
      ).rejects.toThrow(/access/i);
      expect(await blockIds(t, designId)).toEqual(["b-overview", "g1"]);
    });
  });

  describe("moveBlock", () => {
    it("persists a new order that survives a re-read", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await asUser.mutation(api.designs.moveBlock, {
        designId,
        blockId: "b-overview",
        toIndex: 1,
      });

      expect(await blockIds(t, designId)).toEqual(["g1", "b-overview"]);
      const design = await asUser.query(api.designs.getMyDesign, { designId });
      expect(design!.blocks.map((b) => b.id)).toEqual(["g1", "b-overview"]);
    });

    it("clamps a destination past the end instead of failing", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await asUser.mutation(api.designs.moveBlock, {
        designId,
        blockId: "b-overview",
        toIndex: 99,
      });

      expect(await blockIds(t, designId)).toEqual(["g1", "b-overview"]);
    });

    it("moves the Overview freely — required does not mean pinned", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await asUser.mutation(api.designs.moveBlock, {
        designId,
        blockId: "g1",
        toIndex: 0,
      });

      expect(await blockIds(t, designId)).toEqual(["g1", "b-overview"]);
    });

    it("rejects a block that isn't on the design", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await expect(
        asUser.mutation(api.designs.moveBlock, {
          designId,
          blockId: "ghost",
          toIndex: 0,
        }),
      ).rejects.toThrow(/no longer/i);
    });

    it("refuses a caller who neither owns the design nor is an admin", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const { asUser: asStranger } = await seedOwner(t, "user_stranger_clerk");

      await expect(
        asStranger.mutation(api.designs.moveBlock, {
          designId,
          blockId: "g1",
          toIndex: 0,
        }),
      ).rejects.toThrow(/access/i);
      expect(await blockIds(t, designId)).toEqual(["b-overview", "g1"]);
    });

    it("lets an admin reorder someone else's design", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const asAdmin = await seedAdmin(t);

      await asAdmin.mutation(api.designs.moveBlock, {
        designId,
        blockId: "g1",
        toIndex: 0,
      });

      expect(await blockIds(t, designId)).toEqual(["g1", "b-overview"]);
    });
  });

  it("rejects every block mutation against a design that's gone", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedOwner(t);
    const designId = await seedDesign(t, asUser);
    await t.run((ctx) => ctx.db.delete(designId));

    await expect(
      asUser.mutation(api.designs.removeBlock, { designId, blockId: "g1" }),
    ).rejects.toThrow(/not found/i);
  });
});

// ─── D-05 Asset pool ───────────────────────────────────────────────────
// The pool is managed from the design page itself (upload, set main, delete)
// rather than through the edit form, so each operation is its own mutation
// answering the permission questions lib/designAsset defines.
describe("design asset pool", () => {
  const overview = {
    id: "b-overview",
    kind: "text" as const,
    field: "overview" as const,
    body: "Navy and gold.",
  };

  type AsUser = Awaited<ReturnType<typeof seedOwner>>["asUser"];

  async function seedAdmin(t: Test) {
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_staff_clerk",
        email: "staff@sidestep.test",
        name: "Staff",
        isAdmin: true,
        createdAt: Date.now(),
      }),
    );
    return t.withIdentity({
      subject: "user_staff_clerk",
      email: "staff@sidestep.test",
      name: "Staff",
    });
  }

  // Two files, so a delete test isn't fighting the "a design keeps at least
  // one file" rule while it's checking something else.
  async function seedDesign(t: Test, asUser: AsUser) {
    return asUser.mutation(api.designs.createDesign, {
      title: "Away kit",
      blocks: [overview],
      files: [
        await fakeFile(t, { filename: "crest.png" }),
        await fakeFile(t, { filename: "sketch.png" }),
      ],
    });
  }

  describe("addAssets", () => {
    it("appends rows for files uploaded from the design page", async () => {
      const t = convexTest(schema, modules);
      const { userId, asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await asUser.mutation(api.designs.addAssets, {
        designId,
        files: [
          await fakeFile(t, {
            filename: "logo.svg",
            contentType: "image/svg+xml",
          }),
        ],
      });

      const assets = await assetsOf(t, designId);
      expect(assets.map((a) => a.filename)).toEqual([
        "crest.png",
        "sketch.png",
        "logo.svg",
      ]);
      expect(assets[2]).toMatchObject({
        contentType: "image/svg+xml",
        isMain: false,
        uploadedByUserId: userId,
        uploadedByAdmin: false,
      });
    });

    it("lets an admin add staff files to a design they don't own", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const asAdmin = await seedAdmin(t);

      await asAdmin.mutation(api.designs.addAssets, {
        designId,
        files: [
          await fakeFile(t, {
            filename: "print-template.pdf",
            contentType: "application/pdf",
          }),
        ],
      });

      expect((await assetsOf(t, designId))[2]).toMatchObject({
        filename: "print-template.pdf",
        uploadedByAdmin: true,
      });
    });

    it("refuses a caller who neither owns the design nor is an admin", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const { asUser: asStranger } = await seedOwner(t, "user_stranger_clerk");

      await expect(
        asStranger.mutation(api.designs.addAssets, {
          designId,
          files: [await fakeFile(t)],
        }),
      ).rejects.toThrow(/access/i);
      expect(await assetsOf(t, designId)).toHaveLength(2);
    });

    it("rejects an unauthenticated caller", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);

      await expect(
        t.mutation(api.designs.addAssets, {
          designId,
          files: [await fakeFile(t)],
        }),
      ).rejects.toThrow(/Not authenticated/);
    });
  });

  describe("setMainAsset", () => {
    it("flags the chosen asset and clears any previous pick", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const [first, second] = await assetsOf(t, designId);

      await asUser.mutation(api.designs.setMainAsset, { assetId: first!._id });
      await asUser.mutation(api.designs.setMainAsset, { assetId: second!._id });

      expect((await assetsOf(t, designId)).map((a) => a.isMain)).toEqual([
        false,
        true,
      ]);
    });

    it("reflects through the resolver getMyDesign reads", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const assets = await assetsOf(t, designId);

      // Without a pick the oldest web-safe image wins; the explicit flag
      // overrides that.
      expect(
        (await asUser.query(api.designs.getMyDesign, { designId }))?.mainAsset
          ?.filename,
      ).toBe("crest.png");

      await asUser.mutation(api.designs.setMainAsset, {
        assetId: assets[1]!._id,
      });

      expect(
        (await asUser.query(api.designs.getMyDesign, { designId }))?.mainAsset
          ?.filename,
      ).toBe("sketch.png");
    });

    it("lets an admin pick the main image on a design they don't own", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const asAdmin = await seedAdmin(t);
      const assets = await assetsOf(t, designId);

      await asAdmin.mutation(api.designs.setMainAsset, {
        assetId: assets[1]!._id,
      });

      expect((await assetsOf(t, designId))[1]?.isMain).toBe(true);
    });

    it("refuses a caller who neither owns the design nor is an admin", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const { asUser: asStranger } = await seedOwner(t, "user_stranger_clerk");
      const assets = await assetsOf(t, designId);

      await expect(
        asStranger.mutation(api.designs.setMainAsset, {
          assetId: assets[0]!._id,
        }),
      ).rejects.toThrow(/access/i);
    });

    it("rejects an asset that is already gone", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const assets = await assetsOf(t, designId);
      await t.run((ctx) => ctx.db.delete(assets[0]!._id));

      await expect(
        asUser.mutation(api.designs.setMainAsset, { assetId: assets[0]!._id }),
      ).rejects.toThrow(/no longer/i);
    });
  });

  describe("removeAsset", () => {
    it("deletes the row and its stored file", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const [first] = await assetsOf(t, designId);

      await asUser.mutation(api.designs.removeAsset, { assetId: first!._id });

      expect((await assetsOf(t, designId)).map((a) => a.filename)).toEqual([
        "sketch.png",
      ]);
      expect(
        await t.run((ctx) => ctx.storage.getUrl(first!.storageId)),
      ).toBeNull();
    });

    it("strips the deleted id out of every gallery that showed it", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const [first, second] = await assetsOf(t, designId);

      await asUser.mutation(api.designs.addBlock, {
        designId,
        block: {
          id: "g1",
          kind: "gallery",
          caption: "Mood board",
          assetIds: [first!._id, second!._id],
        },
      });
      await asUser.mutation(api.designs.addBlock, {
        designId,
        block: { id: "g2", kind: "gallery", assetIds: [first!._id] },
      });

      await asUser.mutation(api.designs.removeAsset, { assetId: first!._id });

      const row = await t.run((ctx) => ctx.db.get(designId));
      const galleries = row!.blocks.filter((b) => b.kind === "gallery");
      expect(galleries.map((g) => g.assetIds)).toEqual([[second!._id], []]);
      // The blocks themselves survive — only the reference goes.
      expect(row!.blocks.map((b) => b.id)).toEqual(["b-overview", "g1", "g2"]);
    });

    it("keeps the design's last file — a design is never fileless", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await asUser.mutation(api.designs.createDesign, {
        title: "Only file",
        blocks: [overview],
        files: [await fakeFile(t)],
      });
      const [only] = await assetsOf(t, designId);

      await expect(
        asUser.mutation(api.designs.removeAsset, { assetId: only!._id }),
      ).rejects.toThrow(/at least one file/i);
      expect(await assetsOf(t, designId)).toHaveLength(1);
    });

    it("refuses an owner deleting a file staff uploaded", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const asAdmin = await seedAdmin(t);
      await asAdmin.mutation(api.designs.addAssets, {
        designId,
        files: [
          await fakeFile(t, {
            filename: "staff.pdf",
            contentType: "application/pdf",
          }),
        ],
      });
      const staffAsset = (await assetsOf(t, designId))[2]!;

      await expect(
        asUser.mutation(api.designs.removeAsset, { assetId: staffAsset._id }),
      ).rejects.toThrow(/Sidestep/i);
      expect(await assetsOf(t, designId)).toHaveLength(3);
    });

    it("lets an admin delete anything, including a captain's upload", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const asAdmin = await seedAdmin(t);
      const [first] = await assetsOf(t, designId);

      await asAdmin.mutation(api.designs.removeAsset, { assetId: first!._id });

      expect(await assetsOf(t, designId)).toHaveLength(1);
    });

    it("refuses a caller who neither owns the design nor is an admin", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const { asUser: asStranger } = await seedOwner(t, "user_stranger_clerk");
      const [first] = await assetsOf(t, designId);

      await expect(
        asStranger.mutation(api.designs.removeAsset, { assetId: first!._id }),
      ).rejects.toThrow(/access/i);
      expect(await assetsOf(t, designId)).toHaveLength(2);
    });

    it("rejects an asset that is already gone", async () => {
      const t = convexTest(schema, modules);
      const { asUser } = await seedOwner(t);
      const designId = await seedDesign(t, asUser);
      const [first] = await assetsOf(t, designId);
      await t.run((ctx) => ctx.db.delete(first!._id));

      await expect(
        asUser.mutation(api.designs.removeAsset, { assetId: first!._id }),
      ).rejects.toThrow(/no longer/i);
    });
  });

  // The pool hides a delete button it knows would fail, which means the page
  // has to know who is looking at it.
  it("getMyDesign carries the viewer's identity for the permission rules", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedOwner(t);
    const designId = await seedDesign(t, asUser);

    const design = await asUser.query(api.designs.getMyDesign, { designId });
    expect(design?.viewer).toEqual({ userId, isAdmin: false });
  });
});
