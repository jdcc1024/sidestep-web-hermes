"use client";

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

import {
  INSTANT,
  REVEAL_AMOUNT,
  REVEAL_TRANSITION,
  STAGGER_OFFSET,
  STAGGER_STEP,
} from "@/lib/motion";
import { NoScriptRevealFallback, useUnscrolledRenderer } from "./Reveal";

/**
 * The second layer of the landing page's entrance: `<Reveal>` brings a section
 * in as one block, `<StaggerGroup>` brings the cards *inside* it in one after
 * another, guiding the eye across the row instead of dropping it all at once.
 *
 * Split into a group and an item for the same architectural reason `<Reveal>`
 * takes `children`: variants reach a child through React context, not through
 * markup ownership, so a server-rendered card handed to `<StaggerItem>` takes
 * its turn in the sequence without its section needing `"use client"`. That is
 * what lets `ProcessSection` stay a server component — the alternative, making
 * each card a `motion` element in place, converts the whole section for it.
 */

/**
 * The group contributes timing only. It deliberately holds no `opacity`, so
 * nothing is serialized onto the container itself and a group whose children
 * somehow never animate still leaves a visible grid behind.
 */
const CONTAINER: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: STAGGER_STEP } },
};

/**
 * Only `opacity` and `y` move. These cards sit above the fold on tall screens
 * and inside a section that is itself rising, so anything that reflows would
 * turn a two-layer entrance into two layers of layout shift.
 */
const ITEM: Variants = {
  hidden: { opacity: 0, y: STAGGER_OFFSET },
  shown: { opacity: 1, y: 0, transition: REVEAL_TRANSITION },
};

/** Same end state, reached in one frame. See `useUnscrolledRenderer`. */
const CONTAINER_SETTLED: Variants = { hidden: {}, shown: {} };
const ITEM_SETTLED: Variants = {
  hidden: { opacity: 0, y: STAGGER_OFFSET },
  shown: { opacity: 1, y: 0, transition: INSTANT },
};

const GROUP_ELEMENTS = { div: motion.div, ol: motion.ol, ul: motion.ul };
const ITEM_ELEMENTS = { div: motion.div, li: motion.li };

type StaggerGroupProps = {
  children: ReactNode;
  /** Rendered tag. Pick the one the content already deserved — `ol` for steps. */
  as?: keyof typeof GROUP_ELEMENTS;
  className?: string;
};

export function StaggerGroup({
  children,
  as = "div",
  className,
}: StaggerGroupProps) {
  const settleImmediately = useUnscrolledRenderer();
  const Group = GROUP_ELEMENTS[as];

  return (
    <>
      <NoScriptRevealFallback />
      <Group
        className={className}
        initial="hidden"
        // `whileInView` propagates the variant label to every `StaggerItem`
        // below through context; `animate` covers the renderer that never
        // scrolls. Whichever resolves first wins and `once: true` keeps it.
        animate={settleImmediately ? "shown" : undefined}
        whileInView="shown"
        viewport={{ once: true, amount: REVEAL_AMOUNT }}
        variants={settleImmediately ? CONTAINER_SETTLED : CONTAINER}
      >
        {children}
      </Group>
    </>
  );
}

type StaggerItemProps = {
  children: ReactNode;
  /** Rendered tag. `li` when the group is a list. */
  as?: keyof typeof ITEM_ELEMENTS;
  className?: string;
};

/**
 * One turn in the sequence. It carries no trigger of its own — it takes the
 * variant label from whichever `StaggerGroup` is above it, which is what makes
 * the order the group's business and the appearance the item's.
 */
export function StaggerItem({
  children,
  as = "div",
  className,
}: StaggerItemProps) {
  const settleImmediately = useUnscrolledRenderer();
  const Item = ITEM_ELEMENTS[as];

  return (
    <Item
      data-reveal
      className={className}
      variants={settleImmediately ? ITEM_SETTLED : ITEM}
    >
      {children}
    </Item>
  );
}
