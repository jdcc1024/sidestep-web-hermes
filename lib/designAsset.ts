// Atomic rules for design assets — one row per uploaded file (D-01). Pure
// helpers shared by the Convex layer (convex/_designAssets.ts) and the UI, so
// "is this renderable inline?", "which image represents this design?" and
// "who may touch this file?" have exactly one answer on both sides.
//
// Deliberately storage-agnostic: everything here takes plain fields, so the
// resolver can run over a Convex doc, a query result carrying a signed URL, or
// a fixture in a test.

import {
  OPTIMIZABLE_SOURCE_MAX_BYTES,
  PREVIEW_CONTENT_TYPE,
  canOptimize,
} from "./images";

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
// through need the shape without importing UI. A null
// `url` means the file itself has gone from storage; callers hold
// `DesignMainImage | null` for "this design has no image at all". `url` is the
// original (downloads only); `displayUrl` is what an <img> loads: the stored
// web preview (IMG-03), or null while there is none, and never the original
// (IMG-04). `displayContentType` is the preview's type (always WebP), null
// with no preview; `contentType` stays the asset's own for labels and "is
// this an image?". Optional so a shape built without them (a fixture) still
// typechecks; it then draws the placeholder.
export type DesignMainImage = {
  url: string | null;
  displayUrl?: string | null;
  displayContentType?: string | null;
  filename: string;
  contentType: string;
};

// The URL an on-screen picture loads: the stored preview's, or null (the
// surface draws its placeholder). Never the original: download and "open"
// links use `url` directly (IMG-04).
export function pictureUrl(asset: {
  url?: string | null;
  displayUrl?: string | null;
}): string | null {
  return asset.displayUrl ?? null;
}

// What a <StoredImage> or lightbox is given for an asset: the preview's URL
// and the preview's content type, so a GIF/SVG design is resized by the
// optimizer like any other picture. Null when there's nothing to draw (no
// preview yet, or not an image), so the caller shows its placeholder.
export function displayImageOf(asset: {
  contentType: string;
  displayUrl?: string | null;
  displayContentType?: string | null;
}): { url: string; contentType: string } | null {
  if (!asset.displayUrl || !isWebSafeImage(asset.contentType)) return null;
  return {
    url: asset.displayUrl,
    contentType: asset.displayContentType ?? PREVIEW_CONTENT_TYPE,
  };
}

// The public order form is unauthenticated and opened on phones, often on cell
// data, so it only gets a picture a browser can draw and that is small enough
// to load quickly (docs/architecture/0004-public-form.md, Q2). Since IMG-04 the
// public form only ever gets the WebP preview, which `toPublicImage` caps at
// the optimizer's source limit, so this GIF/SVG cap no longer applies to
// anything served; it stays for `toPublicImage`'s own rule and its tests.
export const PUBLIC_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

// What the public form may see of a design's main file: no filename (names
// are internal), no storage id, nothing about the design's other files. Both
// fields describe the stored preview, never the original (IMG-04).
export type PublicDesignImage = { url: string; contentType: string };

// Null unless the file is web-safe, still in storage, and its size is known
// and within the cap for its type (resizable types up to what the optimizer
// fetches, GIF/SVG 2 MB). `publicMainImagesByDesign` passes it the preview
// (WebP, its size, its URL) after checking the main asset itself is
// web-safe, so a flagged PDF/AI/PSD returns null on the server. Builds a
// fresh object so no other field of the asset row can ride along.
export function toPublicImage(
  main: { contentType: string },
  sizeBytes: number | null,
  url: string | null,
): PublicDesignImage | null {
  if (!isWebSafeImage(main.contentType)) return null;
  if (url === null) return null;
  const maxBytes = canOptimize(main.contentType)
    ? OPTIMIZABLE_SOURCE_MAX_BYTES
    : PUBLIC_IMAGE_MAX_BYTES;
  if (sizeBytes === null || sizeBytes > maxBytes) return null;
  return { url, contentType: main.contentType };
}

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
