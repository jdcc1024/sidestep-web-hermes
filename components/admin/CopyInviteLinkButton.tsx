"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { inviteUrl } from "@/lib/adminRecords";

// Copies a lead's portal invite link (issue 2-13). The intake's own id is the
// token — `/invite?token=<intakeId>` — so there's nothing to generate, just a
// URL to hand over. Origin is read at click time rather than render so the
// component works unchanged across preview and production deploys.
export function CopyInviteLinkButton({ intakeId }: { intakeId: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = inviteUrl(window.location.origin, intakeId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (insecure origin, permissions). Show
      // the link so it can still be copied by hand.
      toast.error(`Couldn't copy. The link is ${url}`);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? (
        <CheckIcon className="size-4" aria-hidden />
      ) : (
        <LinkIcon className="size-4" aria-hidden />
      )}
      {copied ? "Copied!" : "Send invite link"}
    </Button>
  );
}
