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
  },
) {
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob(["x".repeat(file.bytes ?? 10)], { type: file.contentType }),
    );
    await ctx.db.insert("designAssets", {
      designId,
      storageId,
      filename: file.filename,
      contentType: file.contentType,
      isMain: file.isMain ?? false,
      uploadedByUserId: userId,
      uploadedByAdmin: false,
      createdAt: file.createdAt ?? Date.now(),
    });
  });
}

type Pub = { mainImage: { url: string; contentType: string } | null };

describe("getPublic mainImage", () => {
  it("a PNG main returns exactly { url, contentType }: no filename, no other file's URL", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderFormId, ids } = await seedForm(t);
    await attach(t, userId, ids.png, {
      filename: "client_final_v3_DO_NOT_SEND.png",
      contentType: "image/png",
      isMain: true,
      createdAt: 1000,
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
    expect(d.mainImage!.contentType).toBe("image/png");
    expect(typeof d.mainImage!.url).toBe("string");
    const payload = JSON.stringify(data);
    expect(payload).not.toContain("DO_NOT_SEND");
    expect(payload).not.toContain("second.png");
  });

  it("no files, a PDF only, a flagged PDF beside a PNG, and a PNG over 2 MB all return mainImage null", async () => {
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
    await attach(t, userId, ids.big, {
      filename: "huge.png",
      contentType: "image/png",
      bytes: 2 * 1024 * 1024 + 1,
      isMain: true,
    });
    const data = await t.query(api.orderForms.getPublic, { orderFormId });
    for (const id of [ids.none, ids.pdfOnly, ids.flaggedPdf, ids.big]) {
      const d = data!.designs.find((x) => x._id === id)! as unknown as Pub;
      expect(d.mainImage, String(id)).toBeNull();
    }
    expect(JSON.stringify(data)).not.toMatch(
      /flagged\.pdf|preview\.png|huge\.png/,
    );
  });
});
