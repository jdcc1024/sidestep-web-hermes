"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Click a picture, see it full size (D-11). Every surface that shows design
// artwork shows it small — a 56px square beside an order's design title, a
// cropped tile in a gallery block — and looking at the artwork is the whole
// point of putting it there.
//
// The thumbnail itself becomes the trigger button rather than being wrapped in
// one, so the caller's sizing classes still describe the clickable box and no
// extra layout node appears in a flex or grid row.
//
// Callers must only offer this where there is genuinely something to enlarge:
// a placeholder standing in for a missing or non-renderable file has no
// full-size version, and a thumbnail already inside a card-wide <Link> can't
// hold a button at all.
export function ImageLightbox({
  src,
  alt,
  triggerLabel,
  triggerClassName,
  children,
}: {
  src: string;
  alt: string;
  // Names the action rather than the picture, because the trigger is a button:
  // "View crest.png full size" beats hearing the alt text read twice.
  triggerLabel: string;
  triggerClassName?: string;
  // The thumbnail to render inside the trigger.
  children: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={<button type="button" aria-label={triggerLabel} />}
        className={cn(
          "cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2",
          triggerClassName,
        )}
      >
        {children}
      </DialogTrigger>

      {/* Phones get a set width: a fixed, left-50% box sized w-fit can only be
          half the screen wide. A tall image is capped so it scales down. */}
      <DialogContent className="w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] gap-3 p-2 sm:w-fit sm:max-w-[min(90vw,64rem)] sm:p-3">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {/* Convex storage serves short-lived signed URLs from a per-deployment
            host, so next/image optimization doesn't apply. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="lightbox-image"
          src={src}
          alt={alt}
          className="mx-auto max-h-[80vh] w-full max-w-full rounded-md object-contain sm:w-auto"
        />
      </DialogContent>
    </Dialog>
  );
}
