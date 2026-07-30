export type PricingTier = {
  /** Inclusive lower bound of the tier. */
  min: number;
  /** Inclusive upper bound, or null for the open-ended top tier. */
  max: number | null;
  pricePerUnit: number;
  /** Short marketing line shown on the tier's pricing card. */
  tagline: string;
  /** The tier we spotlight before a visitor tells us their team size. */
  popular?: boolean;
};

export const PRICING_TIERS: ReadonlyArray<PricingTier> = [
  { min: 5, max: 9, pricePerUnit: 60, tagline: "Small squads" },
  {
    min: 10,
    max: 24,
    pricePerUnit: 50,
    tagline: "Our most popular tier",
    popular: true,
  },
  { min: 25, max: 49, pricePerUnit: 45, tagline: "Full teams" },
  { min: 50, max: null, pricePerUnit: 40, tagline: "Clubs & leagues" },
];

export const DESIGN_FEE = 125;

export const MIN_ORDER_QUANTITY = PRICING_TIERS[0].min;

export const POPULAR_TIER_INDEX = Math.max(
  PRICING_TIERS.findIndex((tier) => tier.popular),
  0
);

/**
 * Heading for a tier card. Derived from min/max so a displayed range can never
 * drift from the quantity that actually earns the price.
 */
export function formatTierRange(tier: PricingTier): string {
  return tier.max === null
    ? `${tier.min}+ jerseys`
    : `${tier.min}–${tier.max} jerseys`;
}

/**
 * Which tier card the UI should spotlight for `quantity`. Unlike the pricing
 * lookup this never answers "no tier": a quantity under the minimum order still
 * points at the entry tier, because that is the tier the visitor is reaching
 * for. Returns null only when there is no quantity to reason about at all.
 */
export function spotlightTierIndex(quantity: number): number | null {
  if (!Number.isFinite(quantity) || quantity < 1) return null;
  const safeQuantity = Math.floor(quantity);
  const index = PRICING_TIERS.findIndex((tier) => {
    const withinMin = safeQuantity >= tier.min;
    const withinMax = tier.max === null || safeQuantity <= tier.max;
    return withinMin && withinMax;
  });
  return index === -1 ? 0 : index;
}

export type EstimateResult = {
  quantity: number;
  perUnitPrice: number;
  subtotal: number;
  designFee: number;
  total: number;
};

function tierFor(quantity: number): PricingTier | null {
  for (const tier of PRICING_TIERS) {
    const withinMin = quantity >= tier.min;
    const withinMax = tier.max === null || quantity <= tier.max;
    if (withinMin && withinMax) return tier;
  }
  return null;
}

export function calculateEstimate(
  quantity: number,
  hasDesignFee: boolean
): EstimateResult {
  const safeQuantity =
    Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0;

  if (safeQuantity === 0) {
    return {
      quantity: 0,
      perUnitPrice: 0,
      subtotal: 0,
      designFee: 0,
      total: 0,
    };
  }

  const tier = tierFor(safeQuantity);
  const perUnitPrice = tier ? tier.pricePerUnit : 0;
  const subtotal = perUnitPrice * safeQuantity;
  const designFee = hasDesignFee ? DESIGN_FEE : 0;

  return {
    quantity: safeQuantity,
    perUnitPrice,
    subtotal,
    designFee,
    total: subtotal + designFee,
  };
}
