import { describe, expect, it } from "vitest";
import {
  WEB_SAFE_IMAGE_TYPES,
  canDeleteDesignAsset,
  canUploadDesignAsset,
  isWebSafeImage,
  normalizeContentType,
  normalizeFilename,
  resolveMainAsset,
  type MainImageCandidate,
} from "./designAsset";

function asset(
  overrides: Partial<MainImageCandidate> & { id?: string } = {},
): MainImageCandidate & { id: string } {
  return {
    id: "a",
    contentType: "image/png",
    createdAt: 1_000,
    ...overrides,
  };
}

describe("isWebSafeImage", () => {
  it.each(WEB_SAFE_IMAGE_TYPES)("accepts %s", (type) => {
    expect(isWebSafeImage(type)).toBe(true);
  });

  it("rejects types a browser can't render inline", () => {
    expect(isWebSafeImage("application/pdf")).toBe(false);
    expect(isWebSafeImage("application/postscript")).toBe(false);
    expect(isWebSafeImage("image/tiff")).toBe(false);
    expect(isWebSafeImage("font/woff2")).toBe(false);
  });

  it("ignores casing and content-type parameters", () => {
    expect(isWebSafeImage("IMAGE/PNG")).toBe(true);
    expect(isWebSafeImage("image/svg+xml; charset=utf-8")).toBe(true);
  });

  it("rejects a missing or blank content type", () => {
    expect(isWebSafeImage(undefined)).toBe(false);
    expect(isWebSafeImage(null)).toBe(false);
    expect(isWebSafeImage("   ")).toBe(false);
  });
});

describe("resolveMainAsset", () => {
  it("returns the asset flagged isMain", () => {
    const flagged = asset({ id: "flagged", isMain: true, createdAt: 5_000 });
    const main = resolveMainAsset([
      asset({ id: "older", createdAt: 1_000 }),
      flagged,
    ]);
    expect(main).toBe(flagged);
  });

  it("honours an explicit flag even on a non-image asset", () => {
    // The flag is an owner's deliberate pick; render surfaces still gate on
    // isWebSafeImage, so an odd type degrades to a card rather than lying.
    const flagged = asset({
      id: "pdf",
      contentType: "application/pdf",
      isMain: true,
    });
    expect(resolveMainAsset([asset({ id: "png" }), flagged])).toBe(flagged);
  });

  it("prefers the oldest flag when more than one is set", () => {
    const first = asset({ id: "first", isMain: true, createdAt: 1_000 });
    const second = asset({ id: "second", isMain: true, createdAt: 2_000 });
    expect(resolveMainAsset([second, first])).toBe(first);
  });

  it("falls back to the first web-safe image by createdAt", () => {
    const oldest = asset({ id: "oldest", createdAt: 1_000 });
    const newer = asset({ id: "newer", createdAt: 2_000 });
    expect(resolveMainAsset([newer, oldest])).toBe(oldest);
  });

  it("skips non-image assets in the fallback", () => {
    const image = asset({ id: "image", createdAt: 9_000 });
    const main = resolveMainAsset([
      asset({ id: "pdf", contentType: "application/pdf", createdAt: 1_000 }),
      asset({ id: "font", contentType: "font/woff2", createdAt: 2_000 }),
      image,
    ]);
    expect(main).toBe(image);
  });

  it("returns null when nothing qualifies", () => {
    expect(resolveMainAsset([])).toBeNull();
    expect(
      resolveMainAsset([
        asset({ contentType: "application/pdf" }),
        asset({ contentType: "application/octet-stream" }),
      ]),
    ).toBeNull();
  });
});

describe("canUploadDesignAsset", () => {
  it("allows the design owner", () => {
    expect(
      canUploadDesignAsset({ ownerId: "u1" }, { userId: "u1", isAdmin: false }),
    ).toBe(true);
  });

  it("allows any admin", () => {
    expect(
      canUploadDesignAsset({ ownerId: "u1" }, { userId: "u2", isAdmin: true }),
    ).toBe(true);
  });

  it("refuses an unrelated user", () => {
    expect(
      canUploadDesignAsset({ ownerId: "u1" }, { userId: "u2", isAdmin: false }),
    ).toBe(false);
  });
});

describe("canDeleteDesignAsset", () => {
  const ownerUpload = { uploadedByUserId: "u1", uploadedByAdmin: false };
  const adminUpload = { uploadedByUserId: "staff", uploadedByAdmin: true };

  it("lets a user delete a file they uploaded", () => {
    expect(
      canDeleteDesignAsset(ownerUpload, { userId: "u1", isAdmin: false }),
    ).toBe(true);
  });

  it("lets an admin delete any asset", () => {
    expect(
      canDeleteDesignAsset(ownerUpload, { userId: "staff", isAdmin: true }),
    ).toBe(true);
    expect(
      canDeleteDesignAsset(adminUpload, { userId: "other", isAdmin: true }),
    ).toBe(true);
  });

  it("keeps admin-uploaded assets admin-delete-only", () => {
    // The snapshot is what matters: staff files survive a captain's cleanup.
    expect(
      canDeleteDesignAsset(adminUpload, { userId: "u1", isAdmin: false }),
    ).toBe(false);
  });

  it("refuses a non-admin deleting someone else's upload", () => {
    expect(
      canDeleteDesignAsset(ownerUpload, { userId: "u2", isAdmin: false }),
    ).toBe(false);
  });
});

describe("normalizeFilename", () => {
  it("trims and keeps the given name", () => {
    expect(normalizeFilename("  logo.png  ")).toBe("logo.png");
  });

  it("falls back for a blank or missing name", () => {
    expect(normalizeFilename("")).toBe("Untitled file");
    expect(normalizeFilename("   ")).toBe("Untitled file");
    expect(normalizeFilename(undefined)).toBe("Untitled file");
  });

  it("caps an absurdly long name", () => {
    expect(normalizeFilename("a".repeat(500))).toHaveLength(255);
  });
});

describe("normalizeContentType", () => {
  it("lowercases and strips parameters", () => {
    expect(normalizeContentType("IMAGE/PNG")).toBe("image/png");
    expect(normalizeContentType("image/svg+xml; charset=utf-8")).toBe(
      "image/svg+xml",
    );
  });

  it("falls back to a generic binary type", () => {
    expect(normalizeContentType("")).toBe("application/octet-stream");
    expect(normalizeContentType(undefined)).toBe("application/octet-stream");
  });
});
