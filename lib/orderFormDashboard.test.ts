import { describe, expect, it } from "vitest";
import {
  daysUntilDeadline,
  describeDeadline,
  estimateForResponses,
  participationLabel,
} from "./orderFormDashboard";

const NOW = Date.parse("2026-05-22T12:00:00.000Z");

function daysFromNow(days: number, hours = 0): number {
  return NOW + days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000;
}

describe("daysUntilDeadline", () => {
  it("returns 0 when the deadline has already passed", () => {
    expect(daysUntilDeadline(daysFromNow(-1), NOW)).toBe(0);
  });

  it("returns 0 when the deadline is now", () => {
    expect(daysUntilDeadline(NOW, NOW)).toBe(0);
  });

  it("rounds partial days up so 36 hours reads as 2 days", () => {
    expect(daysUntilDeadline(daysFromNow(1, 12), NOW)).toBe(2);
  });

  it("returns 1 for a deadline 6 hours away", () => {
    expect(daysUntilDeadline(daysFromNow(0, 6), NOW)).toBe(1);
  });

  it("returns 7 for a week away", () => {
    expect(daysUntilDeadline(daysFromNow(7), NOW)).toBe(7);
  });
});

describe("describeDeadline", () => {
  it("returns closed state once the deadline has passed", () => {
    const status = describeDeadline(daysFromNow(-2), NOW);
    expect(status.kind).toBe("closed");
    expect(status.label.startsWith("Closed on ")).toBe(true);
  });

  it("returns closesToday for deadlines less than a day away", () => {
    const status = describeDeadline(daysFromNow(0, 6), NOW);
    expect(status.kind).toBe("closesToday");
    expect(status.label).toBe("Closes today");
  });

  it("returns closesIn for multi-day deadlines", () => {
    const status = describeDeadline(daysFromNow(3), NOW);
    expect(status.kind).toBe("closesIn");
    if (status.kind === "closesIn") {
      expect(status.days).toBe(3);
      expect(status.label).toBe("Closes in 3 days");
    }
  });
});

describe("participationLabel", () => {
  it("handles zero", () => {
    expect(participationLabel(0)).toBe("No responses yet");
  });

  it("uses singular for one", () => {
    expect(participationLabel(1)).toBe("1 response so far");
  });

  it("uses plural for more than one", () => {
    expect(participationLabel(12)).toBe("12 responses so far");
  });
});

describe("estimateForResponses", () => {
  it("returns a zero-quantity estimate when no responses are in yet", () => {
    const result = estimateForResponses(0, { hasOwnDesign: true });
    expect(result.quantity).toBe(0);
    expect(result.total).toBe(0);
  });

  it("excludes the design fee when the captain has their own design", () => {
    const result = estimateForResponses(12, { hasOwnDesign: true });
    expect(result.quantity).toBe(12);
    expect(result.designFee).toBe(0);
    // 12 jerseys falls in the 10–25 tier at $50/unit.
    expect(result.perUnitPrice).toBe(50);
    expect(result.total).toBe(600);
  });

  it("includes the design fee when Sidestep is doing the design", () => {
    const result = estimateForResponses(12, { hasOwnDesign: false });
    expect(result.designFee).toBe(125);
    expect(result.total).toBe(725);
  });
});
