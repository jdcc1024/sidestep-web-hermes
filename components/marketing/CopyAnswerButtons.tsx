"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { faqCopyText, faqUrl, siteOrigin } from "@/lib/faq";
import { useIsAdmin } from "@/lib/useIsAdmin";

type Copied = "answer" | "link" | null;

// Admin-only (D9): copy an FAQ answer or its deep link to paste into a DM.
// Renders nothing at all for everyone else, so the panel ends where the answer
// does. The origin is read at click time (see siteOrigin).
export function CopyAnswerButtons({ id, plainText }: { id: string; plainText: string }) {
  const isAdmin = useIsAdmin();
  const [copied, setCopied] = useState<Copied>(null);

  if (!isAdmin) return null;

  const copy = async (which: "answer" | "link") => {
    const origin = siteOrigin();
    const text = which === "answer" ? faqCopyText(plainText, origin, id) : faqUrl(origin, id);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      toast.success(which === "answer" ? "Answer copied. Paste it into your message." : "Link copied.");
      setTimeout(() => setCopied((current) => (current === which ? null : current)), 2000);
    } catch {
      // Clipboard access can be denied (insecure origin, permissions). Show
      // the text so it can still be copied by hand.
      toast.error(`Couldn't copy. Here it is: ${text}`);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => copy("answer")}>
        {copied === "answer" ? <CheckIcon className="size-4" aria-hidden /> : <CopyIcon className="size-4" aria-hidden />}
        {copied === "answer" ? "Copied!" : "Copy answer"}
      </Button>
      <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => copy("link")}>
        {copied === "link" ? <CheckIcon className="size-4" aria-hidden /> : <LinkIcon className="size-4" aria-hidden />}
        {copied === "link" ? "Copied!" : "Copy link"}
      </Button>
    </div>
  );
}
