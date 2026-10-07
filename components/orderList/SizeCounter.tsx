"use client";

import { MinusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// One size control: tap the size to add one, `−` to take one back. Shared by
// the order list's player sheet and the public form's fixed-mode grid (R2-02,
// UX §5). A fixed footprint so a tap never reflows the grid: three
// constant-width zones (a decrement slot, the size label, a count badge),
// where the minus and the count only render when active but their slots are
// always reserved. 44px tall, so every tap target clears the touch minimum.
export function SizeCounter({
  size,
  playerName,
  qty,
  max,
  onAdd,
  onRemove,
  className,
}: {
  size: string;
  // Names the buttons for a screen reader: `Add one M for Sidestep #72`.
  // Absent while the player has no name yet: `Add one M`.
  playerName?: string;
  qty: number;
  // `+` is disabled at this count (MAX_QTY in the sheet).
  max?: number;
  onAdd: () => void;
  onRemove: () => void;
  className?: string;
}) {
  const active = qty > 0;
  const forWhom = playerName ? ` for ${playerName}` : "";
  return (
    <div
      className={cn(
        "flex h-11 min-w-[6.25rem] items-center rounded-md border text-sm font-medium transition",
        active
          ? "border-primary bg-primary/10"
          : "border-input bg-background hover:border-ring",
        className,
      )}
    >
      <span className="flex h-full w-9 shrink-0 items-center justify-center">
        {active && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove one ${size}${forWhom}`}
            className="flex h-full w-full items-center justify-center rounded-l-md text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <MinusIcon aria-hidden className="h-4 w-4" />
          </button>
        )}
      </span>
      <button
        type="button"
        onClick={onAdd}
        disabled={max !== undefined && qty >= max}
        aria-label={`Add one ${size}${forWhom}`}
        className={cn(
          "h-full min-w-0 flex-1 px-1 text-center outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
          active ? "text-primary" : "text-foreground",
        )}
      >
        {size}
      </button>
      <span className="flex w-8 shrink-0 items-center justify-center">
        {active && (
          <Badge
            variant="secondary"
            className="h-5 min-w-5 justify-center rounded-full bg-primary px-1 text-xs tabular-nums text-primary-foreground"
          >
            {qty}
          </Badge>
        )}
      </span>
    </div>
  );
}
