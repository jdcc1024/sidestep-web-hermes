// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { joinUsersById } from "./_users";

const modules = import.meta.glob("./**/*.*s");

async function seedUser(
  t: ReturnType<typeof convexTest>,
  name: string,
): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: name,
      email: `${name}@example.com`,
      name,
      isAdmin: false,
      createdAt: Date.now(),
    }),
  );
}

// A Map isn't a Convex value, so t.run can't return one — every assertion
// on the lookup happens inside the transaction and returns plain data.
describe("joinUsersById", () => {
  it("returns a lookup keyed by the id each row points at", async () => {
    const t = convexTest(schema, modules);
    const ada = await seedUser(t, "ada");
    const grace = await seedUser(t, "grace");
    const rows = [{ ownerId: ada }, { ownerId: grace }];

    const names = await t.run(async (ctx) => {
      const users = await joinUsersById(ctx, rows, (row) => row.ownerId);
      return [users.get(ada)?.name, users.get(grace)?.name];
    });

    expect(names).toEqual(["ada", "grace"]);
  });

  it("maps an id with no user row to null rather than omitting it", async () => {
    const t = convexTest(schema, modules);
    const ghost = await seedUser(t, "ghost");
    await t.run((ctx) => ctx.db.delete(ghost));

    const probe = await t.run(async (ctx) => {
      const users = await joinUsersById(ctx, [{ id: ghost }], (row) => row.id);
      return { has: users.has(ghost), value: users.get(ghost) };
    });

    expect(probe.has).toBe(true);
    expect(probe.value).toBeNull();
  });

  it("fetches each distinct id once even when rows repeat it", async () => {
    const t = convexTest(schema, modules);
    const ada = await seedUser(t, "ada");
    const rows = [{ id: ada }, { id: ada }, { id: ada }];

    const result = await t.run(async (ctx) => {
      let gets = 0;
      const spied = {
        ...ctx,
        db: {
          ...ctx.db,
          get: (id: Id<"users">) => {
            gets += 1;
            return ctx.db.get(id);
          },
        },
      } as unknown as typeof ctx;
      const users = await joinUsersById(spied, rows, (row) => row.id);
      return { gets, size: users.size, name: users.get(ada)?.name };
    });

    expect(result).toEqual({ gets: 1, size: 1, name: "ada" });
  });

  it("returns an empty lookup for no rows", async () => {
    const t = convexTest(schema, modules);

    const size = await t.run(async (ctx) => {
      const users = await joinUsersById(
        ctx,
        [] as Array<{ ownerId: Id<"users"> }>,
        (row) => row.ownerId,
      );
      return users.size;
    });

    expect(size).toBe(0);
  });
});
