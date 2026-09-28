"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CopyAnswerButtons } from "@/components/marketing/CopyAnswerButtons";
import { faqAnchorId } from "@/lib/faq";

export type FaqAccordionItem = {
  id: string;
  question: string;
  /** The answer blocks plus fine print, rendered on the server. */
  answerNode: ReactNode;
  /** What "Copy answer" copies. Never includes the fine print. */
  plainText: string;
};

const DEEP_LINK = /^#faq-([a-z0-9-]+)$/;

// The FAQ's interactive half (F-02): `/#faq-<id>` opens that answer alone,
// scrolls to it and focuses its question. Everything is parsed and rendered on
// the server; this only decides which item is open. Opening items by hand
// never writes to the URL, so history stays clean.
export function FaqAccordion({ items }: { items: FaqAccordionItem[] }) {
  const [value, setValue] = useState<string[]>([]);
  // A fresh object per navigation, so following the same link twice still
  // scrolls. Consumed by the effect below once the panel is mounted.
  const [target, setTarget] = useState<{ id: string } | null>(null);

  const idsKey = items.map((item) => item.id).join(" ");

  useEffect(() => {
    const ids = new Set(idsKey.split(" "));
    const openFromHash = () => {
      const id = DEEP_LINK.exec(window.location.hash)?.[1];
      if (!id || !ids.has(id)) return;
      setValue([id]);
      setTarget({ id });
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [idsKey]);

  // Runs after the commit that opened the item, so its panel is in the DOM
  // and the scroll lands on the item's final layout.
  useEffect(() => {
    if (!target) return;
    const item = document.getElementById(faqAnchorId(target.id));
    if (!item) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    item.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    item.querySelector<HTMLElement>("[data-slot=accordion-trigger]")?.focus({ preventScroll: true });
  }, [target]);

  return (
    <Accordion
      value={value}
      onValueChange={(next) => setValue(next as string[])}
      className="mt-12 rounded-xl border border-border bg-card px-5 shadow-sm"
    >
      {items.map((item) => (
        <AccordionItem
          key={item.id}
          value={item.id}
          id={faqAnchorId(item.id)}
          // Clears the 64px sticky nav when a deep link scrolls here.
          className="scroll-mt-20"
        >
          <AccordionTrigger className="py-4 text-base font-semibold text-foreground">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground">
            {item.answerNode}
            <CopyAnswerButtons id={item.id} plainText={item.plainText} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
