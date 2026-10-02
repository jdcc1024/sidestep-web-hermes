"use client";

import { useId, useState } from "react";
import { CheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { buildTimeline, type CustomerStageName } from "@/lib/orderStages";
import { cn } from "@/lib/utils";

type Props = {
  currentStage: CustomerStageName | null;
};

// The customer-facing 8-stage timeline: a horizontal stepper at sm+, and on
// phones one line — "Step 1 of 8 · Order started · See all steps" — that
// opens into the vertical list (L-03). Folded, because eight stacked steps
// pushed the order list a whole screen down on the page a captain opens to
// edit that list. Stage data is derived from `internalStages` upstream
// (lib/orderStages) — only customer-facing labels reach this component so no
// internal stage name can leak.
export function OrderTimeline({ currentStage }: Props) {
  const steps = buildTimeline(currentStage);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  // No stage yet reads as the first step; a delivered order as the last.
  const current = steps.findIndex((step) => step.state === "current");
  const stepIndex =
    current >= 0
      ? current
      : steps.every((step) => step.state === "complete")
        ? steps.length - 1
        : 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <p className="min-w-0 text-sm text-foreground">
          Step {stepIndex + 1} of {steps.length} ·{" "}
          <span className="font-semibold">{steps[stepIndex].name}</span>
        </p>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          className="-mr-2 min-h-10 shrink-0 rounded-md px-2 text-sm font-semibold text-teal-700 outline-none hover:text-teal-800 focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-teal-300 dark:hover:text-teal-200"
        >
          {expanded ? "Hide steps" : "See all steps"}
        </button>
      </div>
      <ol
        id={listId}
        aria-label="Order progress"
        className={cn(
          "gap-4 sm:grid sm:grid-cols-8 sm:gap-2",
          expanded ? "mt-4 grid sm:mt-0" : "hidden",
        )}
      >
        {steps.map((step, idx) => {
          const isCurrent = step.state === "current";
          const isComplete = step.state === "complete";
          return (
            <li
              key={step.name}
              aria-current={isCurrent ? "step" : undefined}
              className="flex items-start gap-3 sm:flex-col sm:items-stretch sm:gap-2"
            >
              <div className="flex items-center sm:flex-col sm:items-stretch">
                <StepDot state={step.state} index={idx} />
                {idx < steps.length - 1 && (
                  <Separator
                    aria-hidden
                    className={`hidden h-0.5 flex-1 sm:block ${
                      isComplete ? "bg-teal-600" : "bg-border"
                    }`}
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
                <p
                  className={`text-sm font-medium ${
                    isCurrent
                      ? "text-teal-700 dark:text-teal-300"
                      : isComplete
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {step.name}
                </p>
                <Badge
                  variant={
                    isCurrent ? "default" : isComplete ? "secondary" : "outline"
                  }
                  className={`w-fit sm:hidden ${
                    isCurrent ? "bg-teal-600 text-white" : ""
                  }`}
                >
                  {isCurrent
                    ? "In progress"
                    : isComplete
                      ? "Complete"
                      : "Upcoming"}
                </Badge>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function StepDot({
  state,
  index,
}: {
  state: "complete" | "current" | "upcoming";
  index: number;
}) {
  const base =
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold";
  if (state === "complete") {
    return (
      <span
        aria-hidden
        className={`${base} border-teal-600 bg-teal-600 text-white`}
      >
        <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span
        aria-hidden
        className={`${base} border-teal-600 bg-card text-teal-700 ring-2 ring-teal-100 dark:text-teal-300 dark:ring-teal-900/40`}
      >
        {index + 1}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`${base} border-border bg-card text-muted-foreground`}
    >
      {index + 1}
    </span>
  );
}
