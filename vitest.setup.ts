import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom implements no layout, and therefore no IntersectionObserver. Motion's
// `whileInView` constructs one on mount and throws without it, so anything
// rendering a <Reveal> would fail for a reason that has nothing to do with the
// component. This stub never reports an intersection — which is the honest
// jsdom behaviour: nothing is ever on screen, so reveals never fire and tests
// see the content in its pre-reveal state. Tests assert presence in the DOM and
// the accessibility tree, never animation state.
if (!("IntersectionObserver" in globalThis)) {
  class NoopIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver = NoopIntersectionObserver;
}

afterEach(() => {
  cleanup();
});
