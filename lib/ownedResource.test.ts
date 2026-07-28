import { describe, expect, it } from "vitest";
import { resolveOwnedResource } from "./ownedResource";

const READY = { _id: "order_1", teamName: "Falcons" };

describe("resolveOwnedResource", () => {
  it("should report loading when the query has not resolved yet", () => {
    expect(
      resolveOwnedResource({
        authLoading: false,
        isAuthenticated: true,
        result: undefined,
      }),
    ).toEqual({ status: "loading" });
  });

  it("should report loading when a null result arrives while auth is still loading", () => {
    // The B-03 bug: during the token-attach window the owner-scoped query
    // resolves to null because there is no identity yet, not because the
    // resource is missing.
    expect(
      resolveOwnedResource({
        authLoading: true,
        isAuthenticated: false,
        result: null,
      }),
    ).toEqual({ status: "loading" });
  });

  it("should report loading when a null result arrives before the token is attached", () => {
    // Clerk has finished loading but the Convex client has not yet validated
    // the token — still not a verdict on the resource.
    expect(
      resolveOwnedResource({
        authLoading: false,
        isAuthenticated: false,
        result: null,
      }),
    ).toEqual({ status: "loading" });
  });

  it("should report loading for a resolved value that predates authentication", () => {
    // A stale pre-auth result must not be rendered as the signed-in view.
    expect(
      resolveOwnedResource({
        authLoading: false,
        isAuthenticated: false,
        result: READY,
      }),
    ).toEqual({ status: "loading" });
  });

  it("should report not-found when an authenticated query resolves to null", () => {
    expect(
      resolveOwnedResource({
        authLoading: false,
        isAuthenticated: true,
        result: null,
      }),
    ).toEqual({ status: "not-found" });
  });

  it("should report ready with the data when an authenticated query resolves", () => {
    expect(
      resolveOwnedResource({
        authLoading: false,
        isAuthenticated: true,
        result: READY,
      }),
    ).toEqual({ status: "ready", data: READY });
  });

  it("should report loading for an empty list while auth is still settling", () => {
    // List queries return [] rather than null for "no identity", so the empty
    // state would otherwise flash "No designs yet" on every cold load.
    expect(
      resolveOwnedResource({
        authLoading: true,
        isAuthenticated: false,
        result: [],
      }),
    ).toEqual({ status: "loading" });
  });

  it("should report ready with an empty list once authenticated", () => {
    expect(
      resolveOwnedResource({
        authLoading: false,
        isAuthenticated: true,
        result: [],
      }),
    ).toEqual({ status: "ready", data: [] });
  });
});
