"use client";

import { motion } from "motion/react";
import { useSyncExternalStore, type ReactNode } from "react";

import {
  INSTANT,
  REVEAL_AMOUNT,
  REVEAL_OFFSET,
  revealTransition,
} from "@/lib/motion";

/**
 * Fades and rises its children the first time they scroll into view.
 *
 * `children` is a prop rather than something this component constructs, which
 * is the whole architectural point: a client component may render children that
 * were rendered on the server. Wrapping the landing sections in `app/page.tsx`
 * therefore gives them a scroll reveal without any of them becoming a client
 * component. Putting `"use client"` in the sections themselves would work
 * visually and cost the whole page its RSC boundary.
 */

/**
 * Motion serializes `initial` into the server HTML as an inline `opacity: 0`,
 * so with scripting off there is nothing left to ever turn it back on — the
 * page would render as six invisible sections. This stylesheet is parsed only
 * in that case and undoes it. It is emitted per instance; six inert copies in
 * the no-JS path is a cheaper guarantee than one that lives somewhere else and
 * can be deleted without anyone connecting it to this file.
 */
const NO_SCRIPT_FALLBACK =
  "<style>[data-reveal]{opacity:1!important;transform:none!important}</style>";

/**
 * The other way a scroll reveal strands content: a renderer that never scrolls.
 *
 * Playwright takes `fullPage` screenshots by painting the whole document at
 * once rather than scrolling through it, so IntersectionObserver never fires
 * for anything below the fold and `node scripts/snap.mjs` files five blank
 * sections as the review artifact. `navigator.webdriver` is the signal for
 * "nothing here is going to scroll", which is exactly the condition under which
 * holding content back buys nothing. The reveal *animation* stays covered —
 * `scripts/check-reduced-motion.mjs` opts back out of this and asserts the
 * movement frame by frame.
 *
 * Read through `useSyncExternalStore` because the server cannot know the answer:
 * it renders the server snapshot, hydrates against it, then re-renders with the
 * client's. Reading `navigator` during render instead would be a hydration
 * mismatch, and setting state from an effect is what the React Compiler's lint
 * rules reject. Nothing subscribes — the value cannot change mid-session.
 */
const neverChanges = () => () => {};
const readWebdriver = () => navigator.webdriver;
const assumeHuman = () => false;

function useUnscrolledRenderer() {
  return useSyncExternalStore(neverChanges, readWebdriver, assumeHuman);
}

type RevealProps = {
  children: ReactNode;
  /** Seconds to hold before starting, for staggering siblings. */
  delay?: number;
  /** Pixels the element rises through. Smaller reads calmer. */
  offset?: number;
  className?: string;
};

export function Reveal({
  children,
  delay = 0,
  offset = REVEAL_OFFSET,
  className,
}: RevealProps) {
  const settleImmediately = useUnscrolledRenderer();

  return (
    <>
      <noscript dangerouslySetInnerHTML={{ __html: NO_SCRIPT_FALLBACK }} />
      <motion.div
        data-reveal
        className={className}
        initial={{ opacity: 0, y: offset }}
        // `whileInView` outranks `animate` while the element is on screen, so
        // these coexist: whichever arrives first wins and `once: true` keeps it.
        animate={settleImmediately ? { opacity: 1, y: 0 } : undefined}
        whileInView={{ opacity: 1, y: 0 }}
        // once: true — this page is scrolled up and down while people compare
        // pricing tiers, and a section that re-animates every pass reads as a
        // glitch rather than as polish.
        viewport={{ once: true, amount: REVEAL_AMOUNT }}
        transition={settleImmediately ? INSTANT : revealTransition(delay)}
      >
        {children}
      </motion.div>
    </>
  );
}
