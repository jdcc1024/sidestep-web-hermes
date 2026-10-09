// One place that decides how big a stored picture is fetched (0004 R3-02,
// docs/architecture/0004-image-previews.md). Callers name a preset; they never
// write `sizes` strings or widths. `components/image/StoredImage.tsx` reads the
// presets, and `next.config.ts` reads the allow-list, widths and source cap.
//
// Pure, and relative imports only: `next.config.ts` imports this file, and the
// config loader doesn't resolve the `@/` alias.

/**
 * Per-surface presets. `sizes` tells the browser how wide the box is, so it
 * picks the smallest srcset width that fills it. `optimize: false` means the
 * plain storage URL, unchanged (today's bytes); it's the default.
 *
 * A new image type or page: add a preset here and pass its name.
 */
export const IMAGE_PRESETS = {
  original: { sizes: "", optimize: false },
  // Public form, single design: `h-48 w-full` inside `max-w-2xl` (672px).
  publicHero: { sizes: "(min-width: 672px) 672px, 100vw", optimize: true },
  // Public form, design tiles: 2 across, 3 from `sm`.
  publicTile: { sizes: "(min-width: 640px) 224px, 50vw", optimize: true },
  // 40px chip beside a design's name.
  designChip: { sizes: "40px", optimize: true },
  // "Tap to enlarge": screen-sized (<= 2048w), never the print file.
  lightbox: { sizes: "(min-width: 640px) 90vw, 100vw", optimize: true },
} as const satisfies Record<string, { sizes: string; optimize: boolean }>;

export type ImagePreset = keyof typeof IMAGE_PRESETS;

// Types sharp can resize. GIF may be animated; SVG is vector and the optimizer
// refuses it without `dangerouslyAllowSVG`.
const OPTIMIZABLE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const bareType = (contentType: string | null | undefined) =>
  (contentType ?? "").split(";")[0]!.trim().toLowerCase();

export function canOptimize(contentType: string | null | undefined): boolean {
  return OPTIMIZABLE_TYPES.has(bareType(contentType));
}

export function shouldOptimize(
  contentType: string | null | undefined,
  preset: ImagePreset,
): boolean {
  return IMAGE_PRESETS[preset].optimize && canOptimize(contentType);
}

/**
 * Largest source the optimizer will fetch (`images.maximumResponseBody`), so
 * the server never hands out a URL the optimizer would refuse with 413.
 */
export const OPTIMIZABLE_SOURCE_MAX_BYTES = 50 * 1024 * 1024;

/** Next's default device sizes minus 3840: 2048w is plenty for a lightbox. */
export const IMAGE_DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920, 2048];

export type ConvexImagePattern = {
  protocol: "https";
  hostname: string;
  pathname: "/api/storage/**";
  search: "";
};

/**
 * The one remote source the optimizer may fetch: this build's Convex
 * deployment storage, exact host, no query strings. Never a `*.convex.cloud`
 * wildcard, which would make our server a free resizer for anyone's files.
 * Null for a missing or malformed URL.
 */
export function convexImagePattern(
  convexUrl: string | null | undefined,
): ConvexImagePattern | null {
  if (!convexUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(convexUrl);
  } catch {
    return null;
  }
  if (!parsed.hostname) return null;
  return {
    protocol: "https",
    hostname: parsed.hostname,
    pathname: "/api/storage/**",
    search: "",
  };
}
