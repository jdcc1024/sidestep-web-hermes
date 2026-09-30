import Link from "next/link";

import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { buttonVariants } from "@/components/ui/button";
import { FAQ, FAQ_SECTION } from "@/content/faq";
import {
  isExternalHref,
  parseAnswer,
  publishedFaqs,
  type Block,
  type FaqEntry,
  type Inline,
} from "@/lib/faq";
import { cn } from "@/lib/utils";

// All copy comes from content/faq.ts (D10); this component only lays it out.
// Answers are parsed here, on the server. FaqAccordion (the client half: deep
// links) gets only the rendered node, so no Markdown parsing ships to the
// browser.

function InlineContent({ inlines }: { inlines: Inline[] }) {
  return inlines.map((inline, i) => {
    if (inline.kind === "text") return inline.text;
    if (isExternalHref(inline.href)) {
      return (
        <a key={i} href={inline.href} target="_blank" rel="noopener noreferrer">
          {inline.text}
        </a>
      );
    }
    return (
      <Link key={i} href={inline.href}>
        {inline.text}
      </Link>
    );
  });
}

function AnswerBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading":
      return <h4 className="mb-1 font-bold text-foreground">{block.text}</h4>;
    case "p":
      return (
        <p>
          <InlineContent inlines={block.content} />
        </p>
      );
    case "ul":
    case "ol": {
      const List = block.kind;
      return (
        <List
          className={cn(
            "mb-4 space-y-1 pl-5 last:mb-0",
            List === "ul" ? "list-disc" : "list-decimal",
          )}
        >
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineContent inlines={item} />
            </li>
          ))}
        </List>
      );
    }
  }
}

export function FaqSection({
  entries = FAQ,
  section = FAQ_SECTION,
}: {
  entries?: readonly FaqEntry[];
  section?: typeof FAQ_SECTION;
}) {
  return (
    <section
      id="faq"
      className="border-b border-border bg-muted/40 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
            {section.eyebrow}
          </p>
          <h2 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {section.heading}
          </h2>
          {section.subtitle && (
            <p className="mt-4 text-lg text-muted-foreground">
              {section.subtitle}
            </p>
          )}
        </div>

        <FaqAccordion
          items={publishedFaqs(entries).map((faq) => {
            const blocks = parseAnswer(faq.answer);
            return {
              id: faq.id,
              question: faq.question,
              answerNode: (
                <>
                  {blocks.map((block, i) => (
                    <AnswerBlock key={i} block={block} />
                  ))}
                  {faq.finePrint && (
                    <p className="text-xs text-muted-foreground">
                      {faq.finePrint}
                    </p>
                  )}
                </>
              ),
            };
          })}
        />

        {section.cta && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <p className="text-base text-muted-foreground">
              {section.cta.prompt}
            </p>
            <Link
              href={section.cta.href}
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-teal-600 text-white hover:bg-teal-700",
              )}
            >
              {section.cta.label}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
