"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRightIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { calculateEstimate, DESIGN_FEE } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

type PricingCalculatorProps = {
  /** Raw field text, owned by the section so the tier cards can follow it. */
  quantityText: string;
  onQuantityTextChange: (value: string) => void;
};

export function PricingCalculator({
  quantityText,
  onQuantityTextChange,
}: PricingCalculatorProps) {
  const [hasDesignFee, setHasDesignFee] = useState(false);

  const parsed = Number.parseInt(quantityText, 10);
  const estimate = calculateEstimate(parsed, hasDesignFee);
  const intakeQty = Number.isFinite(parsed) && parsed > 0 ? parsed : 10;

  const quantityId = useId();
  const designFeeId = useId();
  const outputId = useId();

  return (
    <Card className="gap-6 p-6 sm:p-8">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Estimate your order
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your jersey count to see live pricing.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={quantityId}>Number of jerseys</Label>
            <Input
              id={quantityId}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={quantityText}
              onChange={(event) => onQuantityTextChange(event.target.value)}
              className="h-11 text-lg font-semibold"
              aria-describedby={outputId}
            />
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id={designFeeId}
              checked={hasDesignFee}
              onCheckedChange={(checked) => setHasDesignFee(checked === true)}
              className="mt-1"
            />
            <Label
              htmlFor={designFeeId}
              className="flex flex-col items-start gap-0.5 text-sm font-normal text-muted-foreground"
            >
              <span className="font-medium text-foreground">
                Add design help
              </span>
              <span>
                I don&apos;t have my own design — add a flat{" "}
                {currency.format(DESIGN_FEE)} design fee.
              </span>
            </Label>
          </div>
        </div>

        <div
          id={outputId}
          aria-live="polite"
          className="flex flex-col justify-between rounded-xl bg-muted/60 p-6"
        >
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Per jersey</dt>
              <dd className="font-semibold text-foreground">
                {currency.format(estimate.perUnitPrice)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                Jerseys subtotal ({estimate.quantity})
              </dt>
              <dd className="font-semibold text-foreground">
                {currency.format(estimate.subtotal)}
              </dd>
            </div>
            {estimate.designFee > 0 && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Design fee</dt>
                <dd className="font-semibold text-foreground">
                  {currency.format(estimate.designFee)}
                </dd>
              </div>
            )}
            <Separator />
            <div className="flex items-baseline justify-between">
              <dt className="text-base font-semibold text-foreground">
                Estimated total
              </dt>
              <dd className="text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-300">
                {currency.format(estimate.total)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Estimated cost — final quote confirmed by Sidestep.
          </p>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Ready to lock in your numbers?
        </p>
        <Link
          href={`/intake?qty=${intakeQty}`}
          className={cn(
            buttonVariants({ size: "lg" }),
            "h-11 bg-teal-600 px-5 text-sm text-white shadow-sm hover:bg-teal-700"
          )}
        >
          Get your official quote
          <ArrowRightIcon aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
