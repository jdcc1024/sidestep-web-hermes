import {
  formatTierPriceList,
  priceRange,
  type FaqEntry,
} from "@/lib/faq";
import { DESIGN_FEE } from "@/lib/pricing";

/**
 * Every FAQ string on the site lives in this file (JCC, D10). Adding,
 * rewording, reordering, hiding or publishing an entry, or changing the
 * section copy, is an edit here and never in a component.
 *
 * Answers use a small Markdown subset (see lib/faq.ts): blank line between
 * paragraphs, `- ` and `1. ` lists, a line that is exactly `**Heading**`, and
 * `[text](/path)` or `[text](https://…)` links. Nothing else is interpreted.
 *
 * Prices are never typed here: they come from lib/pricing.ts so the FAQ can
 * never disagree with the calculator. content/faq.test.ts fails on any
 * literal dollar amount in this file, comments included.
 */

export const FAQ_SECTION: {
  eyebrow: string;
  heading: string;
  subtitle?: string;
  cta?: { prompt: string; label: string; href: string };
} = {
  eyebrow: "FAQ",
  heading: "Common questions, answered.",
  subtitle: "Straight answers to what captains ask us most.",
  cta: {
    prompt: "Didn't see your question?",
    label: "Get a quote and ask us",
    href: "/intake",
  },
};

// A4 = A: the FAQ quotes tiers from 10 jerseys up only.
const FROM_10 = { fromQuantity: 10 };

export const FAQ: FaqEntry[] = [
  {
    id: "cost",
    question: "How much do custom jerseys cost?",
    answer: `Jerseys are ${priceRange(FROM_10)} each, and the more you order, the less each one costs: ${formatTierPriceList(FROM_10)}. Tax and shipping are included, so there are no hidden fees.

Want us to design it for you? That's a flat $${DESIGN_FEE} design fee, tax included. The [price calculator](/#pricing) works out your total, and we confirm your final quote before anything is made.`,
    published: false,
  },
  // Deliberate mismatch, do not "fix": the FAQ steers new customers to 10 or
  // more jerseys, while the price calculator still quotes the 5–9 tier for
  // repeat customers (A3, D1b). The two are meant to disagree.
  {
    id: "minimum",
    question: "What is your minimum order?",
    answer:
      "Our standard minimum is 10 jerseys per design. Smaller runs of 5–10 jerseys are possible but carry a special-order fee.",
    published: true,
  },
  {
    id: "timeline",
    question: "How long does an order take?",
    answer:
      "Most orders take around 4 weeks from confirmed design to delivery. We'll flag a tighter timeline up front if you're working against a tournament or season start.",
    published: true,
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
    published: false,
  },
  {
    id: "design",
    question: "Do you help with the design?",
    answer:
      "Yes — our team has 20+ years of industry experience and can guide you through the design from a rough idea, mood board, or sketch. You'll see a 3D mock-up before anything goes into production.",
    published: true,
  },
  // Held out of the pilot (D6); JCC reviews the tips on their own card. The
  // [CONFIRM] line keeps it off the site even if someone flips `published`.
  {
    id: "design-tips",
    question: "Any tips for designing our jerseys?",
    answer: `A few things that make a big difference:
- Send logos as SVG files or the largest PNG you have. Blurry logos print blurry.
- Make names and numbers stand out hard against the jersey colour so they read
  from across the field.
- Skip tiny text and thin lines. They disappear from a distance.
- Sublimation prints the whole jersey, so full-body patterns and gradients
  are fair game.

[CONFIRM: JCC to edit or replace these tips. Is there any extra cost for more colours or full-body graphics?]`,
    published: false,
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

Want the longer version? [Tissus Print explains it well](https://www.tissus-print.com/en/blog/printing/print-file-preparation/understanding-the-difference-between-screen-display-and-printed-fabric-why-do-colours-change).`,
    published: false,
  },
  {
    id: "shipping",
    question: "Where do you ship?",
    answer:
      "We currently serve the Greater Vancouver area. If you're outside that region, get in touch and we'll see what we can do.",
    published: true,
  },
];

/**
 * Ids that are live deep links (`/#faq-<id>`). Never remove or rename an id
 * in this list: links already shared with customers would break. Append an id
 * here when its entry is first published.
 */
export const PERMANENT_IDS = ["minimum", "timeline", "design", "shipping"] as const;
