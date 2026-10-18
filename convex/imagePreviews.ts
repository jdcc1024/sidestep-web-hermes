"use node";

// IMG-03 step 1 spike: prove `sharp` loads in Convex's Node runtime and
// measure one resize of a real print PNG. Replaced by `generate` in step 3.
import sharp from "sharp";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const spike = internalAction({
  args: { storageId: v.id("_storage"), keep: v.optional(v.boolean()) },
  handler: async (ctx, { storageId, keep }) => {
    const t0 = Date.now();
    const rss0 = process.memoryUsage().rss;
    const blob = await ctx.storage.get(storageId);
    if (blob === null) throw new Error("no such blob");
    const input = Buffer.from(await blob.arrayBuffer());
    const t1 = Date.now();
    const meta = await sharp(input).metadata();
    const { data, info } = await sharp(input)
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const t2 = Date.now();
    const rssPeak = process.memoryUsage().rss;
    let previewId: string | null = null;
    if (keep) {
      previewId = await ctx.storage.store(
        new Blob([new Uint8Array(data)], { type: "image/webp" }),
      );
    } else {
      // Spike only: store + delete to prove the write path, keep nothing.
      const id = await ctx.storage.store(
        new Blob([new Uint8Array(data)], { type: "image/webp" }),
      );
      await ctx.storage.delete(id);
    }
    const t3 = Date.now();
    return {
      sharp: sharp.versions.sharp ?? null,
      vips: sharp.versions.vips,
      inputBytes: input.byteLength,
      inputSize: `${meta.width}x${meta.height}`,
      outputBytes: data.byteLength,
      outputSize: `${info.width}x${info.height}`,
      readMs: t1 - t0,
      resizeMs: t2 - t1,
      storeMs: t3 - t2,
      totalMs: t3 - t0,
      rssStartMB: Math.round(rss0 / 1e6),
      rssAfterResizeMB: Math.round(rssPeak / 1e6),
      previewId,
    };
  },
});
