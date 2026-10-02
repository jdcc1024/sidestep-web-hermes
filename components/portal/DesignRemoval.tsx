"use client";

import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { TriangleAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { describeSubmitters } from "@/lib/designRemoval";
import { REVEAL_TRANSITION } from "@/lib/motion";
import { itemCountText } from "@/lib/orderItem";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The two halves of the relabel/remove design warning (O-08), reading the
// order's items (L-04) — so an order with no order form, whose items the
// captain added, warns just the same.
//
// Both are deliberately non-blocking: removing a design is a save away, and
// neither surface can stop it. The warning is a *preview* of the fallout
// (how many items drop, and which players sent some) and the removed-designs
// section is the durable receipt afterwards — the items are never deleted,
// they just fall out of the production count.
//
// Relabel needs no surface at all: items point at `designId`, so a renamed
// design carries its items over and simply renders under its new title
// everywhere.

// Pre-save: shown in the order form for a design the captain has just
// unchecked. Silent while loading and when the design has no items — there's
// nothing to orphan, so there's nothing to warn about.
export function DesignRemovalWarning({
  orderId,
  designId,
  title,
}: {
  orderId: Id<"orders">;
  designId: Id<"designs">;
  title?: string;
}) {
  const affected = useQuery(api.orderItems.affectedByDesignRemoval, {
    orderId,
    designId,
  });

  if (affected === undefined || affected.itemCount === 0) return null;

  const submitters = describeSubmitters(affected.submitters);

  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <TriangleAlert aria-hidden />
      <AlertTitle>
        Removing {title ? `“${title}”` : "this design"} drops{" "}
        {itemCountText(affected.itemCount)} from your order
      </AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-200/90">
        {submitters && `${submitters} sent items for it. `}
        Nothing is deleted: the items stay saved and show as removed on the
        order page, so you can link the design again any time.
      </AlertDescription>
    </Alert>
  );
}

// The section's whole travel is its own height (N-08). Fading in place would
// still drop the page below it by the section's full height in one frame,
// which is the layout glitch this animation exists to stop being — the
// content underneath has to be pushed, so it may as well be pushed visibly.
//
// Module constants rather than inline literals so the target identity is
// stable across renders, and `height` because Motion counts it as a
// positional value: `MotionConfig reducedMotion="user"` snaps it while
// leaving the fade alone, so reduced motion gets the section appearing with
// no movement at all rather than a suppressed transform over a moving box.
const SECTION_COLLAPSED = { height: 0, opacity: 0 };
const SECTION_EXPANDED = { height: "auto", opacity: 1 };

// `summarize` titles a design it couldn't load as "".
const UNTITLED = "Untitled design";

// Post-save: the durable "these designs were removed" section on the order
// detail page. Reads the same `listForOrder` subscription as the order list,
// so the two can't disagree about what's on the order.
export function RemovedDesigns({ orderId }: { orderId: Id<"orders"> }) {
  const removed = useQuery(api.orderItems.listForOrder, { orderId })
    ?.removedDesigns;

  // Loading is not emptiness, and the difference is the animation. Bailing
  // here — rather than folding `undefined` in with `length === 0` below —
  // means `AnimatePresence` first mounts on the render that already knows the
  // answer, so `initial={false}` can suppress the entrance for a section that
  // was removed long before this visit. A Convex query always resolves after
  // first paint; without the split, every page load would play the reveal.
  // A null list (signed out, order gone) has nothing to show either.
  if (removed === undefined) return null;

  return (
    <AnimatePresence initial={false}>
      {removed.length > 0 && (
        <motion.section
          key="removed-designs"
          aria-labelledby="removed-designs-heading"
          initial={SECTION_COLLAPSED}
          animate={SECTION_EXPANDED}
          exit={SECTION_COLLAPSED}
          transition={REVEAL_TRANSITION}
          // `overflow-hidden` is what makes the height animation a reveal
          // rather than a clipped-then-overflowing box, and it also contains
          // the spacing: the gap above the heading is `pt-10` on the inner
          // div, not a margin on the section, so it grows with the reveal
          // instead of jumping to 40px on the first frame.
          className="overflow-hidden"
        >
          <div className="pt-10">
            <h2
              id="removed-designs-heading"
              className="text-lg font-semibold text-foreground"
            >
              Removed designs
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These are off the order, so they don&apos;t count toward
              production — but their items are still here. Nothing was
              deleted.
            </p>

            <div className="mt-4 space-y-4">
              {removed.map((design) => (
                <Card
                  key={design.designId}
                  aria-label={`Removed design: ${design.title || UNTITLED}`}
                  className="border-dashed py-5"
                >
                  <CardHeader className="gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base text-muted-foreground line-through">
                        {design.title || UNTITLED}
                      </CardTitle>
                      <Badge
                        className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                      >
                        Removed
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {design.submitters.length > 0 &&
                      `${describeSubmitters(design.submitters)} sent items for this. `}
                    The {itemCountText(design.itemCount)} on it no longer
                    count. Link the design again from Edit order to bring them
                    back in.
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
