import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { IMAGE_DEVICE_SIZES, OPTIMIZABLE_SOURCE_MAX_BYTES } from "./lib/images";

// `getImageProps` reads the images config from `process.env.__NEXT_IMAGE_OPTS`,
// which a Next build inlines from next.config.ts. Under vitest nothing inlines
// it, so render tests would see Next's defaults (srcset up to 3840w) rather
// than ours. Mirror next.config's images block here, built from the same
// lib/images.ts. Node coerces `process.env` values to strings, so the object
// has to ride on a plain-object copy of `process.env`. Remote-host checks are
// skipped when NODE_ENV is "test", so `remotePatterns` doesn't matter here.
process.env = {
  ...process.env,
  __NEXT_IMAGE_OPTS: {
    ...imageConfigDefault,
    deviceSizes: [...IMAGE_DEVICE_SIZES],
    maximumResponseBody: OPTIMIZABLE_SOURCE_MAX_BYTES,
  } as unknown as string,
};
