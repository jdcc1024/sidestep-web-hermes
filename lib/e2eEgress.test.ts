import { describe, expect, it } from "vitest";
import {
  directStorageFailure,
  formatEgressReport,
  isDirectStorage,
  nextImageCache,
  parseEgressLog,
} from "./e2eEgress";

const STORAGE = "https://x.convex.cloud/api/storage/abc";
const OPTIMIZED = `http://localhost:8080/_next/image?url=${encodeURIComponent(STORAGE)}&w=640&q=75`;

describe("isDirectStorage", () => {
  it("should flag a Convex storage URL", () => {
    expect(isDirectStorage(STORAGE)).toBe(true);
  });

  it("should not flag the optimizer, even with the storage path unencoded", () => {
    expect(isDirectStorage(OPTIMIZED)).toBe(false);
    expect(isDirectStorage(`http://localhost/_next/image?url=${STORAGE}`)).toBe(
      false,
    );
  });
});

describe("nextImageCache", () => {
  it("should bucket optimizer responses by x-nextjs-cache", () => {
    expect(nextImageCache(OPTIMIZED, "HIT")).toBe("hit");
    expect(nextImageCache(OPTIMIZED, "MISS")).toBe("miss");
    expect(nextImageCache(OPTIMIZED, "STALE")).toBe("other");
    expect(nextImageCache(OPTIMIZED, undefined)).toBe("other");
  });

  it("should ignore other URLs", () => {
    expect(nextImageCache(STORAGE, "HIT")).toBeNull();
  });
});

describe("directStorageFailure", () => {
  it("should pass at exactly the limit", () => {
    expect(directStorageFailure([{ url: STORAGE, bytes: 1_000_000 }])).toBeNull();
  });

  it("should list each URL and the total when over the limit", () => {
    const message = directStorageFailure([
      { url: STORAGE, bytes: 600_000 },
      { url: `${STORAGE}2`, bytes: 500_000 },
    ]);
    expect(message).toContain("1100000 B");
    expect(message).toContain(`600000 B  ${STORAGE}`);
    expect(message).toContain(`500000 B  ${STORAGE}2`);
  });
});

describe("egress log report", () => {
  it("should sum every test's line and skip torn ones", () => {
    const log = [
      JSON.stringify({ test: "a", directBytes: 1_500_000, hit: 3, miss: 1, other: 0 }),
      "",
      '{"test":"torn',
      JSON.stringify({ test: "b", directBytes: 0, hit: 2, miss: 0, other: 1 }),
    ].join("\n");
    expect(formatEgressReport(parseEgressLog(log))).toBe(
      "E2E egress: 1.50 MB direct from Convex storage (1500000 B) · /_next/image 5 HIT / 1 MISS (+1 other) · 2 tests",
    );
  });

  it("should report zeros for an empty log", () => {
    expect(formatEgressReport(parseEgressLog(""))).toBe(
      "E2E egress: 0.00 MB direct from Convex storage (0 B) · /_next/image 0 HIT / 0 MISS (+0 other) · 0 tests",
    );
  });
});
