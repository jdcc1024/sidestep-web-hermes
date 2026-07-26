"use client";

import { useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { FileDown, StarIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { UploadedFile } from "@/convex/_designAssets";
import {
  canDeleteDesignAsset,
  isWebSafeImage,
  resolveMainAsset,
  type AssetViewer,
} from "@/lib/designAsset";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BlockAsset } from "./DesignBlocks";

// The design's file pool (D-05): every uploaded file, with the three things
// you can do to one — add more, pick the main image, delete. It lives under
// the block editor because galleries pick from it, so uploading and arranging
// happen on the same screen.
//
// Permissions are the pure predicates in lib/designAsset, run here against
// the viewer the design query ships. A button we know the mutation would
// refuse is not rendered — and the mutation re-runs the same rule anyway.

export type PoolAsset = BlockAsset & {
  _id: Id<"designAssets">;
  isMain: boolean;
  uploadedByUserId: string;
  uploadedByAdmin: boolean;
  createdAt: number;
};

const FALLBACK_CONTENT_TYPE = "application/octet-stream";

export function DesignAssetPool({
  designId,
  assets,
  viewer,
}: {
  designId: Id<"designs">;
  assets: readonly PoolAsset[];
  viewer: AssetViewer;
}) {
  const generateUploadUrl = useMutation(api.designs.generateUploadUrl);
  const addAssets = useMutation(api.designs.addAssets);
  const setMainAsset = useMutation(api.designs.setMainAsset);
  const removeAsset = useMutation(api.designs.removeAsset);

  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // What the page actually shows as this design's picture — an explicit pick
  // if there is one, else the resolver's fallback. Badging the resolved answer
  // rather than only an explicit flag means the badge never lies.
  const main = resolveMainAsset(assets);

  // A design keeps at least one file (the server refuses the last delete), so
  // the button disappears rather than failing.
  const canDeleteAny = assets.length > 1;

  async function run(label: string, call: () => Promise<unknown>) {
    setBusy(true);
    try {
      await call();
    } catch (err) {
      toast.error(label, {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  // Two-phase upload, the same shape DesignForm uses: signed URL per file,
  // then one mutation recording all of them with the metadata the browser
  // knows. Sequential so the toast on a failure names the file that failed.
  async function onPicked(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const files = Array.from(picked);
    if (inputRef.current) inputRef.current.value = "";

    await run("Could not upload those files", async () => {
      const uploaded: UploadedFile[] = [];
      for (const file of files) {
        const contentType = file.type || FALLBACK_CONTENT_TYPE;
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: file,
        });
        if (!res.ok) throw new Error(`${file.name} failed to upload.`);
        const { storageId } = (await res.json()) as {
          storageId: Id<"_storage">;
        };
        uploaded.push({ storageId, filename: file.name, contentType });
      }
      await addAssets({ designId, files: uploaded });
    });
  }

  return (
    <section aria-labelledby="design-files-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="design-files-heading"
          className="text-base font-semibold text-foreground"
        >
          Files ({assets.length})
        </h2>

        {/* A label rather than a button wrapping an input: the file picker is
            the control, and the label is what opens it. */}
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <UploadCloudIcon className="size-4" aria-hidden />
          {busy ? "Uploading…" : "Add files"}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => void onPicked(e.target.files)}
          />
        </label>
      </div>

      {assets.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
          No files yet — add logos, mood boards or print templates and they
          become available to every gallery.
        </p>
      ) : (
        <ul
          aria-label="Uploaded files"
          className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {assets.map((asset) => (
            <li
              key={asset._id}
              data-testid="pool-asset"
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
            >
              <AssetPreview asset={asset} isMain={main?._id === asset._id} />

              <div className="flex flex-1 flex-col gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {asset.filename}
                  </p>
                  {asset.uploadedByAdmin && (
                    <p className="text-xs text-muted-foreground">
                      Uploaded by Sidestep
                    </p>
                  )}
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-1">
                  {asset.url ? (
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
                    >
                      Download
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Unavailable
                    </span>
                  )}

                  <span className="ml-auto flex items-center gap-0.5">
                    {/* Only an image can represent the design, so a print
                        template isn't offered as one. */}
                    {isWebSafeImage(asset.contentType) &&
                      main?._id !== asset._id && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          aria-label={`Set ${asset.filename} as main image`}
                          onClick={() =>
                            void run("Could not set the main image", () =>
                              setMainAsset({ assetId: asset._id }),
                            )
                          }
                        >
                          <StarIcon />
                        </Button>
                      )}

                    {canDeleteAny && canDeleteDesignAsset(asset, viewer) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-label={`Remove ${asset.filename}`}
                        onClick={() =>
                          void run("Could not remove that file", () =>
                            removeAsset({ assetId: asset._id }),
                          )
                        }
                      >
                        <XIcon />
                      </Button>
                    )}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The thumbnail half of a pool card: a real image where the browser can render
// one (content type decides, per PRD §6), a typed placeholder otherwise.
function AssetPreview({
  asset,
  isMain,
}: {
  asset: PoolAsset;
  isMain: boolean;
}) {
  const renderable = asset.url && isWebSafeImage(asset.contentType);

  return (
    <div className="relative">
      {renderable ? (
        // Convex storage serves short-lived signed URLs from a per-deployment
        // host, so next/image optimization doesn't apply.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.url!}
          alt={asset.filename}
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-muted/50 text-muted-foreground">
          <FileDown className="size-6" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wide">
            {fileTypeLabel(asset)}
          </span>
        </div>
      )}

      {isMain && (
        <span className="absolute left-2 top-2 rounded-full bg-teal-600 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
          Main
        </span>
      )}
    </div>
  );
}

// The extension is what people recognize ("AI", "OTF"); the mime subtype is
// the fallback when a file hasn't got one.
function fileTypeLabel(asset: PoolAsset): string {
  const extension = asset.filename.split(".").pop();
  if (extension && extension !== asset.filename) return extension.toUpperCase();
  return (asset.contentType.split("/").pop() ?? "File").toUpperCase();
}
