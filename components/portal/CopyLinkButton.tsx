"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The order form's share link, absolute. Built at click time, not render
// time: `window` is unavailable during SSR, and a relative path is
// meaningless to paste into a team chat.
export function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

// Copies `path` as an absolute URL. Older browsers without the async
// clipboard API get `onFallback`, so a caller showing the link in an input
// can select it for a manual Ctrl+C.
export async function copyLink(path: string, onFallback?: () => void) {
  try {
    await navigator.clipboard.writeText(absoluteUrl(path));
    toast.success("Link copied");
  } catch {
    if (onFallback) onFallback();
    else toast.error("Could not copy the link. Please try again.");
  }
}

export function CopyLinkButton({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      className={cn("h-10", className)}
      onClick={() => void copyLink(path)}
    >
      Copy link
    </Button>
  );
}
