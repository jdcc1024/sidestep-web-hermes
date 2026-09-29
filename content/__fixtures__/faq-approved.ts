import { formatTierPriceList, priceRange } from "@/lib/faq";
import { DESIGN_FEE } from "@/lib/pricing";

/**
 * TEST FIXTURE, NOT SITE COPY. Editing this file changes nothing on the site;
 * the live FAQ is content/faq.ts.
 *
 * The approved FAQ wording, copied from docs/ux/0001-faq.md §3 at commit
 * 0d4b39a (D11 pilot wording, JCC 2026-09-28; Q6 D6b/D13, 2026-09-29), with the
 * `> ` quote markers stripped. It is the "expected" side of the F-03
 * acceptance tests (backlog/F-03-faq-content-pass.md): content/faq.ts must
 * say the same thing, whitespace aside.
 *
 * Prices are not typed here either: they come from lib/pricing.ts through the
 * same helpers content/faq.ts uses (tiers from 10 up, A4 = A), so a price
 * change moves both sides together.
 */

const FROM_10 = { fromQuantity: 10 };

export type ApprovedEntry = {
  id: string;
  question: string;
  /** §3 Markdown, blank lines and `**` / `[…](…)` syntax as approved. */
  answer: string;
  finePrint?: string;
};

export const TISSUS_PRINT_URL =
  "https://www.tissus-print.com/en/blog/printing/print-file-preparation/understanding-the-difference-between-screen-display-and-printed-fabric-why-do-colours-change";

export const APPROVED_FAQ: ApprovedEntry[] = [
  {
    id: "cost",
    question: "How much do custom jerseys cost?",
    answer: `Jerseys are ${priceRange(FROM_10)} each, and the more you order, the less each one
costs: ${formatTierPriceList(FROM_10)}. Tax and
shipping are included, so there are no hidden fees.

Want us to design it for you? That's a flat $${DESIGN_FEE} design fee, tax included.
The [price calculator](/#pricing) works out your total, and we confirm your
final quote before anything is made.`,
  },
  {
    id: "minimum",
    question: "What's the minimum order?",
    answer: "Our minimum is 10 jerseys per design.",
  },
  {
    id: "timeline",
    question: "How long does an order take?",
    answer: `Most orders take around 4 weeks from the day you approve your design to
delivery. The design back-and-forth comes before that, so get in touch early.

Playing against a season start or a tournament? Put your date on the
[quote form](/intake) and we'll tell you up front if it's tight.

We don't do rush orders. If your date is really tight, get in touch and
we'll talk it through.`,
  },
  {
    id: "process",
    question: "How does the process work?",
    answer: `1. Get a quote: tell us about your team on our [quote form](/intake).
2. Design: add your colours, logos and ideas to our jersey template, or we
   design it with you.
3. Names, numbers & sizes: send us your team's roster. We need it before we
   confirm your order.
4. 3D mock-up: see exactly how your jersey will look before anything is made.
5. Confirm: we lock in your design, roster and final quote, and send your
   invoice.
6. Production: most orders arrive in around 4 weeks.`,
  },
  {
    id: "design",
    question: "Do you help with the design?",
    answer: `Yes. Send us a rough idea, a mood board or a sketch and we'll design it with
you for a flat $${DESIGN_FEE} fee.

Already have a finished design? Then there's no design fee.`,
    finePrint: "Includes up to 3 rounds of changes.",
  },
  {
    id: "design-tips",
    question: "What should we know before sending our design?",
    answer: `Most of the hold-ups we see come down to a few things:

- Send the original logo file, not a screenshot or a picture saved off
  Instagram. Whoever made your logo should have it, usually as an .ai, .eps,
  .svg or .pdf file. If a small image is all you've got, send it anyway and
  we'll tell you what we can do with it.
- Tell us your exact colours. "Navy" is a different blue to everyone, so if
  your club or a sponsor has official colours, send us the Pantone codes.
- Get your team to agree on the look before you send it. Changing direction
  after we've started designing slows everything down.
- Before you confirm, check the mock-up and your roster one more time: how
  every name is spelled, and that each player has the right number and size.
  A typo is a quick fix on the mock-up, but after printing it means making
  that jersey again.`,
  },
  {
    id: "colour",
    question: "Will the colours match what I see on screen?",
    answer: `Close, but not exactly. This one surprises a lot of people, so here's what's
going on.

**Screen Glow vs Fabric**
Your phone lights up every colour from behind. A jersey can't do that. It
only reflects whatever light is around it, so bright, neon-ish colours on
your screen come out a bit softer on fabric.

**Screen differences**
No two screens show colour the same way. Your design will look slightly
different on your phone, your laptop and your teammate's phone, and that
goes for the mock-ups we send you too. Brightness and night mode make a
bigger difference than you'd think.

**Lighting and Cameras**
The finished jersey will look different under gym lights than it does
outside. Phone cameras also adjust colour on their own, so a photo of an old
jersey isn't a reliable colour reference.

Need a specific colour, like a club or sponsor colour? Send us the Pantone
code and we'll match it as closely as the fabric allows.

Want the longer version? [Tissus Print explains it well](${TISSUS_PRINT_URL}).`,
  },
  {
    id: "shipping",
    question: "Where do you ship?",
    answer: `We currently serve the Greater Vancouver area. If you're outside that region,
get in touch and we'll see what we can do.`,
  },
];

export const APPROVED_IDS = APPROVED_FAQ.map((e) => e.id);

/** The approved §3 entry for `id`; throws on an unknown id. */
export function approved(id: string): ApprovedEntry {
  const found = APPROVED_FAQ.find((e) => e.id === id);
  if (!found) throw new Error(`No approved §3 entry "${id}"`);
  return found;
}

/** Runs of whitespace (incl. line breaks and indentation) become one space. */
export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
