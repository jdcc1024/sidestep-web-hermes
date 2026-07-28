// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

// convex-test loads every module under ./ so handlers run with their real
// imports. The glob string is matched at build time by Vite — keep it static.
const modules = import.meta.glob("./**/*.*s");

describe("users.syncCurrentUser", () => {
  it("inserts a new user when called by a fresh Clerk identity", async () => {
    const t = convexTest(schema, modules);
    const asAlice = t.withIdentity({
      subject: "user_alice_clerk",
      email: "alice@example.com",
      name: "Alice",
    });

    const userId = await asAlice.mutation(api.users.syncCurrentUser, {});
    expect(userId).not.toBeNull();

    const user = await asAlice.query(api.users.getCurrentUser, {});
    expect(user).toMatchObject({
      clerkId: "user_alice_clerk",
      email: "alice@example.com",
      name: "Alice",
      isAdmin: false,
    });
  });

  it("returns null without inserting when caller is unauthenticated", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(api.users.syncCurrentUser, {});
    expect(result).toBeNull();

    const everyone = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(everyone).toEqual([]);
  });

  it("should leave a populated row alone when the token carries no name or email", async () => {
    // The real Convex session token has neither claim (see lib/clerkProfile),
    // so an unconditional patch here wipes whatever the webhook wrote.
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_carol_clerk",
        email: "carol@example.com",
        name: "Carol",
        isAdmin: true,
        createdAt: Date.now(),
      });
    });

    await t
      .withIdentity({ subject: "user_carol_clerk" })
      .mutation(api.users.syncCurrentUser, {});

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", "user_carol_clerk"))
        .unique(),
    );
    expect(row).toMatchObject({
      email: "carol@example.com",
      name: "Carol",
      isAdmin: true,
    });
  });
});

describe("users.hydrateProfileFromClerk", () => {
  const clerkPayload = {
    id: "user_dana_clerk",
    first_name: "Dana",
    last_name: "Reyes",
    primary_email_address_id: "idn_primary",
    email_addresses: [{ id: "idn_primary", email_address: "dana@example.com" }],
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function seedBlankUser(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_dana_clerk",
        email: "",
        name: "",
        isAdmin: false,
        createdAt: Date.now(),
      }),
    );
  }

  it("should fill a blank row from Clerk's Backend API", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => clerkPayload }),
    );

    const t = convexTest(schema, modules);
    const userId = await seedBlankUser(t);

    const result = await t
      .withIdentity({ subject: "user_dana_clerk" })
      .action(api.users.hydrateProfileFromClerk, {});

    expect(result).toBe("ok");
    expect(await t.run(async (ctx) => ctx.db.get(userId))).toMatchObject({
      name: "Dana Reyes",
      email: "dana@example.com",
    });
  });

  it("should refuse an unauthenticated caller", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    const t = convexTest(schema, modules);
    expect(await t.action(api.users.hydrateProfileFromClerk, {})).toBe(
      "unauthenticated",
    );
  });

  it("should no-op when the deployment has no Clerk secret key", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const t = convexTest(schema, modules);
    await seedBlankUser(t);

    const result = await t
      .withIdentity({ subject: "user_dana_clerk" })
      .action(api.users.hydrateProfileFromClerk, {});

    expect(result).toBe("unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should report a user Clerk no longer knows", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const t = convexTest(schema, modules);
    await seedBlankUser(t);

    const result = await t
      .withIdentity({ subject: "user_dana_clerk" })
      .action(api.users.hydrateProfileFromClerk, {});

    expect(result).toBe("not-found");
  });

  it("should never write isAdmin — the webhook owns it", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => clerkPayload }),
    );

    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_dana_clerk",
        email: "",
        name: "",
        isAdmin: true,
        createdAt: Date.now(),
      }),
    );

    await t
      .withIdentity({ subject: "user_dana_clerk" })
      .action(api.users.hydrateProfileFromClerk, {});

    expect(await t.run(async (ctx) => ctx.db.get(userId))).toMatchObject({
      isAdmin: true,
      name: "Dana Reyes",
    });
  });
});

describe("users.backfillProfilesFromClerk", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("should fill every blank row and skip the ones already populated", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    const byId: Record<string, unknown> = {
      user_blank_one: {
        id: "user_blank_one",
        first_name: "Blank",
        last_name: "One",
        primary_email_address_id: "idn_1",
        email_addresses: [{ id: "idn_1", email_address: "one@example.com" }],
      },
      user_blank_two: {
        id: "user_blank_two",
        first_name: null,
        last_name: null,
        primary_email_address_id: "idn_2",
        email_addresses: [{ id: "idn_2", email_address: "two@example.com" }],
      },
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const clerkId = url.split("/").pop()!;
      const payload = byId[clerkId];
      if (!payload) return Promise.resolve({ ok: false, status: 404 });
      return Promise.resolve({ ok: true, json: async () => payload });
    });
    vi.stubGlobal("fetch", fetchMock);

    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const clerkId of ["user_blank_one", "user_blank_two", "user_gone"]) {
        await ctx.db.insert("users", {
          clerkId,
          email: "",
          name: "",
          isAdmin: false,
          createdAt: Date.now(),
        });
      }
      await ctx.db.insert("users", {
        clerkId: "user_already_set",
        email: "set@example.com",
        name: "Already Set",
        isAdmin: false,
        createdAt: Date.now(),
      });
    });

    const result = await t.action(internal.users.backfillProfilesFromClerk, {});

    expect(result).toEqual({ scanned: 3, patched: 2, missing: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
    const byClerkId = new Map(rows.map((row) => [row.clerkId, row]));
    expect(byClerkId.get("user_blank_one")).toMatchObject({
      name: "Blank One",
      email: "one@example.com",
    });
    // No first/last name in Clerk either — the email is a better label than "".
    expect(byClerkId.get("user_blank_two")).toMatchObject({
      name: "two@example.com",
      email: "two@example.com",
    });
    expect(byClerkId.get("user_gone")).toMatchObject({ name: "", email: "" });
  });

  it("should fail loudly when the deployment has no Clerk secret key", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const t = convexTest(schema, modules);
    await expect(
      t.action(internal.users.backfillProfilesFromClerk, {}),
    ).rejects.toThrow(/CLERK_SECRET_KEY/);
  });
});

describe("users.syncUser", () => {
  it("upserts the user keyed by clerkId (insert then patch)", async () => {
    const t = convexTest(schema, modules);

    const id1 = await t.mutation(api.users.syncUser, {
      clerkId: "user_bob_clerk",
      email: "bob@example.com",
      name: "Bob",
      isAdmin: false,
    });

    const id2 = await t.mutation(api.users.syncUser, {
      clerkId: "user_bob_clerk",
      email: "bob+new@example.com",
      name: "Bob Updated",
      isAdmin: true,
    });

    expect(id1).toBe(id2);

    const row = await t.run(async (ctx) => ctx.db.get(id1));
    expect(row).toMatchObject({
      email: "bob+new@example.com",
      name: "Bob Updated",
      isAdmin: true,
    });
  });

  it("rejects calls with a missing required field (email)", async () => {
    const t = convexTest(schema, modules);
    // Cast through unknown: we're exercising the validator's rejection of a
    // malformed payload, which is exactly the trust-boundary check this
    // smoke test covers.
    await expect(
      t.mutation(api.users.syncUser, {
        clerkId: "user_no_email",
        name: "Nameless",
        isAdmin: false,
      } as unknown as {
        clerkId: string;
        email: string;
        name: string;
        isAdmin: boolean;
      }),
    ).rejects.toThrow();
  });
});
