// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { useAuth, useQuery, syncCurrentUser, refreshFromClerk } = vi.hoisted(
  () => ({
    useAuth: vi.fn(),
    useQuery: vi.fn(),
    syncCurrentUser: vi.fn(),
    refreshFromClerk: vi.fn(),
  }),
);
vi.mock("@clerk/nextjs", () => ({ useAuth }));
vi.mock("convex/react", () => ({
  useQuery,
  useMutation: () => syncCurrentUser,
  useAction: () => refreshFromClerk,
}));

import { UserSync } from "./UserSync";

const row = {
  _id: "users_1",
  clerkId: "user_alice",
  name: "Alice",
  email: "alice@example.com",
  isAdmin: false,
};

function signedInAs(userId: string) {
  useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true, userId });
}

describe("UserSync", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    syncCurrentUser.mockResolvedValue("users_1");
    refreshFromClerk.mockResolvedValue("ok");
  });

  it("should refresh from Clerk once per session even when the profile is complete", () => {
    signedInAs("user_alice");
    useQuery.mockReturnValue(row);

    const { rerender, unmount } = render(<UserSync />);
    rerender(<UserSync />);
    unmount();
    // A fresh page load in the same browser session.
    render(<UserSync />);

    expect(refreshFromClerk).toHaveBeenCalledTimes(1);
  });

  it("should create the row first and wait for it before refreshing", () => {
    signedInAs("user_alice");
    useQuery.mockReturnValue(null);

    render(<UserSync />);

    expect(syncCurrentUser).toHaveBeenCalledTimes(1);
    expect(refreshFromClerk).not.toHaveBeenCalled();
  });

  it("should refresh again when a different user signs in", () => {
    signedInAs("user_alice");
    useQuery.mockReturnValue(row);
    const { rerender } = render(<UserSync />);

    signedInAs("user_bob");
    useQuery.mockReturnValue({ ...row, _id: "users_2", clerkId: "user_bob" });
    rerender(<UserSync />);

    expect(refreshFromClerk).toHaveBeenCalledTimes(2);
  });

  it("should retry on the next page load when the refresh fails", async () => {
    signedInAs("user_alice");
    useQuery.mockReturnValue(row);
    refreshFromClerk.mockRejectedValueOnce(new Error("network"));

    const { unmount } = render(<UserSync />);
    await vi.waitFor(() =>
      expect(sessionStorage.length).toBe(0),
    );
    unmount();
    render(<UserSync />);

    expect(refreshFromClerk).toHaveBeenCalledTimes(2);
  });

  it("should do nothing while signed out", () => {
    useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false, userId: null });
    useQuery.mockReturnValue(undefined);

    render(<UserSync />);

    expect(syncCurrentUser).not.toHaveBeenCalled();
    expect(refreshFromClerk).not.toHaveBeenCalled();
  });
});
