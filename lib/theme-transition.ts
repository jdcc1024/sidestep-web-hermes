import { EASE_OUT_CSS, THEME_CROSSFADE_MS, THEME_REVEAL_MS } from "./motion";

/**
 * Animating the light/dark swap.
 *
 * Every other transition on this site animates *an element*. This one animates
 * the whole document at once — every colour, border, shadow, icon and image
 * changes in the same instant — which is why it uses the View Transitions API
 * rather than anything in `lib/motion.ts`'s Motion vocabulary. The browser
 * snapshots the page before and after the class change and animates between the
 * two images, so one mechanism covers every page without a single per-element
 * rule.
 *
 * This is deliberately *not* "remove `disableTransitionOnChange` and put
 * `transition-colors` on everything": there are ~80 unrelated `transition-*`
 * classes in the codebase, and letting each animate its own property at its own
 * duration makes a theme swap smear instead of change.
 */

export type ThemeTransitionVariant = "crossfade" | "circle";

/**
 * Marks the document while a swap is in flight. `app/globals.css` uses it to
 * switch off the browser's default crossfade — the animations here replace it —
 * scoped so that any future view transition (a route change, say) is untouched.
 */
export const THEME_TRANSITION_ATTR = "data-theme-transition";

/** How long we will wait for the theme owner to actually change the class. */
const APPLY_TIMEOUT_MS = 300;

/**
 * Identifies the most recently started swap. Clicking the toggle again
 * mid-transition starts a second one and the browser abandons the first; the
 * loser must not strip {@link THEME_TRANSITION_ATTR} off the document on its
 * way out, because the winner is still relying on it.
 */
let latestSwap = 0;

export interface SwapThemeOptions {
  /** The theme that should be on `<html>` once this resolves. */
  theme: string;
  /** Hands the new theme to whoever owns it — in practice next-themes. */
  apply: (theme: string) => void;
  variant: ThemeTransitionVariant;
  /** Element the circle grows from. Ignored by `crossfade`. */
  origin?: Element | null;
}

interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
}

type StartViewTransition = (callback: () => unknown) => ViewTransition;

function startViewTransition(): StartViewTransition | null {
  if (typeof document === "undefined") return null;
  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;
  return typeof start === "function" ? start.bind(document) : null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Resolves when `<html>` actually carries `theme`.
 *
 * The usual recipe for this is `startViewTransition(() => flushSync(apply))`,
 * and it does not work here: next-themes applies the class from a *passive*
 * effect, which `flushSync` does not promise to have run by the time it
 * returns. Losing that race means both snapshots show the old theme and the
 * transition plays as a no-op — intermittently. So instead of forcing the
 * write, we wait for it, leaving next-themes the only writer of that class.
 *
 * The timeout is the safety net: whatever happens, the update callback settles
 * and the page never sits frozen under a stale snapshot.
 */
function themeApplied(theme: string): Promise<void> {
  const root = document.documentElement;
  if (root.classList.contains(theme)) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (root.classList.contains(theme)) finish();
    });
    const timer = setTimeout(finish, APPLY_TIMEOUT_MS);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  });
}

/**
 * The circle has to cover the viewport by the time it stops growing, so its
 * radius is the distance from the origin to whichever corner is furthest away.
 */
function coveringRadius(x: number, y: number): number {
  return Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
}

/**
 * Both variants are the same shape — the old page holds still and the new one
 * arrives on top of it — differing only in whether "arrives" means fading in or
 * being clipped in. Keeping the old snapshot static is what lets a partially
 * revealed circle show the old theme around it.
 */
function newSnapshotKeyframes(
  variant: ThemeTransitionVariant,
  origin: Element | null | undefined,
): { keyframes: PropertyIndexedKeyframes; duration: number } {
  if (variant === "circle" && origin && !prefersReducedMotion()) {
    const box = origin.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    return {
      keyframes: {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${coveringRadius(x, y)}px at ${x}px ${y}px)`,
        ],
      },
      duration: THEME_REVEAL_MS,
    };
  }

  // The fade is also the reduced-motion answer for the circle. A crossfade is
  // not movement, and a hard cut between light and dark is the harsher of the
  // two outcomes for anyone who asked for less motion.
  return { keyframes: { opacity: [0, 1] }, duration: THEME_CROSSFADE_MS };
}

/**
 * Swaps the theme, animated if the browser can do it.
 *
 * Resolves once the swap is complete and the document is cleaned up. Browsers
 * without the View Transitions API get today's instant swap — the theme still
 * changes, it just doesn't animate.
 */
export async function swapTheme({
  theme,
  apply,
  variant,
  origin,
}: SwapThemeOptions): Promise<void> {
  const start = startViewTransition();
  if (!start) {
    apply(theme);
    return;
  }

  const { keyframes, duration } = newSnapshotKeyframes(variant, origin);
  const root = document.documentElement;
  const swap = ++latestSwap;
  // Reflects the variant that will actually play, not the one that was asked
  // for — a circle with nowhere to grow from, or one suppressed by a motion
  // preference, is a crossfade.
  root.setAttribute(THEME_TRANSITION_ATTR, "clipPath" in keyframes ? "circle" : "crossfade");

  const transition = start(() => {
    apply(theme);
    return themeApplied(theme);
  });

  try {
    await transition.ready;
    const animation = root.animate(keyframes, {
      duration,
      easing: EASE_OUT_CSS,
      pseudoElement: "::view-transition-new(root)",
    });
    await Promise.all([transition.finished, animation.finished]);
  } catch {
    // A transition that is skipped (the visitor clicked again mid-swap) rejects
    // `ready`. The theme has still changed — there is nothing to recover, only
    // the marker below to clean up.
  } finally {
    if (swap === latestSwap) root.removeAttribute(THEME_TRANSITION_ATTR);
  }
}
