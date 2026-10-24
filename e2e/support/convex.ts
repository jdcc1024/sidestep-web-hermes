import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import zlib from "node:zlib";

// Thin wrapper over `npx convex run` for the internal E2E helpers in
// convex/_e2e.ts. Runs against the deployment in .env.local (dev only).

// `npx convex run` makes one HTTPS call to the dev deployment. A dropped
// connection ("TypeError: fetch failed") fails the CLI before the function
// runs, which killed a test in seedOrder (order-form-player, 1 in 44 runs).
// Retry only that transport failure, never a Convex function error. Every
// row carries the test's tag, so a retry that did land twice is still swept.
const TRANSIENT = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/;

function execConvexRun(fn: string, args: Record<string, unknown>): string {
  for (let attempt = 1; ; attempt++) {
    try {
      return execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      const text = `${(e as Error).message}\n${(e as { stderr?: string }).stderr ?? ""}`;
      if (attempt >= 3 || !TRANSIENT.test(text)) throw e;
    }
  }
}

function run<T>(fn: string, args: Record<string, unknown>): T {
  if (!/^dev:/.test(process.env.CONVEX_DEPLOYMENT ?? "")) {
    throw new Error(
      "E2E refuses to run: CONVEX_DEPLOYMENT is not a dev deployment.",
    );
  }
  const out = execConvexRun(fn, args);
  // JSON starts at the first `{`, `[` or `"` (a string, e.g. findFixture's id).
  const start = out.search(/[[{"]/);
  // A function that returns null prints no JSON value.
  return (start < 0 ? null : JSON.parse(out.slice(start))) as T;
}

/**
 * Who owns the seeded rows. "admin" is SNAP_UID (an admin in Clerk). "captain"
 * is the optional non-admin E2E_CAPTAIN_UID: admins can always edit, so any
 * check of what a plain captain can't do needs that account.
 */
export type As = "admin" | "captain";

export const captainConfigured = () =>
  Boolean(process.env.E2E_CAPTAIN_UID && process.env.E2E_CAPTAIN_PWD);

const email = (as: As = "admin") => {
  const uid =
    as === "captain" ? process.env.E2E_CAPTAIN_UID : process.env.SNAP_UID;
  if (!uid)
    throw new Error(
      as === "captain" ? "E2E_CAPTAIN_UID is not set" : "SNAP_UID is not set",
    );
  return uid;
};

/** A unique per-test tag: every row the test makes carries it. */
export const newTag = () =>
  `e2e-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;

export type SeededOrder = {
  orderId: string;
  designId: string;
  teamName: string;
};

export const seedOrder = (tag: string, as: As = "admin") =>
  run<SeededOrder>("_e2e:seedOrder", { email: email(as), tag });

export type SeedItem = {
  name?: string;
  number?: string;
  size?: string;
  qty?: number;
};

/** Puts items on the seeded order's design. */
export const seedItems = (
  tag: string,
  orderId: string,
  items: SeedItem[],
  as: As = "admin",
) =>
  run<{ count: number }>("_e2e:seedItems", {
    email: email(as),
    tag,
    orderId,
    items,
  });

/** Checks or unchecks "Order Size Confirmed", bypassing the admin gate. */
export const setConfirmed = (
  tag: string,
  orderId: string,
  confirmed: boolean,
  as: As = "admin",
) =>
  run<{ ok: true }>("_e2e:setConfirmed", {
    email: email(as),
    tag,
    orderId,
    confirmed,
  });

const accounts = (): As[] =>
  captainConfigured() ? ["admin", "captain"] : ["admin"];

export const cleanup = (tag: string) => {
  for (const as of accounts())
    run("_e2e:cleanup", {
      email: email(as),
      tag,
      keepSha256: [bigPngSha256()],
    });
};

/** Rows from crashed runs: any E2E row older than an hour. */
export const sweepStale = () => {
  for (const as of accounts()) {
    try {
      run("_e2e:cleanup", {
        email: email(as),
        olderThanMs: 60 * 60 * 1000,
        keepSha256: [bigPngSha256()],
      });
    } catch {
      // A captain who has never signed in has no users row yet: nothing to sweep.
    }
  }
};

/** Adds a second (third, ...) design to a seeded order. Title: `E2E <tag> <title>`. */
export const addDesign = (
  tag: string,
  orderId: string,
  title: string,
  as: As = "admin",
) =>
  run<{ designId: string }>("_e2e:addDesign", {
    email: email(as),
    tag,
    orderId,
    title,
  });

/**
 * Stores a small generated file and attaches it to an E2E design (0004
 * R3-01). `kind: "png"` is a 1x1 picture, `"pdf"` a minimal PDF. `isMain`
 * flags it as the design's main file.
 *
 * IMG-04: the app shows only the stored preview, and this attaches with none
 * (like an upload whose preview isn't made yet). Pass `{ withPreview: true }`
 * when the test expects the picture to show: it runs the real
 * `imagePreviews.generate` and returns once the preview exists.
 */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PDF_MIN = Buffer.from("%PDF-1.1\n%%EOF\n").toString("base64");

export type AttachOptions = { withPreview?: boolean };

/** Makes an E2E asset's stored preview now and waits for it (IMG-04). */
export const makePreview = (assetId: string) =>
  run<{ ok: true }>("_e2e:makePreview", { assetId });

export const attachFile = (
  designId: string,
  kind: "png" | "pdf",
  isMain = true,
  { withPreview = false }: AttachOptions = {},
) => {
  const out = run<{ ok: true; assetId: string }>("_e2e:attachFile", {
    designId,
    base64: kind === "png" ? PNG_1X1 : PDF_MIN,
    contentType: kind === "png" ? "image/png" : "application/pdf",
    filename: kind === "png" ? "e2e-main.png" : "e2e-print.pdf",
    isMain,
  });
  if (withPreview) makePreview(out.assetId);
  return out;
};

/**
 * A print-size PNG (0004 R3-02): a 1200x900 RGB gradient stored uncompressed
 * (zlib level 0), so the file is ~3.2 MB but its WebP is tiny. A gradient, not
 * noise: noise makes the resized WebP heavy and the byte budget flaky. Built
 * in Node, POSTed to a test-only upload URL (too big for `convex run` args),
 * then attached as the design's main picture.
 */
export function buildBigPng(): Buffer {
  const w = 1200;
  const h = 900;
  const raw = Buffer.alloc(h * (1 + w * 3));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      raw[o++] = Math.floor((x * 255) / w);
      raw[o++] = Math.floor((y * 255) / h);
      raw[o++] = 128;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 0 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// IMG-02: built once per process and stored once per deployment. Its sha256
// (base64, as `_storage` keeps it) finds the stored copy, and pins it so
// `_e2e:cleanup` never deletes it.
let bigPng: { png: Buffer; sha256: string } | undefined;
function bigPngFixture() {
  if (!bigPng) {
    const png = buildBigPng();
    bigPng = { png, sha256: createHash("sha256").update(png).digest("base64") };
  }
  return bigPng;
}

export const bigPngSha256 = () => bigPngFixture().sha256;

/**
 * Attaches the big PNG to an E2E design. Reuses the stored blob when the
 * deployment already has it, so the upload is skipped on warm runs; uploads
 * only on a miss. With no preview by default (IMG-04): pass
 * `{ withPreview: true }` for a picture that shows. Previews are made per
 * asset row, so two designs sharing the original still get two previews.
 */
export async function attachBigPng(
  designId: string,
  isMain = true,
  { withPreview = false }: AttachOptions = {},
) {
  const { png, sha256 } = bigPngFixture();
  let storageId = run<string | null>("_e2e:findFixture", { sha256 });
  const reused = storageId !== null;
  if (storageId === null) {
    const { url } = run<{ url: string }>("_e2e:uploadUrl", {});
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: new Uint8Array(png),
    });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    ({ storageId } = (await res.json()) as { storageId: string });
  }
  const assetId = run<string>("_e2e:insertAsset", {
    designId,
    storageId,
    filename: "e2e-big.png",
    contentType: "image/png",
    isMain,
  });
  if (withPreview) makePreview(assetId);
  return { bytes: png.length, storageId, assetId, reused };
}

/** Deletes an E2E asset's original blob and keeps its row (B-09): `hasFile` goes false. */
export const deleteOriginal = (assetId: string) =>
  run<{ ok: true }>("_e2e:deleteOriginal", { assetId });
