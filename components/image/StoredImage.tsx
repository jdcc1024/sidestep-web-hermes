import { getImageProps } from "next/image";
import { IMAGE_PRESETS, shouldOptimize, type ImagePreset } from "@/lib/images";

// The one <img> for a picture held in Convex storage (0004 R3-02,
// docs/architecture/0004-image-previews.md). The caller names a preset;
// lib/images.ts decides whether the picture goes through Next's optimizer and
// how wide a box the browser should fetch for. `original` (the default) is the
// plain storage URL, so a surface that hasn't picked a preset keeps its bytes.
export function StoredImage({
  image,
  alt,
  preset = "original",
  className,
  loading,
  onError,
  "data-testid": testId,
}: {
  image: { url: string; contentType: string };
  alt: string;
  preset?: ImagePreset;
  className?: string;
  loading?: "eager" | "lazy";
  onError?: () => void;
  "data-testid"?: string;
}) {
  const optimize = shouldOptimize(image.contentType, preset);
  const {
    props: { src, srcSet, sizes },
  } = getImageProps({
    src: image.url,
    alt,
    fill: true,
    sizes: IMAGE_PRESETS[preset].sizes || undefined,
    quality: 75,
    unoptimized: !optimize,
  });

  return (
    // Not next/image's <Image>: we take only the src/srcSet/sizes that
    // getImageProps works out and put them on our own <img>, so the caller's
    // classes size the box (no `fill` absolute positioning, no known width or
    // height needed) and `original` renders exactly today's tag and bytes.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      className={className}
      loading={loading}
      onError={onError}
      data-testid={testId}
    />
  );
}
