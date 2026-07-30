"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { isWebSafeImage, type DesignMainImage } from "@/lib/designAsset";
import { cn } from "@/lib/utils";

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
}: {
  title: string;
  mainImage: DesignMainImage | null;
  // Sizing lives with the caller: a card wants a wide cover band, the order
  // page a small square beside the title.
  className?: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src =
    !failed && mainImage?.url && isWebSafeImage(mainImage.contentType)
      ? mainImage.url
      : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border bg-muted/50",
        className,
      )}
    >
      {src ? (
        // Convex storage serves short-lived signed URLs from a per-deployment
        // host, so next/image optimization doesn't apply.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${title} main image`}
          className="size-full object-cover"
          loading="lazy"
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
      )}
    </div>
  );
}
