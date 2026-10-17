// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// IMG-02: E2E runs share one stored fixture blob, so `_e2e:cleanup` must only
// delete a blob when no other design asset still points at it.
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

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
  const attach = (designId: Id<"designs">, storageId: Id<"_storage">) =>
    t.run((ctx) =>
      ctx.db.insert("designAssets", {
        designId,
        storageId,
        filename: "e2e-big.png",
        contentType: "image/png",
        isMain: true,
        uploadedByUserId: userId,
        uploadedByAdmin: false,
        createdAt: Date.now(),
      }),
    );
  const blobExists = (id: Id<"_storage">) =>
    t.run(async (ctx) => (await ctx.db.system.get(id)) !== null);
  return { t, userId, blob, attach, blobExists };
}

describe("_e2e:cleanup and the shared fixture blob", () => {
  it("keeps the blob while another E2E design uses it, removes it with the last user", async () => {
    const { t, blob, attach, blobExists } = await setup();
    const a = await t.mutation(internal._e2e.seedOrder, { email: EMAIL, tag: "e2e-aaaa01" });
    const b = await t.mutation(internal._e2e.seedOrder, { email: EMAIL, tag: "e2e-bbbb01" });
    await attach(a.designId, blob);
    await attach(b.designId, blob);

    await t.mutation(internal._e2e.cleanup, { email: EMAIL, tag: "e2e-aaaa01" });
    expect(await blobExists(blob), "b still uses the blob").toBe(true);

    await t.mutation(internal._e2e.cleanup, { email: EMAIL, tag: "e2e-bbbb01" });
    expect(await blobExists(blob), "last user gone").toBe(false);
  });

  it("refuses a non-E2E design: it and its blob survive, even in the stale sweep", async () => {
    const { t, userId, blob, attach, blobExists } = await setup();
    const real = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Westside FC kit",
        blocks: [],
        jerseyStyle: "Soccer jersey",
        neckline: "Crew Neck",
        sleeveStyle: "Regular",
        createdAt: 0,
        updatedAt: 0,
      }),
    );
    await attach(real, blob);
    const e = await t.mutation(internal._e2e.seedOrder, { email: EMAIL, tag: "e2e-cccc01" });
    await attach(e.designId, blob);

    await t.mutation(internal._e2e.cleanup, { email: EMAIL, tag: "e2e-cccc01" });
    await t.mutation(internal._e2e.cleanup, { email: EMAIL, olderThanMs: 0 });

    const designs = await t.run((ctx) => ctx.db.query("designs").collect());
    expect(designs.map((d) => d._id)).toEqual([real]);
    expect(await blobExists(blob), "the real design still uses the blob").toBe(true);
  });
});
