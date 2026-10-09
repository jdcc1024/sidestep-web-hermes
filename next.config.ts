import type { NextConfig } from "next";
import {
  IMAGE_DEVICE_SIZES,
  OPTIMIZABLE_SOURCE_MAX_BYTES,
  convexImagePattern,
} from "./lib/images";

// next/image may resize stored pictures from exactly one host: this build's
// Convex deployment (0004 R3-02). Every page needs this variable for the
// Convex client anyway, so fail loudly here rather than at render.
const convexImages = convexImagePattern(process.env.NEXT_PUBLIC_CONVEX_URL);
if (!convexImages) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is missing or not a URL; next.config.ts needs it to allow Convex storage images.",
  );
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.160"],
  images: {
    remotePatterns: [convexImages],
    deviceSizes: IMAGE_DEVICE_SIZES,
    maximumResponseBody: OPTIMIZABLE_SOURCE_MAX_BYTES,
  },
};

export default nextConfig;
