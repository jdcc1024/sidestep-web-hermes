"use client";

import Link from "next/link";
import { motion, type Variants } from "motion/react";

import { JerseyCarousel } from "@/components/marketing/JerseyCarousel";
import {
  NoScriptRevealFallback,
  useUnscrolledRenderer,
} from "@/components/motion/Reveal";
import { buttonVariants } from "@/components/ui/button";
import {
  HERO_DELAY,
  HERO_OFFSET,
  HERO_STAGGER_STEP,
  HERO_TRANSITION,
  INSTANT,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * `"use client"` here is deliberate and is the narrowest boundary that buys the
 * effect: the hero sits above the fold, so the scroll trigger every other
 * landing section uses can never fire for it, and a per-element stagger needs
 * variants on the elements themselves rather than around them. The section is
 * static content with no data, so the boundary costs the page nothing beyond
 * this one file.
 */

/**
 * Only `opacity` and `y` move. The hero holds the largest contentful paint, so
 * anything that reflows — height, margin, font size — would trade polish for
 * layout shift, which is the one thing an entrance must not do.
 */
const CONTAINER: Variants = {
  hidden: {},
  shown: {
    transition: {
      delayChildren: HERO_DELAY,
      staggerChildren: HERO_STAGGER_STEP,
    },
  },
};

const ITEM: Variants = {
  hidden: { opacity: 0, y: HERO_OFFSET },
  shown: { opacity: 1, y: 0, transition: HERO_TRANSITION },
};

/** Same end state, reached in one frame. See `useUnscrolledRenderer`. */
const CONTAINER_SETTLED: Variants = { hidden: {}, shown: {} };
const ITEM_SETTLED: Variants = {
  hidden: { opacity: 0, y: HERO_OFFSET },
  shown: { opacity: 1, y: 0, transition: INSTANT },
};

export function HeroSection() {
  const settleImmediately = useUnscrolledRenderer();
  const item = settleImmediately ? ITEM_SETTLED : ITEM;

  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-border bg-gradient-to-b from-teal-50/60 to-background dark:from-teal-950/30"
    >
      <NoScriptRevealFallback />
      {/* Variants propagate through plain elements by context, so the text
          column below stays a normal div and its children still take their
          turn in the parent's stagger. */}
      <motion.div
        className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-28"
        initial="hidden"
        animate="shown"
        variants={settleImmediately ? CONTAINER_SETTLED : CONTAINER}
      >
        <div>
          <motion.p
            data-reveal
            variants={item}
            className="text-sm font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300"
          >
            Your Team. Your Colors.
          </motion.p>
          <motion.h1
            data-reveal
            variants={item}
            className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            Custom team jerseys, designed with you.
          </motion.h1>
          <motion.p
            data-reveal
            variants={item}
            className="mt-6 max-w-xl text-lg text-muted-foreground"
          >
            Sidestep is a Vancouver-based custom jersey studio. Backed by 20+
            years of industry experience, we help your team design and produce
            fully sublimated jerseys that reflect your story — from concept to
            delivery.
          </motion.p>
          <motion.div
            data-reveal
            variants={item}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Link
              href="/intake"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 bg-teal-600 px-5 text-sm text-white shadow-sm hover:bg-teal-700",
              )}
            >
              Start your order
            </Link>
            <Link
              href="#process"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-sm")}
            >
              See our process
            </Link>
          </motion.div>
          <motion.p
            data-reveal
            variants={item}
            className="mt-6 text-sm text-muted-foreground"
          >
            Serving the Greater Vancouver area. Most orders ship in around 4
            weeks.
          </motion.p>
        </div>

        <motion.div data-reveal variants={item}>
          <JerseyCarousel />
        </motion.div>
      </motion.div>
    </section>
  );
}
