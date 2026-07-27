import { sizeTally, type BreakdownEntry } from "@/lib/jerseyBreakdown";
import { cn } from "@/lib/utils";

// The size run at a glance — "S ×3 · M ×5 · L ×2" — derived from the same
// collected entries the roster reads (C-01). Purely a different projection
// of data already on the page: no query, no state.
//
// Props stay entry-array-shaped so the caller decides the scope: hand it the
// whole roster for the order's combined breakdown, or one design's entries
// for that design's (C-02). Renders nothing when nothing has been collected;
// an empty chip row would just be a hole where a number should be.
export function SizeBreakdown({
  entries,
  className,
}: {
  entries: readonly BreakdownEntry[];
  className?: string;
}) {
  const sizes = sizeTally(entries);
  if (sizes.length === 0) return null;

  return (
    <ul
      aria-label="Size breakdown"
      className={cn("flex flex-wrap gap-2", className)}
    >
      {sizes.map(({ size, qty }) => (
        <li
          key={size}
          className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium tabular-nums text-foreground"
        >
          {size} ×{qty}
        </li>
      ))}
    </ul>
  );
}
