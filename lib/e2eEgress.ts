/**
 * IMG-02: the E2E suite's Convex storage egress guard and report, as pure
 * helpers. The Playwright side (`e2e/support/fixtures.ts`,
 * `e2e/support/global-teardown.ts`) only feeds them responses and log lines.
 * They live here, not in `e2e/`, so vitest covers them.
 */

/** A test that pulls more than this straight from Convex storage fails. */
export const DIRECT_STORAGE_LIMIT_BYTES = 1_000_000;

/** Opt-out tag for a test that really has to download an original. */
export const ORIGINAL_DOWNLOAD_TAG = "@original-download";

/**
 * A file served straight from Convex storage, not through the Next optimizer.
 * The optimizer's own URL carries the storage URL encoded in `?url=`, but
 * it's excluded by name too, so the rule doesn't hang on encoding.
 */
export function isDirectStorage(url: string): boolean {
  return url.includes("/api/storage/") && !url.includes("/_next/image");
}

export type CacheResult = "hit" | "miss" | "other";

/** How a `/_next/image` response was served; null for any other URL. */
export function nextImageCache(
  url: string,
  xNextjsCache: string | undefined,
): CacheResult | null {
  if (!url.includes("/_next/image")) return null;
  if (xNextjsCache === "HIT") return "hit";
  if (xNextjsCache === "MISS") return "miss";
  return "other";
}

export type Download = { url: string; bytes: number };

/** The failure message when `downloads` total over the limit, else null. */
export function directStorageFailure(downloads: Download[]): string | null {
  const total = downloads.reduce((sum, d) => sum + d.bytes, 0);
  if (total <= DIRECT_STORAGE_LIMIT_BYTES) return null;
  return [
    `Downloaded ${total} B straight from Convex storage (limit ${DIRECT_STORAGE_LIMIT_BYTES} B).`,
    "Render it through the optimizer (a preset), or tag the test",
    `"${ORIGINAL_DOWNLOAD_TAG}" if it really needs the original:`,
    ...downloads.map((d) => `  ${d.bytes} B  ${d.url}`),
  ].join("\n");
}

/** One test's line in the run's egress log. */
export type EgressLine = {
  test: string;
  directBytes: number;
  hit: number;
  miss: number;
  other: number;
};

/** Parses the JSONL log, skipping blank or torn lines. */
export function parseEgressLog(text: string): EgressLine[] {
  const lines: EgressLine[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    try {
      lines.push(JSON.parse(raw) as EgressLine);
    } catch {
      // A worker killed mid-write leaves a partial line: not worth failing over.
    }
  }
  return lines;
}

/** The one-line run report printed by the global teardown. */
export function formatEgressReport(lines: EgressLine[]): string {
  const sum = (key: Exclude<keyof EgressLine, "test">) =>
    lines.reduce((total, line) => total + line[key], 0);
  const bytes = sum("directBytes");
  return (
    `E2E egress: ${(bytes / 1_000_000).toFixed(2)} MB direct from Convex storage (${bytes} B)` +
    ` · /_next/image ${sum("hit")} HIT / ${sum("miss")} MISS (+${sum("other")} other)` +
    ` · ${lines.length} tests`
  );
}
