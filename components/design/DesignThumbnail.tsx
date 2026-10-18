"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import {
  isWebSafeImage,
  pictureUrl,
  type DesignMainImage,
  type PublicDesignImage,
} from "@/lib/designAsset";
import type { ImagePreset } from "@/lib/images";
import { cn } from "@/lib/utils";
import { StoredImage } from "@/components/image/StoredImage";
import { ImageLightbox } from "./ImageLightbox";

// The picture that stands in for a design on a summary surface (D-07) — the
// order page's design section, and the cards on the portal dashboard and the
// designs list. Shared so "which image, and what if it can't be drawn?" has
// one answer everywhere; the caller only decides how big the box is.
//
// Three things stop an image rendering, and all of them land on the same
// placeholder: the design has no files, the main file isn't something a
// browser draws (a print template can be the owner's explicit pick), or its
// storage URL went missing between the query and the render.
export function DesignThumbnail({
  title,
  mainImage,
  className,
  iconClassName,
  zoomable = false,
  fit = "cover",
  priority = false,
  preset = "original",
}: {
  title: string;
  // Only the url and content type are read, so both the captain's summary
  // (which carries a filename) and the public form (which doesn't) fit.
  mainImage: DesignMainImage | PublicDesignImage | null;
  // Sizing lives with the caller: a card wants a wide cover band, the order
  // page a small square beside the title.
  className?: string;
  iconClassName?: string;
  // Opt-in, not the default (D-11): the dashboard and designs-list cards wrap
  // the whole card in a <Link>, and a button inside an anchor is invalid HTML.
  // Only a thumbnail standing on its own may become a lightbox trigger.
  zoomable?: boolean;
  // `contain` where people look at the picture to recognise a kit (the public
  // form), so a jersey is never cropped; `cover` for a filled tile.
  fit?: "cover" | "contain";
  // Load straight away rather than lazily: for a picture above the fold.
  priority?: boolean;
  // How big a picture to fetch (lib/images.ts). The default, `original`, is
  // the plain storage URL; any other preset also opens a screen-sized
  // lightbox rather than the print file.
  preset?: ImagePreset;
}) {
  const [failed, setFailed] = useState(false);
  // The stored preview when the captain's summary has one (IMG-03); the
  // public form's `url` already is the preview.
  const shown = mainImage ? pictureUrl(mainImage) : null;
  const src =
    !failed && shown && isWebSafeImage(mainImage!.contentType) ? shown : null;
  const contentType = mainImage?.contentType ?? "";

  const boxClassName = cn(
    "overflow-hidden rounded-md border border-border bg-muted/50",
    className,
  );

  const picture = src ? (
    <StoredImage
      image={{ url: src, contentType }}
      alt={`${title} main image`}
      preset={preset}
      className={cn(
        "size-full",
        fit === "contain" ? "object-contain" : "object-cover",
      )}
      loading={priority ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      role="img"
      aria-label={`No image yet for ${title}`}
      className="flex size-full items-center justify-center text-muted-foreground"
    >
      <ImageIcon className={cn("size-5", iconClassName)} aria-hidden />
    </div>
  );

  // No `src` means the placeholder is showing, and a placeholder has no
  // full-size version to open.
  if (!zoomable || !src) return <div className={boxClassName}>{picture}</div>;

  return (
    <ImageLightbox
      src={src}
      alt={`${title} main image`}
      triggerLabel={`View ${title} full size`}
      triggerClassName={boxClassName}
      contentType={contentType}
      preset={preset === "original" ? undefined : "lightbox"}
    >
      {picture}
    </ImageLightbox>
  );
}
