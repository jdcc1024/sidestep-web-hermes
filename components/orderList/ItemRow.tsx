"use client";

import { motion, useIsPresent } from "motion/react";
import { EllipsisIcon, TriangleAlertIcon } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { itemAddedBy, itemLabel } from "@/lib/orderItem";
import { ROW_TRANSITION } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { DesignationBadge } from "@/components/portal/RosterDesignation";
import { Button } from "@/components/ui/button";
import { ItemSheet } from "./ItemSheet";
import type { OrderItem } from "./shared";

// A row's entire entrance and exit. Opacity only, on purpose — the reasoning
// lives with `ROW_TRANSITION` in `lib/motion.ts`. Module constants rather than
// object literals so the target identity is stable across renders.
const ROW_HIDDEN = { opacity: 0 };
const ROW_SHOWN = { opacity: 1 };

// One item on the order list (UX §4): `<Name> #<Number>` with its letter, who
// added it, its size (or `Needs size`) and its quantity when that isn't one.
// The `⋯` button opens the edit sheet; on a locked list it isn't there.
export function ItemRow({
  ref,
  item,
  orderId,
  designTitle,
  canEdit,
}: {
  // `popLayout` measures the leaving row before it lifts it out of the flow,
  // so it needs a handle on the real `li` — a row that swallowed the ref would
  // be popped to a zero-size box and collapse mid-fade.
  ref?: React.Ref<HTMLLIElement>;
  item: OrderItem;
  orderId: Id<"orders">;
  designTitle: string;
  canEdit: boolean;
}) {
  const label = itemLabel(item);
  const name = item.name?.trim();
  const number = item.number?.trim();
  // A removed row stays in the DOM while it fades out. It is no longer on the
  // list, so take it out of the accessibility tree and the tab order at once:
  // a screen reader must not announce it and Tab must not land on its button.
  const isPresent = useIsPresent();

  return (
    <motion.li
      ref={ref}
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      // Position only: a removed row's neighbours slide up into the gap, but
      // animating a row's own size would scale-distort the text inside it.
      layout="position"
      initial={ROW_HIDDEN}
      animate={ROW_SHOWN}
      exit={ROW_HIDDEN}
      transition={ROW_TRANSITION}
      className="flex min-h-14 items-center gap-2 border-t border-border/60 bg-card py-1.5 pr-1.5 pl-4 sm:pl-6"
    >
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="truncate font-medium text-foreground">
            {name || number ? (
              <>
                {name}
                {/* The space before the number is CSS, not a text node: the
                    row reads "Jordan Lee #4" (screen readers include the
                    pseudo-element), but its DOM text doesn't duplicate the
                    label the admin confirm gate names in its message, so a
                    text lookup on the admin page finds that message alone. */}
                {number && (
                  <span
                    className={cn(
                      "font-normal text-muted-foreground",
                      name && "before:content-['_']",
                    )}
                  >
                    #{number}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{label}</span>
            )}
          </span>
          <DesignationBadge designation={item.designation} />
          {/* Surfaced, never resolved: the captain fixes it by editing, so
              the flag just has to be noticeable. */}
          {item.collision && (
            <span
              title="Two people claimed this"
              className="shrink-0 text-amber-600 dark:text-amber-400"
            >
              <TriangleAlertIcon aria-hidden className="size-3.5" />
              <span className="sr-only">Two people claimed this</span>
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {itemAddedBy(item)}
        </p>
      </div>

      <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums">
        {item.size ? (
          <span className="font-semibold text-foreground">{item.size}</span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
            Needs size
          </span>
        )}
        {item.qty > 1 && (
          <span className="text-muted-foreground">×{item.qty}</span>
        )}
      </span>

      {canEdit ? (
        <ItemSheet
          orderId={orderId}
          designId={item.designId}
          designTitle={designTitle}
          item={item}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Edit ${label}`}
              className="size-10 text-muted-foreground"
            />
          }
        >
          <EllipsisIcon aria-hidden />
        </ItemSheet>
      ) : (
        // Keeps the size column off the card's edge where the menu would be.
        <span aria-hidden className="w-2.5 shrink-0" />
      )}
    </motion.li>
  );
}
