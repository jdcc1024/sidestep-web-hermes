// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { swapTheme, THEME_TRANSITION_ATTR } from "./theme-transition";

/**
 * A stand-in for the browser's View Transitions API.
 *
 * The real one snapshots the document, so it cannot exist in jsdom. What these
 * tests care about is the *contract* around it: that the theme is applied
 * inside the update callback, that the callback does not resolve until the
 * class has actually landed, and that the pseudo-element animation is only
 * started once `ready` says the pseudo tree exists.
 */
function installViewTransition() {
  const calls: {
    updateCallbackDone: Promise<void>;
    resolveReady: () => void;
    resolveFinished: () => void;
  }[] = [];

  const startViewTransition = vi.fn((callback: () => unknown) => {
    let resolveReady!: () => void;
    let resolveFinished!: () => void;
    const ready = new Promise<void>((r) => {
      resolveReady = r;
    });
    const finished = new Promise<void>((r) => {
      resolveFinished = r;
    });
    const updateCallbackDone = Promise.resolve(callback()).then(() => {});
    calls.push({ updateCallbackDone, resolveReady, resolveFinished });
    // A real transition resolves `ready` only after the callback settles, and
    // `finished` once the pseudo tree has no animations left on it.
    updateCallbackDone.then(() => {
      resolveReady();
      resolveFinished();
    });
    return { ready, finished, updateCallbackDone, skipTransition() {} };
  });

  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    writable: true,
    value: startViewTransition,
  });

  return { startViewTransition, calls };
}

/** Mimics next-themes: flips the class on <html>, asynchronously. */
function applyThemeLater(theme: string, delayMs = 0) {
  return () => {
    setTimeout(() => {
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(theme);
    }, delayMs);
  };
}

function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }),
  });
}

/** A toggle button sitting near the top-right corner of a 1000x800 viewport. */
function originAt(x: number, y: number) {
  const el = document.createElement("button");
  el.getBoundingClientRect = () =>
    ({ x, y, left: x, top: y, width: 40, height: 40, right: x + 40, bottom: y + 40 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

let animate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.documentElement.className = "light";
  document.documentElement.removeAttribute(THEME_TRANSITION_ATTR);
  setReducedMotion(false);
  window.innerWidth = 1000;
  window.innerHeight = 800;
  animate = vi.fn(() => ({ finished: Promise.resolve() }));
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    writable: true,
    value: animate,
  });
});

afterEach(() => {
  // @ts-expect-error — removing the stub between tests
  delete document.startViewTransition;
  vi.useRealTimers();
});

