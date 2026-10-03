// L-06 acceptance (Q1 = A): the list is locked exactly when the internal stage
// "Order Size Confirmed" has a completedAt. Pure; the deadline plays no part.
import { describe, expect, it } from "vitest";
import { isListConfirmed } from "./lock";

const stage = (name: string, completedAt?: number) =>
  completedAt === undefined ? { name } : { name, completedAt };

describe("isListConfirmed (Q1 = A)", () => {
  it("is true when Order Size Confirmed has a completedAt", () => {
    expect(
      isListConfirmed({
        internalStages: [stage("Inquiry", 1), stage("Order Size Confirmed", 2)],
      }),
    ).toBe(true);
  });

  it("is false when the stage is absent or unchecked", () => {
    expect(isListConfirmed({ internalStages: [stage("Inquiry", 1)] })).toBe(false);
    expect(
      isListConfirmed({
        internalStages: [stage("Inquiry", 1), stage("Order Size Confirmed")],
      }),
    ).toBe(false);
  });

  it("ignores other stages, however late: only this one locks", () => {
    expect(
      isListConfirmed({
        internalStages: [stage("Sent to supplier", 5), stage("Production", 6)],
      }),
    ).toBe(false);
  });
});
