import { cn } from "@/lib/utils";

// A size with its count, `M×3` (0004 size chips §4): the size bold, the count
// teal, so the eye can read down either. Weight still separates them in
// greyscale. The DOM text is exactly `sizeQtyText`'s, nothing hidden or
// added, so screen readers and text lookups see `M×3`. For chips and the
// footer only; sentences use the plain text.
export function SizeQty({
  size,
  qty,
  countWeight = "normal",
}: {
  size: string;
  qty: number;
  // The footer's 14px text on `bg-muted/50` wants a heavier count (§8).
  countWeight?: "normal" | "medium";
}) {
  return (
    <>
      <span className="font-semibold text-foreground">{size}</span>
      <span
        className={cn(
          "ml-px text-teal-700 dark:text-teal-300",
          countWeight === "medium" ? "font-medium" : "font-normal",
        )}
      >
        ×{qty}
      </span>
    </>
  );
}
