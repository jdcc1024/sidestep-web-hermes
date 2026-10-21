"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import {
  displayImageOf,
  isWebSafeImage,
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
// browser draws (a print template can be the owner's explicit pick), or it
// has no stored preview yet (IMG-04: never the original instead) or the
// preview's URL went missing between the query and the render.
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
  // The captain's summary (which carries a filename) or the public form's
  // picture (which doesn't); `shownImageOf` reads the preview from either.
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
  const shown = mainImage ? shownImageOf(mainImage) : null;
  const src = !failed && shown ? shown.url : null;
  const contentType = shown?.contentType ?? "";

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

// The two shapes carry the preview differently. The captain's summary has a
// filename, the original in `url` (downloads only) and the preview in
// `displayUrl`. The public form's shape has no filename, and its `url` and
// `contentType` already are the preview's (IMG-04): reading it through
// `displayImageOf` would find no `displayUrl` and blank the public form.
function shownImageOf(
  mainImage: DesignMainImage | PublicDesignImage,
): { url: string; contentType: string } | null {
  if ("filename" in mainImage) return displayImageOf(mainImage);
  return isWebSafeImage(mainImage.contentType)
    ? { url: mainImage.url, contentType: mainImage.contentType }
    : null;
}
