// Pure helpers for the captain's jersey-run dashboard (issue 2-10).
// Splitting them out keeps the page component thin and lets the date
// arithmetic — which is easy to get wrong around DST and the "today"
// edge case — be unit-tested without a DOM.

import { calculateEstimate, type EstimateResult } from "./pricing";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Days remaining until the deadline, rounded UP so a deadline 36 hours
// away reads "2 days" instead of "1 day" — captains underestimate, then
// people miss the cutoff. Returns 0 once the deadline has passed; the
// dashboard switches to a "closed" label for that case.
export function daysUntilDeadline(
  deadline: number,
  now: number = Date.now(),
): number {
  if (deadline <= now) return 0;
  return Math.ceil((deadline - now) / MS_PER_DAY);
}

export type DeadlineStatus =
  | { kind: "closesIn"; days: number; label: string }
  | { kind: "closesToday"; label: string }
  | { kind: "closed"; label: string };

// Human-readable deadline label for the dashboard header. Three states:
//   • closesIn: future, > 0 days away ("Closes in 3 days")
//   • closesToday: < 24h away but not yet passed
//   • closed: deadline has passed (shows the original closure date)
//
// Locale formatting is deliberately undefined-locale so it respects the
// captain's browser settings (en-CA vs en-US date order, etc.).
export function describeDeadline(
  deadline: number,
  now: number = Date.now(),
): DeadlineStatus {
  if (deadline <= now) {
    const date = new Date(deadline).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    return { kind: "closed", label: `Closed on ${date}` };
  }

  const days = daysUntilDeadline(deadline, now);
  if (days <= 1) {
    return { kind: "closesToday", label: "Closes today" };
  }
  return {
    kind: "closesIn",
    days,
    label: `Closes in ${days} days`,
  };
}

export function participationLabel(count: number): string {
  if (count === 0) return "No responses yet";
  if (count === 1) return "1 response so far";
  return `${count} responses so far`;
}

// Live price estimate at the current response count. The design fee
// piggybacks on the order's hasOwnDesign flag — if the captain has their
// own design, no design fee; otherwise Sidestep is on the hook for it.
// Returns a quantity-0 estimate when no responses have come in yet so the
// dashboard can still render the row without a divide-by-zero.
export function estimateForResponses(
  responseCount: number,
  order: { hasOwnDesign: boolean },
): EstimateResult {
  return calculateEstimate(responseCount, !order.hasOwnDesign);
}
