import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// The freeze, said out loud (O-06). Once the roster is locked the order is
// the confirmed production basis, so every edit affordance disappears — and
// a vanished button with no explanation reads as a bug. This note is that
// explanation, and it's deliberately the *whole* affordance: there is no
// "request a change" flow, the captain emails Sidestep (PRD §6).
//
// Shared by the order detail page and the edit route so both surfaces say
// the same thing in the same words.
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
      <p>
        <span className="font-semibold">
          Locked — contact Sidestep to change.
        </span>{" "}
        Your roster is confirmed, so this order&apos;s details are frozen while
        we put it into production. Your designs stay editable on their own
        pages.
      </p>
    </div>
  );
}
