# Issue: Theme Swap Transition (A/B)

## Status: done

## Phase: 3

## Type: improvement

## Description

Today the light/dark swap is a hard cut. `ThemeProvider` runs with
`disableTransitionOnChange`, which deliberately kills every CSS transition for
the duration of the swap — without it, ~80 unrelated `transition-*` classes
would each animate their own colour at their own duration and the page would
smear rather than change.

So the transition cannot come from CSS transitions on the elements. It comes
from the **View Transitions API**: the browser snapshots the whole document
before and after the class change and animates between the two images. One
mechanism, every page, no per-element rules, and `disableTransitionOnChange`
stays exactly as it is.

Two candidates are being shipped side by side for a human to compare in the
running app, because this is a taste call that reads differently in motion than
in a description:

- **crossfade** — the old page dissolves into the new one.
- **circle** — the new page wipes in as a circle expanding from the toggle.

## Acceptance Criteria

- [x] Swapping theme animates instead of snapping, on every page
- [x] Both variants reachable from one temporary compare control in all three shells
- [x] `disableTransitionOnChange` stays on; no global `transition` rule added
- [x] Browsers without `startViewTransition` fall back to today's instant swap
- [x] Reduced motion gets the fade, never the expanding circle
- [x] Timings come from `lib/motion.ts`
- [x] Existing `theme-toggle.test.tsx` assertions still hold

## Dependencies

- Blocked by: none (N-01 established `lib/motion.ts`)

## Notes

**Why the update callback awaits the DOM rather than calling `flushSync`.**
The usual recipe is `startViewTransition(() => flushSync(() => setTheme(next)))`.
It does not hold here: next-themes applies the class from a **passive** effect
(`useEffect(() => applyTheme(theme), [theme])`, see `node_modules/next-themes/dist/index.mjs`),
and `flushSync` does not guarantee passive effects have run by the time it
returns. When it loses that race the "after" snapshot is identical to the
"before" one and the transition plays as a no-op — intermittently, which is the
worst way for it to be wrong.

Instead the callback returns a promise that resolves when `documentElement`'s
class list actually reports the new theme (`MutationObserver`, with a timeout
so a swap can never hang the page). next-themes stays the only writer of that
class — nothing here reimplements its internals.

**Why the circle is drawn with WAAPI, not a CSS keyframe.** Whether custom
properties set on `:root` inherit into the `::view-transition-*` pseudo tree is
exactly the kind of detail that differs between engines, and the circle's
geometry is per-click anyway (it is centred on the button). `Element.animate`
with `pseudoElement: "::view-transition-new(root)"` takes the numbers directly.

**Follow-up.** N-11 is the parked decision: pick one, delete the other and
`components/theme-toggle-compare.tsx` with it.
