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
    // so an unconditional patch here wipes whatever the refresh wrote.
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

describe("users.refreshFromClerk", () => {
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
      .action(api.users.refreshFromClerk, {});

    expect(result).toBe("ok");
    expect(await t.run(async (ctx) => ctx.db.get(userId))).toMatchObject({
      name: "Dana Reyes",
      email: "dana@example.com",
    });
  });

  it("should refuse an unauthenticated caller", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    const t = convexTest(schema, modules);
    expect(await t.action(api.users.refreshFromClerk, {})).toBe(
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
      .action(api.users.refreshFromClerk, {});

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
      .action(api.users.refreshFromClerk, {});

    expect(result).toBe("not-found");
  });

  async function seedPopulatedUser(
    t: ReturnType<typeof convexTest>,
    isAdmin: boolean,
  ) {
    return t.run(async (ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_dana_clerk",
        email: "dana@example.com",
        name: "Dana Reyes",
        isAdmin,
        createdAt: Date.now(),
      }),
    );
  }

  function stubClerkUser(overrides: Record<string, unknown>) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...clerkPayload, ...overrides }),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("should grant admin when Clerk private metadata has isAdmin: true", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    stubClerkUser({ private_metadata: { isAdmin: true } });

    const t = convexTest(schema, modules);
    const userId = await seedPopulatedUser(t, false);

    await t
      .withIdentity({ subject: "user_dana_clerk" })
      .action(api.users.refreshFromClerk, {});

    expect(await t.run(async (ctx) => ctx.db.get(userId))).toMatchObject({
      isAdmin: true,
    });
  });

  it("should revoke a cached admin when Clerk no longer says admin", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    stubClerkUser({ private_metadata: {} });

    const t = convexTest(schema, modules);
    const userId = await seedPopulatedUser(t, true);

    await t
      .withIdentity({ subject: "user_dana_clerk" })
      .action(api.users.refreshFromClerk, {});

    expect(await t.run(async (ctx) => ctx.db.get(userId))).toMatchObject({
      isAdmin: false,
    });
  });

  it("should revoke admin even when Clerk has no name or email to apply", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "user_dana_clerk", private_metadata: {} }),
      }),
    );

    const t = convexTest(schema, modules);
    const userId = await seedPopulatedUser(t, true);

    await t
      .withIdentity({ subject: "user_dana_clerk" })
      .action(api.users.refreshFromClerk, {});

    // A blank Clerk profile never clobbers the stored name/email.
    expect(await t.run(async (ctx) => ctx.db.get(userId))).toMatchObject({
      isAdmin: false,
      name: "Dana Reyes",
      email: "dana@example.com",
    });
  });

  it("should keep a stored name and email rather than overwrite them", async () => {
    // admin.updateUser corrections live only in Convex; a per-session
    // refresh must not undo them.
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    stubClerkUser({
      first_name: "Dana",
      last_name: "Typo",
      private_metadata: { isAdmin: true },
    });

    const t = convexTest(schema, modules);
    const userId = await seedPopulatedUser(t, false);

    await t
      .withIdentity({ subject: "user_dana_clerk" })
      .action(api.users.refreshFromClerk, {});

    expect(await t.run(async (ctx) => ctx.db.get(userId))).toMatchObject({
      name: "Dana Reyes",
      email: "dana@example.com",
      isAdmin: true,
    });
  });

  it("should ignore an isAdmin flag in public metadata", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    stubClerkUser({ public_metadata: { isAdmin: true }, private_metadata: {} });

    const t = convexTest(schema, modules);
    const userId = await seedPopulatedUser(t, false);

    await t
      .withIdentity({ subject: "user_dana_clerk" })
      .action(api.users.refreshFromClerk, {});

    expect(await t.run(async (ctx) => ctx.db.get(userId))).toMatchObject({
      isAdmin: false,
    });
  });

  it("should write nothing for an unauthenticated caller", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    const fetchMock = stubClerkUser({ private_metadata: { isAdmin: true } });

    const t = convexTest(schema, modules);
    const userId = await seedPopulatedUser(t, false);
    const before = await t.run(async (ctx) => ctx.db.get(userId));

    expect(await t.action(api.users.refreshFromClerk, {})).toBe(
      "unauthenticated",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run(async (ctx) => ctx.db.get(userId))).toEqual(before);
  });
});

describe("public Convex API", () => {
  it("should not expose syncUser", async () => {
    // It took isAdmin as an argument with no auth check — anyone holding the
    // deployment URL could make themselves admin.
    const users = await import("./users");
    expect("syncUser" in users).toBe(false);
  });

  it("should have no public function that accepts isAdmin", async () => {
    // Walks every registered function in every module. The users.isAdmin
    // cache is written only by internal functions, from a Clerk fetch.
    const offenders: string[] = [];
    for (const [path, load] of Object.entries(modules)) {
      if (path.includes("_generated") || /\.test\./.test(path)) continue;
      const mod = (await load()) as Record<string, unknown>;
      for (const [name, fn] of Object.entries(mod)) {
        const registered = fn as {
          isPublic?: boolean;
          exportArgs?: () => string;
        };
        if (!registered?.isPublic || !registered.exportArgs) continue;
        if (/is_?admin/i.test(registered.exportArgs())) {
          offenders.push(`${path}:${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("users.backfillProfilesFromClerk", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("should refresh every row's profile and admin flag from Clerk", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    const byId: Record<string, unknown> = {
      user_blank_one: {
        id: "user_blank_one",
        first_name: "Blank",
        last_name: "One",
        primary_email_address_id: "idn_1",
        email_addresses: [{ id: "idn_1", email_address: "one@example.com" }],
        private_metadata: { isAdmin: true },
      },
      // Cached as admin, but Clerk has since revoked it.
      user_already_set: {
        id: "user_already_set",
        first_name: "Already",
        last_name: "Set",
        primary_email_address_id: "idn_3",
        email_addresses: [{ id: "idn_3", email_address: "set@example.com" }],
        private_metadata: {},
        public_metadata: { isAdmin: true },
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
        isAdmin: true,
        createdAt: Date.now(),
      });
    });

    const result = await t.action(internal.users.backfillProfilesFromClerk, {});

    expect(result).toEqual({ scanned: 4, patched: 3, missing: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
    const byClerkId = new Map(rows.map((row) => [row.clerkId, row]));
    expect(byClerkId.get("user_blank_one")).toMatchObject({
      name: "Blank One",
      email: "one@example.com",
      isAdmin: true,
    });
    expect(byClerkId.get("user_already_set")).toMatchObject({
      name: "Already Set",
      isAdmin: false,
    });
    // No first/last name in Clerk either — the email is a better label than "".
    expect(byClerkId.get("user_blank_two")).toMatchObject({
      name: "two@example.com",
      email: "two@example.com",
    });
    expect(byClerkId.get("user_blank_two")).toMatchObject({ isAdmin: false });
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

