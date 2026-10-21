"use client";

import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { userMessage } from "@/lib/userMessage";
import { cn } from "@/lib/utils";

const FALLBACK_MESSAGE = "Couldn't open that file. Please try again.";

// The only control that reaches an original print file (IMG-05). No read
// carries the original's URL (a Convex storage URL is an unexpiring bearer
// URL), so this asks `designs.originalUrl` on click, where the server checks
// the caller is the design's owner or an admin. A button, not a link: there
// is no href to copy or middle-click, and that is accepted (0004, option A).
//
// Looks like whatever `className` says; Tailwind's preflight already strips a
// button's background, border and padding and makes it inherit font and
// colour, so only the cursor needs putting back.
export function DownloadOriginal({
  assetId,
  className,
  children = "Download",
  ...rest
}: {
  assetId: Id<"designAssets">;
  className?: string;
  children?: ReactNode;
} & Omit<
  ComponentPropsWithoutRef<"button">,
  "onClick" | "type" | "disabled" | "children" | "className"
>) {
  const convex = useConvex();
  const [pending, setPending] = useState(false);

  async function open() {
    if (pending) return;
    // Opened before the await, inside the click, so popup blockers count it
    // as user-initiated; once the query resolves the gesture has expired.
    const tab = window.open("", "_blank");
    setPending(true);
    try {
      const url = await convex.query(api.designs.originalUrl, { assetId });
      if (!url) throw new Error("The original is no longer in storage.");
      if (tab) {
        // The blank tab is same-origin with us until it navigates; cut the
        // link back so the file's tab can't script this page.
        tab.opener = null;
        tab.location.href = url;
      } else {
        // The blocker refused even the in-gesture open. Navigating this tab
        // still gets the captain their file, at the cost of leaving the page.
        window.location.assign(url);
      }
    } catch (err) {
      tab?.close();
      toast.error(userMessage(err, FALLBACK_MESSAGE));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      {...rest}
      type="button"
      onClick={() => void open()}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn("cursor-pointer disabled:cursor-progress", className)}
    >
      {children}
    </button>
  );
}
