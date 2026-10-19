"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StoredImage } from "@/components/image/StoredImage";
import type { ImagePreset } from "@/lib/images";
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
  contentType = "",
  preset = "original",
  children,
}: {
  src: string;
  alt: string;
  // Names the action rather than the picture, because the trigger is a button:
  // "View crest.png full size" beats hearing the alt text read twice.
  triggerLabel: string;
  triggerClassName?: string;
  // Only read when a preset resizes the picture; without it the full-size
  // view is the plain URL, as before presets existed.
  contentType?: string;
  // How big a picture to fetch (lib/images.ts); `original` by default.
  preset?: ImagePreset;
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
          half the screen wide. A tall image is capped so it scales down.
          From sm up the picture uses the screen, at most 90vw x 90vh with its
          shape kept (docs/ux/0004-public-form.md §4.6). The frame is pinned to
          both edges and centred with auto margins instead of left-50% plus a
          -50% shift, because that shift is what held w-fit to half the screen.
          The close ✕ gets a round backing so it stays visible over a dark
          picture; it is scoped here so other dialogs keep the ghost button. */}
      <DialogContent className="w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] gap-3 p-2 sm:inset-x-0 sm:mx-auto sm:w-fit sm:max-w-[90vw] sm:translate-x-0 sm:p-3 [&_[data-slot=dialog-close]]:rounded-full [&_[data-slot=dialog-close]]:bg-background/85 [&_[data-slot=dialog-close]]:shadow-sm">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <StoredImage
          image={{ url: src, contentType }}
          preset={preset}
          data-testid="lightbox-image"
          alt={alt}
          className="mx-auto max-h-[80vh] w-full max-w-full rounded-md object-contain sm:max-h-[90vh] sm:w-auto"
        />
      </DialogContent>
    </Dialog>
  );
}
