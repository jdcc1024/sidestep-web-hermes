import { Lock } from "lucide-react";
import { OPS_MAILTO } from "@/lib/contact";
import { cn } from "@/lib/utils";

// The lock, said out loud (O-06, L-06). Once JCC confirms the order size the
// list is the production basis, so every edit affordance disappears — and a
// vanished button with no explanation reads as a bug. This note is that
// explanation, and it's deliberately the *whole* affordance: there is no
// "request a change" flow, the captain emails Sidestep (Q5 = A). Copy is
// verbatim from docs/ux/0004-order-items.md §4 "Locked".
//
// Shared by the order detail page and the edit route so both surfaces say
// the same thing in the same words. The link's ring is on `:focus`, not only
// `:focus-visible`: focus that lands after a mouse click (the CSV menu just
// above) must still show where it is.
export function OrderLockedNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      aria-label="Order locked"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900",
        "dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
        className,
      )}
    >
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0">
        <span className="font-semibold">Locked for production.</span> Your
        list is confirmed and we&apos;re making it now. Need a change?{" "}
        <a
          href={OPS_MAILTO}
          className="rounded-sm font-medium text-teal-700 underline underline-offset-4 hover:text-teal-800 focus:ring-3 focus:ring-ring/50 focus:outline-none dark:text-teal-300 dark:hover:text-teal-200"
        >
          Email us
        </a>{" "}
        and we&apos;ll sort it out.
      </p>
    </div>
  );
}
