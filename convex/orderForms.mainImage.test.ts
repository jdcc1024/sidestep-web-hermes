// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");
const ONE_DAY = 24 * 60 * 60 * 1000;

// 0004 R3-01: getPublic returns each design's main picture (url + contentType
// only), and only when it is web-safe and at most 2 MB.

async function seedForm(t: ReturnType<typeof convexTest>) {
  const now = Date.now();
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: "cap",
      email: "cap@example.com",
      name: "Cap",
      isAdmin: false,
      createdAt: now,
    });
    const mk = (title: string) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title,
        blocks: overviewBlocks("x"),
        createdAt: now,
        updatedAt: now,
      });
    const ids = {
      png: await mk("Has PNG"),
      none: await mk("No files"),
      pdfOnly: await mk("PDF only"),
      flaggedPdf: await mk("Flagged PDF + PNG"),
      big: await mk("Big PNG"),
      bigGif: await mk("Big GIF"),
    };
    const orderId = await ctx.db.insert("orders", {
      captainId: userId,
      teamName: "Wildcats",
      sport: "Hockey",
      estimatedQuantity: 10,
      hasOwnDesign: false,
      designIds: Object.values(ids),
      internalStages: [],
      createdAt: now,
      updatedAt: now,
    });
    const orderFormId = await ctx.db.insert("orderForms", {
      orderId,
      captainId: userId,
      sizeOptions: ["M", "L"],
      namesMode: "open",
      customQuestions: [],
      deadline: now + 7 * ONE_DAY,
      status: "open",
      createdAt: now,
    });
    return { userId, orderFormId, ids };
  });
}

async function attach(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  designId: Id<"designs">,
  file: {
    filename: string;
    contentType: string;
    bytes?: number;
    isMain?: boolean;
    createdAt?: number;
    // IMG-04: the form shows only the stored preview, so a main that should
    // show needs one (a small WebP blob, like `imagePreviews.generate` makes).
    withPreview?: boolean;
  },
) {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob(["x".repeat(file.bytes ?? 10)], { type: file.contentType }),
    );
    const previewStorageId = file.withPreview
      ? await ctx.storage.store(new Blob(["webp"], { type: "image/webp" }))
      : undefined;
    await ctx.db.insert("designAssets", {
      designId,
      storageId,
      ...(previewStorageId ? { previewStorageId } : {}),
      filename: file.filename,
      contentType: file.contentType,
      isMain: file.isMain ?? false,
      uploadedByUserId: userId,
      uploadedByAdmin: false,
      createdAt: file.createdAt ?? Date.now(),
    });
    return {
      originalUrl: await ctx.storage.getUrl(storageId),
      previewUrl: previewStorageId
        ? await ctx.storage.getUrl(previewStorageId)
        : null,
    };
  });
}

type Pub = { mainImage: { url: string; contentType: string } | null };

describe("getPublic mainImage", () => {
  it("a PNG main with a preview returns exactly { url, contentType } of the preview: no filename, no other file's URL", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderFormId, ids } = await seedForm(t);
    const main = await attach(t, userId, ids.png, {
      filename: "client_final_v3_DO_NOT_SEND.png",
      contentType: "image/png",
      isMain: true,
      createdAt: 1000,
      withPreview: true,
    });
    await attach(t, userId, ids.png, {
      filename: "second.png",
      contentType: "image/png",
      createdAt: 2000,
    });
    const data = await t.query(api.orderForms.getPublic, { orderFormId });
    const d = data!.designs.find((x) => x._id === ids.png)! as unknown as Pub;
    expect(d.mainImage).not.toBeNull();
    expect(Object.keys(d.mainImage!).sort()).toEqual(["contentType", "url"]);
    expect(d.mainImage!.contentType).toBe("image/webp");
    expect(d.mainImage!.url).toBe(main.previewUrl);
    const payload = JSON.stringify(data);
    expect(payload).not.toContain(main.originalUrl);
    expect(payload).not.toContain("DO_NOT_SEND");
    expect(payload).not.toContain("second.png");
  });

  it("no files, a PDF only, and a flagged PDF beside a PNG all return mainImage null", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderFormId, ids } = await seedForm(t);
    await attach(t, userId, ids.pdfOnly, {
      filename: "print.pdf",
      contentType: "application/pdf",
    });
    await attach(t, userId, ids.flaggedPdf, {
      filename: "flagged.pdf",
      contentType: "application/pdf",
      isMain: true,
      createdAt: 1000,
    });
    await attach(t, userId, ids.flaggedPdf, {
      filename: "preview.png",
      contentType: "image/png",
      createdAt: 2000,
    });
    const data = await t.query(api.orderForms.getPublic, { orderFormId });
    for (const id of [ids.none, ids.pdfOnly, ids.flaggedPdf]) {
      const d = data!.designs.find((x) => x._id === id)! as unknown as Pub;
      expect(d.mainImage, String(id)).toBeNull();
    }
    expect(JSON.stringify(data)).not.toMatch(/flagged\.pdf|preview\.png/);
  });

  // 0004 R3-02: a big PNG shows. Since IMG-04 what shows is its small stored
  // preview, never the 3 MB original. A big GIF with no preview yet shows
  // nothing.
  it("a 3 MB PNG main with a preview returns the preview's url + image/webp", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderFormId, ids } = await seedForm(t);
    const main = await attach(t, userId, ids.big, {
      filename: "huge.png",
      contentType: "image/png",
      bytes: 3 * 1024 * 1024,
      isMain: true,
      withPreview: true,
    });
    const data = await t.query(api.orderForms.getPublic, { orderFormId });
    const d = data!.designs.find((x) => x._id === ids.big)! as unknown as Pub;
    expect(d.mainImage).not.toBeNull();
    expect(Object.keys(d.mainImage!).sort()).toEqual(["contentType", "url"]);
    expect(d.mainImage!.contentType).toBe("image/webp");
    expect(d.mainImage!.url).toBe(main.previewUrl);
    expect(JSON.stringify(data)).not.toContain(main.originalUrl);
    expect(JSON.stringify(data)).not.toContain("huge.png");
  });

  it("a 3 MB GIF main with no preview yet returns mainImage null", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderFormId, ids } = await seedForm(t);
    await attach(t, userId, ids.bigGif, {
      filename: "huge.gif",
      contentType: "image/gif",
      bytes: 3 * 1024 * 1024,
      isMain: true,
    });
    const data = await t.query(api.orderForms.getPublic, { orderFormId });
    const d = data!.designs.find(
      (x) => x._id === ids.bigGif,
    )! as unknown as Pub;
    expect(d.mainImage).toBeNull();
    expect(JSON.stringify(data)).not.toContain("huge.gif");
  });
});
