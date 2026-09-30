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

If you need a design made for you, there is a flat $${DESIGN_FEE} design fee, tax included. The [price calculator](/#pricing) works out your total, and we confirm your final quote before anything is made.`,
    published: true,
  },
  // Deliberate mismatch, do not "fix": the FAQ steers new customers to 10 or
  // more jerseys, while the price calculator still quotes the 5–9 tier for
  // repeat customers (A3, D1b). The sentence about smaller runs was dropped
  // from this answer on purpose, so the two are meant to disagree.
  {
    id: "minimum",
    question: "What's the minimum order?",
    answer: "Our minimum is 10 jerseys per design.",
    published: true,
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
    published: true,
  },
  {
    id: "design",
    question: "Do you help with the design?",
    answer: `Send us a rough idea, a mood board or a sketch and we'll design it with
you for a flat $${DESIGN_FEE} fee. Our design forms will ask for your input on things like colours, theme, team vibes, etc!

Already have a finished design? Then there's no design fee.`,
    finePrint: "Includes up to 3 rounds of changes.",
    published: true,
  },
  {
    id: "design-tips",
    question: "What should we know before sending our design?",
    answer: `Here are a few common gotchas when designing your jersey:

- If possible, send the original logo file. Ideally as an .ai, .eps,
  .svg or .pdf file. If you're using AI to create your file, we will charge the design fee to vectorize it.
- Colours look different on screens than it does on fabric. If
  your club or a sponsor has official colours, send us the Pantone codes, or look up the closest Pantone to your colours.
- Get your team to agree on the look before you send it. Changing direction
  after we've started designing can add delays into the production process.
- Before you confirm, double check the mock-up and your roster! 
e.g. Name spelling, sizes ordered, etc.`,
    published: true,
  },
  {
    id: "colour",
    question: "Will the colours match what I see on screen?",
    answer: `Close, but not exactly. This one surprises a lot of people, so here's what's
going on.

**Screen Glow vs Fabric**
Your phone lights up every colour from behind. Fabric is the opposite, it can only reflect light
This makes neon-ish colours hard to hit, and colours often look a bit softer on fabric.

**Screen differences**
No two screens show colour the same way. Your design will look slightly
different on your phone, your laptop and your teammate's phone. Ideally, you will want to find pantone colour codes

**Lighting and Cameras**
Because Jerseys show their colour from reflecting light, lighting in a gym or outside can affect how the colours look. 
This also goes for camera photos, which cannot match real life colour spaces.
When we send photos of the jersey, there will be some difference with real life because of the lighting in the camera shot.

Need a specific colour, like a club or sponsor colour? Send us the Pantone
code and we'll match it as closely as the fabric allows.

Want the longer version? [Tissus Print explains it well](https://www.tissus-print.com/en/blog/printing/print-file-preparation/understanding-the-difference-between-screen-display-and-printed-fabric-why-do-colours-change).`,
    published: true,
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
export const PERMANENT_IDS = [
  "cost",
  "minimum",
  "timeline",
  "process",
  "design",
  "design-tips",
  "colour",
  "shipping",
] as const;
