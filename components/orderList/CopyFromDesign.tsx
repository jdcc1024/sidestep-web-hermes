"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { describeRosterCopy } from "@/lib/rosterEntry";
import { userMessage } from "@/lib/userMessage";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SAVE_FAILED } from "./shared";

// `Copy from <design>` (M-04, moved here by L-03). Pull direction: the captain
// is looking at the design that's missing people, so this reads as "fill this
// one in". Picking a source *is* the action — the copy only adds names and
// skips what's already here, so there's nothing to confirm or undo. Renders
// nothing on a one-design order, where it would have no possible source.
export function CopyFromDesign({
  orderId,
  designId,
  otherDesigns,
  className,
}: {
  orderId: Id<"orders">;
  designId: Id<"designs">;
  otherDesigns: readonly { _id: Id<"designs">; title: string }[];
  className?: string;
}) {
  const copyToDesign = useMutation(api.orderItems.copyToDesign);
  const [busy, setBusy] = useState(false);

  if (otherDesigns.length === 0) return null;

  async function onCopy(sourceDesignId: Id<"designs">) {
    setBusy(true);
    try {
      const result = await copyToDesign({
        orderId,
        sourceDesignId,
        targetDesignId: designId,
      });
      // The server's counts, not a client guess: a skip was decided against
      // the list as it stood at write time.
      toast.success(describeRosterCopy(result));
    } catch (err) {
      toast.error(userMessage(err, SAVE_FAILED));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            className={className}
          />
        }
      >
        Copy from
        <ChevronDownIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-48">
        {otherDesigns.map((design) => (
          <DropdownMenuItem
            key={design._id}
            className="min-h-10"
            onClick={() => void onCopy(design._id)}
          >
            {design.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
