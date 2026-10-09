"use client";

import { motion, useIsPresent } from "motion/react";
import { EllipsisIcon } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  isBlankPlayer,
  jerseyCountText,
  playerLabel,
} from "@/lib/orderItem";
import { ROW_TRANSITION } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { DesignationBadge } from "@/components/portal/RosterDesignation";
import { Button } from "@/components/ui/button";
import { PlayerSheet } from "./PlayerSheet";
import type { OrderPlayer } from "./shared";
import { SizeQty } from "./SizeQty";

// A row's entire entrance and exit. Opacity only, on purpose — the reasoning
// lives with `ROW_TRANSITION` in `lib/motion.ts`. Module constants rather than
// object literals so the target identity is stable across renders.
const ROW_HIDDEN = { opacity: 0 };
const ROW_SHOWN = { opacity: 1 };

// One player on the order list (R2-02, UX §4, mockup frame 1):
// `<Name> #<Number>` with its letter, then its size chips (`S×1`, display
// only), the total when it's more than one, or `Needs sizes`. The design's
// blank entry reads `Blank jerseys`. Who added the sizes is in the sheet, not
// on the row (0004 size chips §5). The `⋯` button opens the edit sheet; on a
// locked list it isn't there.
export function PlayerRow({
  ref,
  player,
  players,
  orderId,
  designTitle,
  canEdit,
}: {
  // `popLayout` measures the leaving row before it lifts it out of the flow,
  // so it needs a handle on the real `li` — a row that swallowed the ref would
  // be popped to a zero-size box and collapse mid-fade.
  ref?: React.Ref<HTMLLIElement>;
  player: OrderPlayer;
  // Everyone on this design, so a rename onto one of them can say so.
  players: readonly OrderPlayer[];
  orderId: Id<"orders">;
  designTitle: string;
  canEdit: boolean;
}) {
  const label = playerLabel(player);
  const blank = isBlankPlayer(player);
  const name = player.name?.trim();
  const number = player.number?.trim();
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
      className="flex min-h-14 items-center gap-2 border-t border-border/60 bg-card py-2 pr-1.5 pl-4 sm:pl-6"
    >
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="truncate font-medium text-foreground">
            {blank ? (
              label
            ) : (
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
            )}
          </span>
          <DesignationBadge designation={player.designation} />
        </p>
        {/* Chips wrap, so more sizes make the row taller, never wider. */}
        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs tabular-nums">
          {player.needsSizes ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
              Needs sizes
            </span>
          ) : (
            player.sizes.map((entry) => (
              <span
                key={entry.size}
                className="rounded-full bg-muted px-2 py-0.5"
              >
                <SizeQty size={entry.size} qty={entry.qty} />
              </span>
            ))
          )}
          {player.jerseyCount > 1 && (
            <span className="ml-0.5 text-muted-foreground">
              {jerseyCountText(player.jerseyCount)}
            </span>
          )}
        </p>
      </div>

      {canEdit ? (
        <PlayerSheet
          orderId={orderId}
          designId={player.designId}
          designTitle={designTitle}
          players={players}
          player={player}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Edit ${label}`}
              className="size-10 shrink-0 text-muted-foreground"
            />
          }
        >
          <EllipsisIcon aria-hidden />
        </PlayerSheet>
      ) : (
        // Keeps the chips off the card's edge where the menu would be.
        <span aria-hidden className="w-2.5 shrink-0" />
      )}
    </motion.li>
  );
}
