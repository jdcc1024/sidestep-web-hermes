"use client";

import type { StoredDesignBlock } from "@/convex/_designBlocks";
import { isWebSafeImage } from "@/lib/designAsset";
import { CAPTION_MAX_LENGTH, toggleGalleryAsset } from "@/lib/designBlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PoolAsset } from "./DesignAssetPool";

// Typed against the stored shape rather than the pure one, because a gallery
// is a list of Convex asset ids: the checkbox grid hands the ids straight to
// the block the mutation will carry.
type StoredGalleryBlock = Extract<StoredDesignBlock, { kind: "gallery" }>;

// The gallery block's editing surface (D-05), mounted by DesignBlockEditor
// inside the gallery's card. Controlled the same way PaletteEditor is: it
// renders the draft block it's handed and reports every edit back through
// `onChange`, so the draft and the save stay the block editor's.
//
// Picking is a checkbox grid over the design's whole file pool — one image
// may be in several galleries, and a file in none is still a legitimate part
// of the design. Check order is gallery order, shown as the number on each
// picked tile, which is the only ordering control this slice needs.
export function GalleryEditor({
  block,
  assets,
  error,
  busy,
  saveLabel,
  onChange,
  onSave,
  onCancel,
}: {
  block: StoredGalleryBlock;
  assets: readonly PoolAsset[];
  error: string | null;
  busy: boolean;
  saveLabel: string;
  onChange: (block: StoredGalleryBlock) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <Input
        aria-label="Gallery caption"
        placeholder="Caption (optional) — e.g. Mood board"
        value={block.caption ?? ""}
        maxLength={CAPTION_MAX_LENGTH}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
      />

      {assets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No files to pick from yet — add some to the pool below and they show
          up here.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((asset) => {
            const index = block.assetIds.indexOf(asset._id);
            const picked = index >= 0;
            return (
              <li key={asset._id}>
                <label
                  className={`flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border bg-background transition-colors ${
                    picked
                      ? "border-teal-600 ring-1 ring-teal-600"
                      : "border-border hover:border-ring"
                  }`}
                >
                  <span className="relative block">
                    <AssetThumb asset={asset} />
                    {picked && (
                      <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={picked}
                      disabled={busy}
                      className="size-4 accent-teal-600"
                      onChange={() =>
                        onChange(toggleGalleryAsset(block, asset._id))
                      }
                    />
                    <span className="truncate text-xs text-foreground/90">
                      {asset.filename}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {block.assetIds.length} picked — the numbers are the order they show
          in.
        </p>
        <span className="flex items-center gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={onSave}>
            {saveLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// Small square preview. Non-images get a neutral tile rather than a broken
// <img> — the content type decides, never the filename (PRD §6).
function AssetThumb({ asset }: { asset: PoolAsset }) {
  if (asset.url && isWebSafeImage(asset.contentType))
    return (
      // Convex storage serves short-lived signed URLs from a per-deployment
      // host, so next/image optimization doesn't apply. Alt is empty because
      // the filename sits beside the tile as the checkbox's own label.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.url}
        alt=""
        className="aspect-square w-full object-cover"
        loading="lazy"
      />
    );

  return (
    <span className="flex aspect-square w-full items-center justify-center bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {asset.contentType.split("/").pop() ?? "File"}
    </span>
  );
}
