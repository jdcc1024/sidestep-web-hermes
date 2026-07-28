import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clerkProfileOf,
  fetchClerkUser,
  type ClerkUserPayload,
} from "./clerkProfile";

function clerkUser(overrides: Partial<ClerkUserPayload> = {}): ClerkUserPayload {
  return {
    id: "user_123",
    first_name: "Alex",
    last_name: "Chen",
    primary_email_address_id: "idn_primary",
    email_addresses: [
      { id: "idn_old", email_address: "old@example.com" },
      { id: "idn_primary", email_address: "alex@example.com" },
    ],
    ...overrides,
  };
}

describe("clerkProfileOf", () => {
  it("should resolve the email named by primary_email_address_id", () => {
    expect(clerkProfileOf(clerkUser()).email).toBe("alex@example.com");
  });

  it("should fall back to the first address when no id matches", () => {
    const profile = clerkProfileOf(
      clerkUser({ primary_email_address_id: "idn_deleted" }),
    );
    expect(profile.email).toBe("old@example.com");
  });

  it("should fall back to the first address when the payload omits the primary id", () => {
    const profile = clerkProfileOf(
      clerkUser({ primary_email_address_id: null }),
    );
    expect(profile.email).toBe("old@example.com");
  });

  it("should join first and last name", () => {
    expect(clerkProfileOf(clerkUser()).name).toBe("Alex Chen");
  });

  it("should use whichever name part is present", () => {
    expect(clerkProfileOf(clerkUser({ last_name: null })).name).toBe("Alex");
    expect(clerkProfileOf(clerkUser({ first_name: null })).name).toBe("Chen");
  });

  it("should fall back to the email when the user has no name", () => {
    const profile = clerkProfileOf(
      clerkUser({ first_name: null, last_name: null }),
    );
    expect(profile.name).toBe("alex@example.com");
  });

  it("should return empty strings when the user has no email at all", () => {
    expect(
      clerkProfileOf(
        clerkUser({
          email_addresses: [],
          first_name: null,
          last_name: null,
          primary_email_address_id: null,
        }),
      ),
    ).toEqual({ name: "", email: "" });
  });

  it("should ignore a `primary` boolean, which Clerk payloads do not carry", () => {
    // The bug this module exists to fix: the old code looked for
    // `email_addresses.find((e) => e.primary)`, which never matched, so every
    // synced user landed with an empty email and an empty name.
    const profile = clerkProfileOf(
      clerkUser({
        email_addresses: [{ id: "idn_primary", email_address: "a@b.com" }],
        primary_email_address_id: "idn_primary",
      }),
    );
    expect(profile.email).toBe("a@b.com");
  });
});

describe("fetchClerkUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should request the user from Clerk's Backend API with the secret key", async () => {
    const payload = clerkUser();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchClerkUser("user_123", "sk_test_abc");

    expect(result).toEqual(payload);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.clerk.com/v1/users/user_123");
    expect(init.headers.Authorization).toBe("Bearer sk_test_abc");
  });

  it("should return null when Clerk does not know the user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );

    expect(await fetchClerkUser("user_gone", "sk_test_abc")).toBeNull();
  });
});
