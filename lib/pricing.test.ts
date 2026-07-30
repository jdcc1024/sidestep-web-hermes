import { describe, expect, it } from "vitest";
import {
  calculateEstimate,
  formatTierRange,
  MIN_ORDER_QUANTITY,
  POPULAR_TIER_INDEX,
  PRICING_TIERS,
  DESIGN_FEE,
  spotlightTierIndex,
} from "./pricing";

describe("PRICING_TIERS", () => {
  it("covers every quantity from 5 upward with no gaps", () => {
    let cursor = 5;
    for (const tier of PRICING_TIERS) {
      expect(tier.min).toBe(cursor);
      cursor = tier.max === null ? Infinity : tier.max + 1;
    }
    expect(cursor).toBe(Infinity);
  });

  it("gets cheaper per jersey as tiers grow", () => {
    const prices = PRICING_TIERS.map((tier) => tier.pricePerUnit);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  it("marks exactly one tier popular", () => {
    expect(PRICING_TIERS.filter((tier) => tier.popular)).toHaveLength(1);
    expect(PRICING_TIERS[POPULAR_TIER_INDEX].popular).toBe(true);
  });

  it("starts at the minimum order quantity", () => {
    expect(MIN_ORDER_QUANTITY).toBe(5);
  });
});

describe("formatTierRange", () => {
  it("labels each tier with the exact range that earns its price", () => {
    for (const tier of PRICING_TIERS) {
      // Every quantity the label claims must actually price at that tier, and
      // the first quantity past the label must not.
      expect(calculateEstimate(tier.min, false).perUnitPrice).toBe(
        tier.pricePerUnit
      );
      if (tier.max === null) {
        expect(formatTierRange(tier)).toBe(`${tier.min}+ jerseys`);
        continue;
      }
      expect(formatTierRange(tier)).toBe(`${tier.min}–${tier.max} jerseys`);
      expect(calculateEstimate(tier.max, false).perUnitPrice).toBe(
        tier.pricePerUnit
      );
      expect(calculateEstimate(tier.max + 1, false).perUnitPrice).not.toBe(
        tier.pricePerUnit
      );
    }
  });
});

describe("spotlightTierIndex", () => {
  const cases: Array<[number, number]> = [
    [5, 0],
    [6, 0],
    [9, 0],
    [10, 1],
    [12, 1],
    [24, 1],
    [25, 2],
    [49, 2],
    [50, 3],
    [100, 3],
  ];

  for (const [quantity, expectedIndex] of cases) {
    it(`quantity ${quantity} spotlights tier ${expectedIndex}`, () => {
      expect(spotlightTierIndex(quantity)).toBe(expectedIndex);
    });
  }

  it("moves left for the priciest tier and right for the cheapest", () => {
    const cheapest = PRICING_TIERS.length - 1;
    expect(spotlightTierIndex(6)).toBe(0);
    expect(PRICING_TIERS[0].pricePerUnit).toBe(60);
    expect(spotlightTierIndex(100)).toBe(cheapest);
    expect(PRICING_TIERS[cheapest].pricePerUnit).toBe(40);
  });

  it("clamps quantities under the minimum order to the entry tier", () => {
    expect(spotlightTierIndex(1)).toBe(0);
    expect(spotlightTierIndex(4)).toBe(0);
  });

  it("floors fractional quantities", () => {
    expect(spotlightTierIndex(24.9)).toBe(1);
    expect(spotlightTierIndex(25.1)).toBe(2);
  });

  it("returns null when there is no quantity to reason about", () => {
    expect(spotlightTierIndex(0)).toBeNull();
    expect(spotlightTierIndex(-5)).toBeNull();
    expect(spotlightTierIndex(Number.NaN)).toBeNull();
    expect(spotlightTierIndex(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("agrees with the price the calculator charges", () => {
    for (const quantity of [5, 9, 10, 24, 25, 49, 50, 500]) {
      const index = spotlightTierIndex(quantity);
      expect(index).not.toBeNull();
      expect(PRICING_TIERS[index as number].pricePerUnit).toBe(
        calculateEstimate(quantity, false).perUnitPrice
      );
    }
  });
});

describe("calculateEstimate — tier boundaries (no design fee)", () => {
  const cases: Array<[number, number]> = [
    [1, 0],
    [9, 60],
    [10, 50],
    [24, 50],
    [25, 45],
    [49, 45],
    [50, 40],
    [51, 40],
    [100, 40],
  ];

  for (const [quantity, expectedUnit] of cases) {
    it(`quantity ${quantity} uses $${expectedUnit}/unit`, () => {
      const result = calculateEstimate(quantity, false);
      expect(result.perUnitPrice).toBe(expectedUnit);
      expect(result.subtotal).toBe(quantity * expectedUnit);
      expect(result.designFee).toBe(0);
      expect(result.total).toBe(quantity * expectedUnit);
    });
  }
});

describe("calculateEstimate — design fee toggle", () => {
  it("adds $125 when design fee is enabled", () => {
    const result = calculateEstimate(20, true);
    expect(result.perUnitPrice).toBe(50);
    expect(result.subtotal).toBe(1000);
    expect(result.designFee).toBe(DESIGN_FEE);
    expect(result.designFee).toBe(125);
    expect(result.total).toBe(1125);
  });

  it("does not charge design fee when toggle is off", () => {
    const result = calculateEstimate(20, false);
    expect(result.designFee).toBe(0);
    expect(result.total).toBe(1000);
  });
});

describe("calculateEstimate — zero and invalid quantities", () => {
  it("returns all zeros for quantity 0 even with design fee toggled", () => {
    const result = calculateEstimate(0, true);
    expect(result.quantity).toBe(0);
    expect(result.perUnitPrice).toBe(0);
    expect(result.subtotal).toBe(0);
    expect(result.designFee).toBe(0);
    expect(result.total).toBe(0);
  });

  it("clamps negative quantities to 0", () => {
    const result = calculateEstimate(-5, true);
    expect(result.quantity).toBe(0);
    expect(result.total).toBe(0);
  });

  it("handles NaN by returning zero", () => {
    const result = calculateEstimate(Number.NaN, true);
    expect(result.quantity).toBe(0);
    expect(result.total).toBe(0);
  });

  it("floors fractional quantities", () => {
    const result = calculateEstimate(10.9, false);
    expect(result.quantity).toBe(10);
    expect(result.perUnitPrice).toBe(50);
    expect(result.subtotal).toBe(500);
  });
});
