import type { Transition } from "motion/react";

/**
 * The site's motion vocabulary. Every Motion component draws its transition
 * from here — tuning how the site *feels* is an edit to this file, never a
 * hunt for bezier curves across components.
 *
 * Springs are expressed in physical terms (stiffness/damping/mass) rather than
 * as easing curves because that is what survives a six-month-later tweak:
 * "less bouncy" is `damping` up, not a fourth control point guessed by eye.
 */

/**
 * Shared-element movement — the pricing tier spotlight, the portal sidebar
 * indicator. Settles in roughly half a second with a single soft overshoot:
 * enough life to read as "it moved there", not enough to read as a toy.
 *
 * This replaces the hand-tuned `cubic-bezier(0.34, 1.4, 0.64, 1)` that the
 * spotlight used to carry inline.
 */
export const SPRING_SPOTLIGHT: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 32,
  mass: 1,
};

/**
 * Small UI state changes that should feel immediate — badges, chips, counters.
 * Stiffer and more damped than the spotlight: no overshoot at this size.
 */
export const SPRING_SNAPPY: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 40,
  mass: 0.8,
};

/** Duration (seconds) of a scroll-into-view section reveal. */
export const REVEAL_DURATION = 0.5;

/** How far (px) a revealing element rises into place. */
export const REVEAL_OFFSET = 24;

/** Delay (seconds) between siblings in a staggered entrance. */
export const STAGGER_STEP = 0.08;

/**
 * Fraction of a revealing element that must be in view before it starts.
 * Deliberately small: a tall section whose trigger sat at half its height
 * would still be animating well after the visitor started reading it.
 */
export const REVEAL_AMOUNT = 0.15;

/**
 * Fade-and-rise used by section reveals and staggered card entrances.
 * Eased rather than sprung: a reveal that overshoots reads as a glitch when a
 * dozen of them fire while the visitor scrolls.
 */
export const REVEAL_TRANSITION: Transition = {
  duration: REVEAL_DURATION,
  ease: [0.22, 1, 0.36, 1],
};

/**
 * `REVEAL_TRANSITION` held back by `delay` seconds — the shape staggered
 * entrances need. Lives here so that a component staggering its children still
 * never spells out a duration or an easing curve of its own.
 */
export function revealTransition(delay = 0): Transition {
  return delay ? { ...REVEAL_TRANSITION, delay } : REVEAL_TRANSITION;
}

/**
 * Jump straight to the end state. For the cases where an animation has no
 * audience — a headless screenshot, a restored state — and playing it would
 * only risk being caught half-finished.
 */
export const INSTANT: Transition = { duration: 0 };

/**
 * The hero's load entrance. Separate tokens from the scroll reveal because the
 * constraint is different: the visitor is already looking at this content and a
 * scroll reveal's job — announcing something that just arrived — does not
 * apply. So the rise is shorter, the stagger tighter, and the settle quicker.
 * With six staggered elements the last one is at rest inside 0.8s of paint,
 * which is the budget: nobody waits to read the headline.
 */

/** Pixels a hero element rises through on load. Half a reveal's distance. */
export const HERO_OFFSET = 12;

/** Delay (seconds) between hero siblings. Tighter than {@link STAGGER_STEP}. */
export const HERO_STAGGER_STEP = 0.06;

/** Seconds held before the first hero element starts, covering the paint. */
export const HERO_DELAY = 0.05;

/** Same curve as a reveal, shortened. One easing curve for the whole site. */
export const HERO_TRANSITION: Transition = { ...REVEAL_TRANSITION, duration: 0.45 };

/**
 * Undoes the `opacity: 0` that Motion serializes into the server HTML for any
 * armed entrance. With scripting off there is no hydration left to turn it back
 * on, so without this the page renders as invisible sections and an invisible
 * hero. It lives here, next to the offsets it counteracts, because both the
 * scroll reveal and the hero entrance have to agree on the `[data-reveal]`
 * marker for one rule to cover them all.
 */
export const NO_SCRIPT_REVEAL_FALLBACK =
  "<style>[data-reveal]{opacity:1!important;transform:none!important}</style>";
