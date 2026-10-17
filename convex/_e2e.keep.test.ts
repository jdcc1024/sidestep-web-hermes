// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// IMG-02: the shared big-PNG fixture is found by content hash and pinned, so
// it survives every run's cleanup.
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");
const EMAIL = "snap@example.com";

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "user_snap",
      email: EMAIL,
      name: "Snap",
      isAdmin: false,
      createdAt: Date.now(),
    }),
  );
  const blob = await t.run((ctx) =>
    ctx.storage.store(new Blob(["fixture"], { type: "image/png" })),
  );
  const sha256 = await t.run(
    async (ctx) => (await ctx.db.system.get(blob))!.sha256,
  );
  return { t, userId, blob, sha256 };
}

describe("_e2e:findFixture and keepSha256", () => {
  it("should find the stored id by sha256, and return null for an unknown hash", async () => {
    const { t, blob, sha256 } = await setup();
    expect(await t.query(internal._e2e.findFixture, { sha256 })).toBe(blob);
    expect(
      await t.query(internal._e2e.findFixture, { sha256: "bm90LWEtaGFzaA==" }),
    ).toBeNull();
  });

  it("should keep a pinned blob when its last user is cleaned up", async () => {
    const { t, userId, blob, sha256 } = await setup();
    const { designId } = await t.mutation(internal._e2e.seedOrder, {
      email: EMAIL,
      tag: "e2e-keep01",
    });
    await t.run((ctx) =>
      ctx.db.insert("designAssets", {
        designId,
        storageId: blob,
        filename: "e2e-big.png",
        contentType: "image/png",
        isMain: true,
        uploadedByUserId: userId,
        uploadedByAdmin: false,
        createdAt: Date.now(),
      }),
    );

    await t.mutation(internal._e2e.cleanup, {
      email: EMAIL,
      tag: "e2e-keep01",
      keepSha256: [sha256],
    });

    const left = await t.run(async (ctx) => ({
      assets: await ctx.db.query("designAssets").collect(),
      file: await ctx.db.system.get(blob),
    }));
    expect(left.assets).toEqual([]);
    expect(left.file, "pinned fixture survives").not.toBeNull();
  });
});
