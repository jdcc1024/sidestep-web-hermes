// Atomic rules for design assets — one row per uploaded file (D-01). Pure
// helpers shared by the Convex layer (convex/_designAssets.ts) and the UI, so
// "is this renderable inline?", "which image represents this design?" and
// "who may touch this file?" have exactly one answer on both sides.
//
// Deliberately storage-agnostic: everything here takes plain fields, so the
// resolver can run over a Convex doc, a query result carrying a signed URL, or
// a fixture in a test.

// Only types a browser renders inline in an <img>. A "mockup" may well be a
// PSD or AI file, so the render decision keys off content type, never the
// filename or a tag (PRD §6).
export const WEB_SAFE_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

export type WebSafeImageType = (typeof WEB_SAFE_IMAGE_TYPES)[number];

const FILENAME_MAX_LENGTH = 255;
const FILENAME_FALLBACK = "Untitled file";
const CONTENT_TYPE_FALLBACK = "application/octet-stream";

const WEB_SAFE_SET = new Set<string>(WEB_SAFE_IMAGE_TYPES);

// Browsers send content types with an optional parameter list and arbitrary
// casing ("IMAGE/PNG", "image/svg+xml; charset=utf-8"). Reduce to the bare
// lowercase mime so comparisons and stored values are stable.
export function normalizeContentType(value: string | null | undefined): string {
  const bare = (value ?? "").split(";")[0]!.trim().toLowerCase();
  return bare || CONTENT_TYPE_FALLBACK;
}

export function normalizeFilename(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return FILENAME_FALLBACK;
  return trimmed.slice(0, FILENAME_MAX_LENGTH);
}

export function isWebSafeImage(value: string | null | undefined): boolean {
  return WEB_SAFE_SET.has(normalizeContentType(value));
}

// The picture that stands in for a design on a summary surface, with its URL
// already resolved by the query. Lives here rather than beside a component
// because both the Convex reads and the pure derivations that carry it
// through (lib/jerseyBreakdown) need the shape without importing UI. A null
// `url` means the file itself has gone from storage; callers hold
// `DesignMainImage | null` for "this design has no image at all".
export type DesignMainImage = {
  url: string | null;
  filename: string;
  contentType: string;
};

// The minimum an asset must carry to take part in main-image resolution.
export type MainImageCandidate = {
  contentType: string;
  isMain?: boolean;
  createdAt: number;
};

// Explicit `isMain` → else the first web-safe image by `createdAt` → else
// none (PRD §5). An explicit flag wins even on a non-image asset: it's the
// owner's deliberate pick, and render surfaces gate on isWebSafeImage anyway.
// Ties break toward the oldest so the answer is stable as files are added.
export function resolveMainAsset<T extends MainImageCandidate>(
  assets: readonly T[],
): T | null {
  const oldest = (a: T | null, b: T): T =>
    a === null || b.createdAt < a.createdAt ? b : a;

  const flagged = assets.filter((asset) => asset.isMain === true);
  if (flagged.length > 0) return flagged.reduce<T | null>(oldest, null);

  return assets
    .filter((asset) => isWebSafeImage(asset.contentType))
    .reduce<T | null>(oldest, null);
}

export type AssetProvenance = {
  uploadedByUserId: string;
  uploadedByAdmin: boolean;
};

export type AssetViewer = { userId: string; isAdmin: boolean };

// Upload/edit is owner-or-admin: staff work a design alongside its captain.
export function canUploadDesignAsset(
  design: { ownerId: string },
  viewer: AssetViewer,
): boolean {
  return viewer.isAdmin || design.ownerId === viewer.userId;
}

// Delete is narrower: an admin may remove anything, a captain only files they
// uploaded themselves — and never one staff uploaded, so a cleanup pass can't
// take out a print template. `uploadedByAdmin` is a snapshot taken at upload
// time, because admin status can change afterwards.
export function canDeleteDesignAsset(
  asset: AssetProvenance,
  viewer: AssetViewer,
): boolean {
  if (viewer.isAdmin) return true;
  if (asset.uploadedByAdmin) return false;
  return asset.uploadedByUserId === viewer.userId;
}
