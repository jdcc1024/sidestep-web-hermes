"use client";

import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { TriangleAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { describeSubmitters, jerseyCount } from "@/lib/designRemoval";
import { REVEAL_TRANSITION } from "@/lib/motion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The two halves of the relabel/remove design warning (O-08), reading the
// R-05 queries in convex/orderEntries.ts.
//
// Both are deliberately non-blocking: removing a design is a save away, and
// neither surface can stop it. The warning is a *preview* of the fallout
// (who ordered this, how many jerseys drop) and the removed-designs section
// is the durable receipt afterwards — the entries are never deleted, they
// just fall out of the production count.
//
// Relabel needs no surface at all: order entries point at `designId`, so a
// renamed design carries its submissions over and simply renders under its
// new title everywhere.

// Pre-save: shown in the order form for a design the captain has just
// unchecked. Silent while loading and when nobody ordered the design —
// there's no one to orphan, so there's nothing to warn about.
export function DesignRemovalWarning({
  runId,
  designId,
}: {
  runId: Id<"jerseyRuns">;
  designId: Id<"designs">;
}) {
  const affected = useQuery(api.orderEntries.affectedByDesignRemoval, {
    runId,
    designId,
  });

  if (affected === undefined || affected.submitters.length === 0) return null;

  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <TriangleAlert aria-hidden />
      <AlertTitle>
        Removing “{affected.title}” drops {jerseyCount(affected.total)} from
        your count
      </AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-200/90">
        {describeSubmitters(affected.submitters)} already picked it. Their
        entries stay saved — they&apos;ll show as removed on the order page
        instead of disappearing, so you can add the design back any time.
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

// Post-save: the durable "these designs were removed" section on the order
// detail page. `runId` is nullable so the order page can hand over whatever
// `jerseyRuns.getByOrder` returned — no run means nothing was ever
// collected, so nothing to show.
export function RemovedDesigns({
  runId,
}: {
  runId: Id<"jerseyRuns"> | null | undefined;
}) {
  const removed = useQuery(
    api.orderEntries.removedDesigns,
    runId ? { runId } : "skip",
  );

  // Loading is not emptiness, and the difference is the animation. Bailing
  // here — rather than folding `undefined` in with `length === 0` below —
  // means `AnimatePresence` first mounts on the render that already knows the
  // answer, so `initial={false}` can suppress the entrance for a section that
  // was removed long before this visit. A Convex query always resolves after
  // first paint; without the split, every page load would play the reveal.
  if (!runId || removed === undefined) return null;

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
              production — but the submissions are still here. Nothing was
              deleted.
            </p>

            <div className="mt-4 space-y-4">
              {removed.map((design) => (
                <Card
                  key={design.designId}
                  aria-label={`Removed design: ${design.title}`}
                  className="border-dashed py-5"
                >
                  <CardHeader className="gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base text-muted-foreground line-through">
                        {design.title}
                      </CardTitle>
                      <Badge
                        className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                      >
                        Removed
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {describeSubmitters(design.submitters)} ordered this —{" "}
                    {jerseyCount(design.total)} no longer counted. Link the
                    design again from Edit order to bring them back in.
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
