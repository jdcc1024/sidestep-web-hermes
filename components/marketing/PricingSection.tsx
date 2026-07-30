"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatTierRange,
  MIN_ORDER_QUANTITY,
  POPULAR_TIER_INDEX,
  PRICING_TIERS,
  spotlightTierIndex,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { PricingCalculator } from "./PricingCalculator";

type SpotlightRect = { x: number; y: number; width: number; height: number };

const DEFAULT_QUANTITY = "12";

/**
 * Tells the visitor which tier their quantity landed in (`headline`) and what
 * the next volume break would cost (`nudge`) — this is what makes the moving
 * spotlight read as an answer rather than as decoration.
 */
function tierCaption(
  quantity: number,
  tierIndex: number
): { headline: string; nudge?: string } {
  const tier = PRICING_TIERS[tierIndex];
  const nextTier = PRICING_TIERS[tierIndex + 1];

  if (!Number.isFinite(quantity) || quantity < 1) {
    return { headline: "Enter your team size below to find your tier." };
  }

  const safeQuantity = Math.floor(quantity);
  if (safeQuantity < MIN_ORDER_QUANTITY) {
    return {
      headline: `Orders start at ${MIN_ORDER_QUANTITY} jerseys.`,
      nudge: `That's the ${formatTierRange(tier)} tier at $${
        tier.pricePerUnit
      } each.`,
    };
  }

  const headline = `${safeQuantity} jerseys lands in ${formatTierRange(
    tier
  )} — $${tier.pricePerUnit} per jersey.`;

  if (!nextTier) return { headline, nudge: "That's our best rate." };

  const toNextTier = nextTier.min - safeQuantity;
  return {
    headline,
    nudge: `${toNextTier} more ${
      toNextTier === 1 ? "jersey" : "jerseys"
    } drops it to $${nextTier.pricePerUnit}.`,
  };
}

export function PricingSection() {
  const [quantityText, setQuantityText] = useState(DEFAULT_QUANTITY);

  const quantity = Number.parseInt(quantityText, 10);
  const spotlightIndex = spotlightTierIndex(quantity) ?? POPULAR_TIER_INDEX;
  const caption = tierCaption(quantity, spotlightIndex);

  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    const measureSpotlight = () => {
      const card = cardRefs.current[spotlightIndex];
      // offset* rather than getBoundingClientRect: it is already relative to
      // the grid (our offsetParent) and ignores any transform on the cards. A
      // zero width means there is no layout to measure — server render or
      // jsdom — so the cards fall back to outlining themselves.
      if (!card || card.offsetWidth === 0) {
        setSpotlight(null);
        return;
      }
      const next: SpotlightRect = {
        x: card.offsetLeft,
        y: card.offsetTop,
        width: card.offsetWidth,
        height: card.offsetHeight,
      };
      // Bail on an unchanged rect so a ResizeObserver callback can never feed
      // itself a new render.
      setSpotlight((previous) =>
        previous &&
        previous.x === next.x &&
        previous.y === next.y &&
        previous.width === next.width &&
        previous.height === next.height
          ? previous
          : next
      );
    };

    measureSpotlight();

    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;

    // The grid resizes and re-wraps on viewport changes, zoom, and late font
    // loads; the frame has to follow the card it is framing.
    const observer = new ResizeObserver(measureSpotlight);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [spotlightIndex]);

  return (
    <section
      id="pricing"
      className="border-b border-border bg-background py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
            Pricing
          </p>
          <h2 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Transparent pricing by team size.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            The bigger your order, the lower the per-jersey cost. Use the
            calculator below for a live estimate.
          </p>
        </div>

        <p
          data-testid="tier-caption"
          aria-live="polite"
          className="mt-8 max-w-2xl text-sm font-semibold text-foreground"
        >
          {caption.headline}
          {caption.nudge && (
            <span className="font-normal text-muted-foreground">
              {" "}
              {caption.nudge}
            </span>
          )}
        </p>

        <div
          ref={gridRef}
          className="relative mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {spotlight && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 z-10 rounded-xl shadow-lg shadow-teal-600/25 ring-2 ring-teal-600 transition-[transform,width,height] duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none dark:ring-teal-400"
              style={{
                transform: `translate3d(${spotlight.x}px, ${spotlight.y}px, 0)`,
                width: spotlight.width,
                height: spotlight.height,
              }}
            />
          )}

          {PRICING_TIERS.map((tier, index) => {
            const isSpotlit = index === spotlightIndex;
            const range = formatTierRange(tier);
            return (
              <Card
                key={range}
                ref={(node) => {
                  cardRefs.current[index] = node;
                }}
                data-active={isSpotlit ? "" : undefined}
                aria-current={isSpotlit ? "true" : undefined}
                className={cn(
                  "transition-colors duration-500 motion-reduce:transition-none",
                  isSpotlit && "bg-teal-50/70 dark:bg-teal-950/30",
                  // Until the sliding frame has measured itself, the card
                  // outlines itself so the spotlight is never missing.
                  isSpotlit &&
                    !spotlight &&
                    "shadow-lg ring-2 ring-teal-600 dark:ring-teal-400"
                )}
              >
                <CardContent className="flex flex-col gap-1">
                  <div className="mb-3">
                    <Badge
                      className={cn(
                        "transition-colors duration-500 motion-reduce:transition-none",
                        isSpotlit
                          ? "bg-teal-600 text-white dark:bg-teal-400 dark:text-teal-950"
                          : "bg-muted text-muted-foreground",
                        // Every card reserves the badge row so heights stay
                        // identical and the frame has nothing to chase.
                        !isSpotlit && !tier.popular && "invisible"
                      )}
                    >
                      {isSpotlit
                        ? tier.popular
                          ? "Your tier · most popular"
                          : "Your tier"
                        : "Most popular"}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    {tier.tagline}
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-foreground">
                    {range}
                  </h3>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span
                      className={cn(
                        "text-4xl font-bold tracking-tight transition-colors duration-500 motion-reduce:transition-none",
                        isSpotlit
                          ? "text-teal-700 dark:text-teal-300"
                          : "text-foreground"
                      )}
                    >
                      ${tier.pricePerUnit}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      per jersey
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-12">
          <PricingCalculator
            quantityText={quantityText}
            onQuantityTextChange={setQuantityText}
          />
        </div>
      </div>
    </section>
  );
}
