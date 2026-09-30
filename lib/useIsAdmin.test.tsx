// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";

/**
 * Acceptance tests for F-02 (backlog/F-02-faq-deep-links-and-copy.md),
 * "Admin gate": the `useIsAdmin()` hook in lib/useIsAdmin.ts.
 *
 * convex/react is mocked the way components/layout/UserSync.test.tsx does it.
 * The useQuery mock honours "skip" the way the real one does (skip → undefined),
 * so the tests pin behaviour, not how the hook is written.
 */

type AuthState = { isLoading: boolean; isAuthenticated: boolean };

const { useConvexAuth, useQuery, state } = vi.hoisted(() => {
  const state: { auth: AuthState; user: unknown } = {
    auth: { isLoading: false, isAuthenticated: false },
    user: undefined,
  };
  return {
    state,
    useConvexAuth: vi.fn(() => state.auth),
    useQuery: vi.fn((_ref: unknown, args: unknown) =>
      args === "skip" ? undefined : state.user,
    ),
  };
});
vi.mock("convex/react", () => ({ useConvexAuth, useQuery }));

import { useIsAdmin } from "@/lib/useIsAdmin";

const ROW = {
  _id: "users_1",
  clerkId: "user_jcc",
  name: "JCC",
  email: "jcc@example.com",
};

function as(auth: AuthState, user: unknown) {
  state.auth = auth;
  state.user = user;
}

const SIGNED_IN = { isLoading: false, isAuthenticated: true };

/** Every state the spec says must read as "not admin". */
const NOT_ADMIN_CASES: Array<[string, AuthState, unknown]> = [
  ["auth is loading", { isLoading: true, isAuthenticated: false }, undefined],
  ["not authenticated", { isLoading: false, isAuthenticated: false }, undefined],
  ["getCurrentUser is loading (undefined)", SIGNED_IN, undefined],
  ["getCurrentUser has no row (null)", SIGNED_IN, null],
  ["isAdmin is false", SIGNED_IN, { ...ROW, isAdmin: false }],
  // Truthy but not `true`: the check is `=== true`, not truthiness.
  ['isAdmin is the string "true"', SIGNED_IN, { ...ROW, isAdmin: "true" }],
];

beforeEach(() => {
  vi.clearAllMocks();
  as({ isLoading: false, isAuthenticated: false }, undefined);
});

describe("useIsAdmin", () => {
  it("useIsAdmin is true only when authenticated and getCurrentUser returns { isAdmin: true }", () => {
    as(SIGNED_IN, { ...ROW, isAdmin: true });
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(true);

    // It reads the existing self-scoped query, with no args.
    const calls = useQuery.mock.calls.filter(([, args]) => args !== "skip");
    expect(calls.length).toBeGreaterThan(0);
    for (const [ref, args] of calls) {
      expect(getFunctionName(ref as never)).toBe("users:getCurrentUser");
      expect(args).toEqual({});
    }
  });

  it.each(NOT_ADMIN_CASES)(
    "useIsAdmin is false when %s",
    (_label, auth, user) => {
      as(auth, user);
      const { result } = renderHook(() => useIsAdmin());
      expect(result.current).toBe(false);
    },
  );

  it('useIsAdmin calls getCurrentUser with "skip" when not authenticated', () => {
    as({ isLoading: false, isAuthenticated: false }, undefined);
    renderHook(() => useIsAdmin());
    expect(useQuery).toHaveBeenCalled();
    for (const [ref, args] of useQuery.mock.calls) {
      expect(getFunctionName(ref as never)).toBe("users:getCurrentUser");
      expect(args).toBe("skip");
    }
  });

  it("useIsAdmin flips from false to true when the query resolves to an admin row (re-render)", () => {
    as(SIGNED_IN, undefined);
    const { result, rerender } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(false);

    state.user = { ...ROW, isAdmin: true };
    rerender();
    expect(result.current).toBe(true);
  });
});

describe("useIsAdmin: static guards (issue: Admin gate)", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");
  const FORBIDDEN = ["publicMetadata", "unsafeMetadata", "sessionClaims", "is_admin"];

  it("lib/useIsAdmin.ts and components/marketing/* contain no publicMetadata, unsafeMetadata, sessionClaims or is_admin", () => {
    const dir = "components/marketing";
    const files = [
      "lib/useIsAdmin.ts",
      ...readdirSync(join(process.cwd(), dir))
        .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
        .map((f) => `${dir}/${f}`),
    ];
    // FaqAccordion must exist and be covered by this scan. (CopyAnswerButtons
    // was the other one; removed in d568273.)
    expect(files).toContain("components/marketing/FaqAccordion.tsx");

    for (const file of files) {
      const src = read(file);
      for (const word of FORBIDDEN) {
        expect(src, `${word} in ${file}`).not.toContain(word);
      }
    }
  });

  it('lib/useIsAdmin.ts has the "UI hint only, never authorise with it" comment', () => {
    const src = read("lib/useIsAdmin.ts");
    const comments = (src.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).join(" ");
    expect(comments).toMatch(/UI hint/i);
    expect(comments).toMatch(/never[\s\S]{0,40}authori[sz]e/i);
    expect(comments).toMatch(/requireAdmin/);
  });

  it('lib/useIsAdmin.ts is a client module ("use client")', () => {
    expect(read("lib/useIsAdmin.ts")).toMatch(/^\s*["']use client["']/);
  });
});