describe("swapTheme", () => {
  describe("without View Transitions support", () => {
    it("applies the theme directly rather than doing nothing", async () => {
      const apply = vi.fn();
      await swapTheme({ theme: "dark", apply, variant: "crossfade" });
      expect(apply).toHaveBeenCalledWith("dark");
    });

    it("does not leave the transition marker on the document", async () => {
      // A synchronous `apply` on purpose: this path never waits for the class,
      // so a deferred one would land during a later test.
      await swapTheme({ theme: "dark", apply: vi.fn(), variant: "circle" });
      expect(document.documentElement).not.toHaveAttribute(THEME_TRANSITION_ATTR);
    });
  });

  describe("with View Transitions support", () => {
    it("applies the theme inside the update callback, not before it", async () => {
      const { startViewTransition } = installViewTransition();
      const apply = vi.fn(applyThemeLater("dark"));

      // The callback is what the browser calls between snapshots. Applying the
      // theme outside it would mean both snapshots showed the *new* theme.
      const pending = swapTheme({ theme: "dark", apply, variant: "crossfade" });
      expect(startViewTransition).toHaveBeenCalledOnce();
      await pending;
      expect(apply).toHaveBeenCalledWith("dark");
    });

    it("holds the update callback open until the class actually lands", async () => {
      installViewTransition();
      let settled = false;

      // 20ms stands in for next-themes' passive effect: `apply` returns long
      // before <html> carries the new class. Snapshotting in that gap would
      // capture the old theme twice and animate nothing.
      const pending = swapTheme({
        theme: "dark",
        apply: applyThemeLater("dark", 20),
        variant: "crossfade",
      }).then(() => {
        settled = true;
      });

      await new Promise((r) => setTimeout(r, 5));
      expect(settled).toBe(false);
      expect(document.documentElement).toHaveClass("light");

      await pending;
      expect(document.documentElement).toHaveClass("dark");
    });

    it("resolves even if the theme never lands, so a swap cannot hang the page", async () => {
      installViewTransition();
      // `apply` that does nothing: the class never changes.
      await expect(
        swapTheme({ theme: "dark", apply: () => {}, variant: "crossfade" }),
      ).resolves.toBeUndefined();
    });

    it("marks the document for the duration and cleans up after", async () => {
      installViewTransition();
      const seen: (string | null)[] = [];
      const apply = () => {
        seen.push(document.documentElement.getAttribute(THEME_TRANSITION_ATTR));
        applyThemeLater("dark")();
      };

      await swapTheme({ theme: "dark", apply, variant: "circle", origin: originAt(900, 20) });

      // Set before the snapshot so the CSS that suppresses the default
      // crossfade is already in force when the pseudo tree is built.
      expect(seen).toEqual(["circle"]);
      expect(document.documentElement).not.toHaveAttribute(THEME_TRANSITION_ATTR);
    });

    it("fades the new snapshot in for the crossfade variant", async () => {
      installViewTransition();
      await swapTheme({
        theme: "dark",
        apply: applyThemeLater("dark"),
        variant: "crossfade",
      });

      expect(animate).toHaveBeenCalledOnce();
      const [keyframes, options] = animate.mock.calls[0];
      expect(keyframes).toEqual({ opacity: [0, 1] });
      expect(options).toMatchObject({ pseudoElement: "::view-transition-new(root)" });
    });

    it("grows a circle from the origin, sized to reach the furthest corner", async () => {
      installViewTransition();
      // Button at (900, 20) in a 1000x800 viewport → centre (920, 40).
      // Furthest corner is bottom-left: hypot(920, 760).
      const origin = originAt(900, 20);
      const expected = Math.hypot(920, 760);

      await swapTheme({
        theme: "dark",
        apply: applyThemeLater("dark"),
        variant: "circle",
        origin,
      });

      expect(animate).toHaveBeenCalledOnce();
      const [keyframes, options] = animate.mock.calls[0];
      expect(keyframes).toEqual({
        clipPath: [
          "circle(0px at 920px 40px)",
          `circle(${expected}px at 920px 40px)`,
        ],
      });
      expect(options).toMatchObject({ pseudoElement: "::view-transition-new(root)" });
    });

    it("falls back to the fade when the circle has no origin to grow from", async () => {
      installViewTransition();
      await swapTheme({
        theme: "dark",
        apply: applyThemeLater("dark"),
        variant: "circle",
        origin: null,
      });

      const [keyframes] = animate.mock.calls[0];
      expect(keyframes).toEqual({ opacity: [0, 1] });
    });

    it("fades rather than sweeping a circle under prefers-reduced-motion", async () => {
      installViewTransition();
      setReducedMotion(true);
      const origin = originAt(900, 20);

      await swapTheme({
        theme: "dark",
        apply: applyThemeLater("dark"),
        variant: "circle",
        origin,
      });

      // The swap still animates — a fade is not movement, and a hard cut
      // between light and dark is the harsher outcome. Only the geometry goes.
      expect(animate).toHaveBeenCalledOnce();
      const [keyframes] = animate.mock.calls[0];
      expect(keyframes).toEqual({ opacity: [0, 1] });
    });

    it("starts the animation only once the pseudo tree exists", async () => {
      const { calls } = installViewTransition();
      const pending = swapTheme({
        theme: "dark",
        apply: applyThemeLater("dark"),
        variant: "crossfade",
      });

      // `ready` has not resolved yet — animating now would target a
      // pseudo-element the browser has not built.
      expect(animate).not.toHaveBeenCalled();
      await calls[0].updateCallbackDone;
      await pending;
      expect(animate).toHaveBeenCalledOnce();
    });
  });
});
