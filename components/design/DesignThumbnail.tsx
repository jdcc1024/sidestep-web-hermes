"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import {
  isWebSafeImage,
  type DesignMainImage,
  type PublicDesignImage,
} from "@/lib/designAsset";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./ImageLightbox";

// The picture that stands in for a design on a summary surface (D-07) — the
// order page's design section, and the cards on the portal dashboard and the
// designs list. Shared so "which image, and what if it can't be drawn?" has
// one answer everywhere; the caller only decides how big the box is.
//
// Three things stop an image rendering, and all of them land on the same
// placeholder: the design has no files, the main file isn't something a
// browser draws (a print template can be the owner's explicit pick), or its
// short-lived storage URL went stale between the query and the render.
export function DesignThumbnail({
  title,
  mainImage,
  className,
  iconClassName,
  zoomable = false,
  fit = "cover",
  priority = false,
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
}) {
  const [failed, setFailed] = useState(false);
  const src =
    !failed && mainImage?.url && isWebSafeImage(mainImage.contentType)
      ? mainImage.url
      : null;

  const boxClassName = cn(
    "overflow-hidden rounded-md border border-border bg-muted/50",
    className,
  );

  const picture = src ? (
    // Convex storage serves short-lived signed URLs from a per-deployment
    // host, so next/image optimization doesn't apply.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${title} main image`}
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
    >
      {picture}
    </ImageLightbox>
  );
}
