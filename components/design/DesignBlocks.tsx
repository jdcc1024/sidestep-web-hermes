import { FileDown } from "lucide-react";

import { isWebSafeImage } from "@/lib/designAsset";
import {
  SWATCH_ROLE_LABELS,
  blockHeading,
  type DesignBlock,
  type GalleryBlock,
  type PaletteBlock,
  type TextBlock,
} from "@/lib/designBlock";

// Read-only rendering of a design's structured brief (D-02), shared by the
// portal and admin design pages so both read the same brief the same way.
// Editing is the shared block editor's job (D-03 onward) — this component
// takes blocks and assets and renders; it owns no state.
//
// `DesignBlockBody` is the per-block half, exported so the block editor can
// wrap each block in its own card chrome (handle, move, remove) and still show
// exactly what the read-only page shows. One renderer, two surfaces.

// The slice of a resolved design asset a block needs. Structural rather than
// the Convex doc type so a test fixture (or a future server component) can
// pass the same shape.
export type BlockAsset = {
  _id: string;
  filename: string;
  contentType: string;
  url: string | null;
};

export function DesignBlocks({
  blocks,
  assets,
}: {
  blocks: readonly DesignBlock[];
  assets: readonly BlockAsset[];
}) {
  if (blocks.length === 0) return <EmptyBrief />;

  return (
    <div className="space-y-8">
      {blocks.map((block) => (
        <BlockSection key={block.id} heading={blockHeading(block)}>
          <DesignBlockBody block={block} assets={assets} />
        </BlockSection>
      ))}
    </div>
  );
}

// One block's contents, with no heading and no chrome — the caller supplies
// those. Split out for the editor (D-03), which needs the same rendering
// inside an editable card.
export function DesignBlockBody({
  block,
  assets,
}: {
  block: DesignBlock;
  assets: readonly BlockAsset[];
}) {
  switch (block.kind) {
    case "text":
      return <TextBody block={block} />;
    case "gallery":
      return <GalleryBody block={block} assets={assets} />;
    case "palette":
      return <PaletteBody block={block} />;
  }
}

function BlockSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-foreground">{heading}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TextBody({ block }: { block: TextBlock }) {
  return (
    <p className="whitespace-pre-wrap text-sm text-foreground/90">
      {block.body}
    </p>
  );
}

function GalleryBody({
  block,
  assets,
}: {
  block: GalleryBlock;
  assets: readonly BlockAsset[];
}) {
  // An id can dangle after a file is deleted — drop it rather than render a
  // hole. The gallery still reads correctly with the files that remain.
  const byId = new Map(assets.map((asset) => [asset._id, asset]));
  const picked = block.assetIds
    .map((id) => byId.get(id))
    .filter((asset): asset is BlockAsset => asset !== undefined);

  if (picked.length === 0)
    return <EmptyNote>No files in this gallery yet.</EmptyNote>;

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {picked.map((asset) => (
        <li key={asset._id}>
          <GalleryItem asset={asset} />
        </li>
      ))}
    </ul>
  );
}

function GalleryItem({ asset }: { asset: BlockAsset }) {
  // Inline vs card keys off content type, never the filename or a tag: a
  // "mockup" may well be a PSD (PRD §6). A null URL means the underlying
  // file is gone, so even an image degrades to the card.
  if (asset.url && isWebSafeImage(asset.contentType)) {
    return (
      <figure className="overflow-hidden rounded-lg border border-border bg-card">
        {/* Convex storage serves short-lived signed URLs from a host that
            changes per deployment, so next/image optimization doesn't apply. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt={asset.filename}
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
        <figcaption className="truncate px-3 py-2 text-xs text-muted-foreground">
          {asset.filename}
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between gap-2 rounded-lg border border-border bg-card p-3">
      <div className="min-w-0">
        <FileDown className="size-5 text-muted-foreground" aria-hidden />
        <p className="mt-2 truncate text-sm font-medium text-foreground">
          {asset.filename}
        </p>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {fileTypeLabel(asset)}
        </p>
      </div>
      {asset.url ? (
        <a
          href={asset.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
        >
          Download
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">Unavailable</span>
      )}
    </div>
  );
}

function PaletteBody({ block }: { block: PaletteBlock }) {
  if (block.swatches.length === 0)
    return <EmptyNote>No colors picked yet.</EmptyNote>;

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {block.swatches.map((swatch) => (
        <li
          key={swatch.id}
          data-testid={`swatch-${swatch.id}`}
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          <div
            data-testid={`swatch-chip-${swatch.id}`}
            className="h-16 w-full"
            style={{ backgroundColor: swatch.hex }}
          />
          <div className="space-y-0.5 px-3 py-2">
            <p className="font-mono text-sm text-foreground">{swatch.hex}</p>
            {swatch.role && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {SWATCH_ROLE_LABELS[swatch.role]}
              </p>
            )}
            {swatch.label && (
              <p className="truncate text-sm text-foreground/90">
                {swatch.label}
              </p>
            )}
            {/* Pantone is a free-text label production treats as the real
                spec — the hex above it is only a screen approximation. */}
            {swatch.pantoneCode && (
              <p className="text-xs text-muted-foreground">
                Pantone {swatch.pantoneCode}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// The "this brief is blank" prompt, shared with the editor so both surfaces
// invite the same next step.
export function EmptyBrief() {
  return (
    <p className="rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
      Nothing written yet — add an overview, a gallery or a palette to start
      this design&apos;s brief.
    </p>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

// A short human label for a non-renderable file. The filename's extension is
// what people recognize ("AI", "OTF"); the mime subtype is the fallback when
// there isn't one.
function fileTypeLabel(asset: BlockAsset): string {
  const extension = asset.filename.split(".").pop();
  if (extension && extension !== asset.filename) return extension.toUpperCase();
  const subtype = asset.contentType.split("/").pop();
  return (subtype ?? "File").toUpperCase();
}
