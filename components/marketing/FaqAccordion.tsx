"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { faqAnchorId } from "@/lib/faq";

export type FaqAccordionItem = {
  id: string;
  question: string;
  /** The answer blocks plus fine print, rendered on the server. */
  answerNode: ReactNode;
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

  // Runs after the commit that opened the item, so its panel is in the DOM.
  // The scroll waits for the accordion's height animations to finish: when the
  // previously open item sits above the target, its collapse shifts the page up
  // after any earlier scroll, leaving the target under the sticky nav. The
  // collapse runs under reduced motion too, so both modes wait.
  useEffect(() => {
    if (!target) return;
    const item = document.getElementById(faqAnchorId(target.id));
    if (!item) return;
    item.querySelector<HTMLElement>("[data-slot=accordion-trigger]")?.focus({ preventScroll: true });

    let cancelled = false;
    const scroll = () => {
      if (cancelled) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      item.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    };

    const root = item.parentElement;
    // jsdom has no Web Animations API: nothing animates there, so scroll now.
    if (!root || typeof root.getAnimations !== "function") {
      scroll();
      return () => {
        cancelled = true;
      };
    }

    // One frame lets the panel state attributes and CSS animations start.
    const frame = requestAnimationFrame(() => {
      const running = root
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Infinity);
      if (running.length === 0) return scroll();
      const settled = Promise.allSettled(running.map((a) => a.finished));
      // Never wait on a stuck animation for longer than a beat.
      const cap = new Promise((resolve) => setTimeout(resolve, 600));
      // Scroll on the frame after the last animation ends, once a closed
      // panel has unmounted and layout is final.
      void Promise.race([settled, cap]).then(() => requestAnimationFrame(scroll));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
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
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
