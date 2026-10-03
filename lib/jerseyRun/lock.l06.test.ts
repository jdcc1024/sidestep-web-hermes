// L-06 acceptance (Q1 = A): the deadline only closes the order form. A run is
// `open` or `closed`; nothing here locks, and the lock helpers are gone.
import { describe, expect, it } from "vitest";
import * as lock from "./lock";

const NOW = 1_800_000_000_000;
const PAST = NOW - 1000;
const FUTURE = NOW + 1000;

describe("effectiveStatus after L-06 (the deadline only closes the form)", () => {
  it("open + past deadline → closed", () => {
    expect(lock.effectiveStatus({ status: "open", deadline: PAST }, NOW)).toBe("closed");
  });
  it("open + future deadline → open; closed stays closed", () => {
    expect(lock.effectiveStatus({ status: "open", deadline: FUTURE }, NOW)).toBe("open");
    expect(lock.effectiveStatus({ status: "closed", deadline: FUTURE }, NOW)).toBe("closed");
    expect(lock.effectiveStatus({ status: "closed", deadline: PAST }, NOW)).toBe("closed");
  });
  it("never returns locked", () => {
    for (const status of ["open", "closed"] as const)
      for (const deadline of [PAST, FUTURE])
        expect(lock.effectiveStatus({ status, deadline }, NOW)).not.toBe("locked");
  });
  it("drops isLocked, canLock, canUnlock and statusAfterUnlock", () => {
    const exported = lock as Record<string, unknown>;
    for (const name of ["isLocked", "canLock", "canUnlock", "statusAfterUnlock"])
      expect(exported[name], name).toBeUndefined();
  });
});
