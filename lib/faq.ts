import { PRICING_TIERS } from "@/lib/pricing";

/**
 * The FAQ answer model (F-01, docs/architecture/0001-faq.md). Answers are
 * written in a tiny Markdown subset in content/faq.ts, parsed once here into
 * blocks, and rendered either as React (FaqSection) or as plain text (the
 * copy action). Framework-free on purpose: nothing here knows about React.
 */

export type FaqEntry = {
  id: string;
  question: string;
  /** Markdown subset: paragraphs, `- ` / `1. ` lists, `**Heading**` lines, `[text](href)` links. */
  answer: string;
  /** Plain text, muted, under the answer. Never copied (D5). */
  finePrint?: string;
  published: boolean;
};

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "p"; content: Inline[] }
  | { kind: "ul"; items: Inline[][] }
  | { kind: "ol"; items: Inline[][] };

export type TierFilter = { fromQuantity?: number };

// ---------------------------------------------------------------------------
// Parsing

const HEADING_LINE = /^\*\*([^*]+)\*\*$/;
const UL_MARKER = /^- /;
const OL_MARKER = /^\d+\. /;
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

// Only these hrefs become links. Anything else (javascript:, http:, mailto:…)
// stays literal text, so a typo in content can never produce an unsafe link.
function isAllowedHref(href: string): boolean {
  return href.startsWith("/") || href.startsWith("#") || isExternalHref(href);
}

export function isExternalHref(href: string): boolean {
  return href.startsWith("https://");
}

function parseInline(text: string): Inline[] {
  const inlines: Inline[] = [];
  let pending = "";
  let last = 0;

  for (const match of text.matchAll(LINK)) {
    const [whole, label, href] = match;
    const start = match.index ?? 0;
    pending += text.slice(last, start);
    if (isAllowedHref(href)) {
      if (pending) inlines.push({ kind: "text", text: pending });
      pending = "";
      inlines.push({ kind: "link", text: label, href });
    } else {
      pending += whole;
    }
    last = start + whole.length;
  }

  pending += text.slice(last);
  if (pending) inlines.push({ kind: "text", text: pending });
  return inlines;
}

/** Split one blank-line-separated chunk into heading, list and paragraph blocks. */
function parseChunk(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  // Cast, not annotation: `flush` reassigns `list`, which TS can't see, so an
  // annotated `= null` would narrow it to null for the whole loop.
  let list = null as { kind: "ul" | "ol"; items: string[] } | null;

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", content: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
    if (list) {
      blocks.push({ kind: list.kind, items: list.items.map(parseInline) });
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    const heading = HEADING_LINE.exec(line);

    if (heading) {
      flush();
      blocks.push({ kind: "heading", text: heading[1] });
    } else if (UL_MARKER.test(line) || OL_MARKER.test(line)) {
      const kind = UL_MARKER.test(line) ? "ul" : "ol";
      const item = line.replace(kind === "ul" ? UL_MARKER : OL_MARKER, "");
      if (list?.kind === kind) {
        list.items.push(item);
      } else {
        flush();
        list = { kind, items: [item] };
      }
    } else if (list) {
      // A line with no marker continues the previous list item.
      const items = list.items;
      items[items.length - 1] = `${items[items.length - 1]} ${line}`;
    } else {
      paragraph.push(line);
    }
  }

  flush();
  return blocks;
}

export function parseAnswer(md: string): Block[] {
  return md
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((chunk) => chunk.split("\n").filter((line) => line.trim() !== ""))
    .filter((lines) => lines.length > 0)
    .flatMap(parseChunk);
}

// ---------------------------------------------------------------------------
// Plain text (clipboard)

function inlinesToPlain(inlines: Inline[], urls: string[]): string {
  return inlines
    .map((inline) => {
      if (inline.kind === "link" && isExternalHref(inline.href)) {
        urls.push(inline.href);
      }
      return inline.text;
    })
    .join("");
}

function blockToPlain(block: Block): string {
  const urls: string[] = [];
  let text: string;
  switch (block.kind) {
    case "heading":
      return block.text;
    case "p":
      text = inlinesToPlain(block.content, urls);
      break;
    case "ul":
      text = block.items.map((item) => `• ${inlinesToPlain(item, urls)}`).join("\n");
      break;
    case "ol":
      text = block.items
        .map((item, i) => `${i + 1}. ${inlinesToPlain(item, urls)}`)
        .join("\n");
      break;
  }
  // External URLs go on their own line after the block (UX §5 exception, D7).
  return [text, ...urls].join("\n");
}

export function toPlainText(blocks: Block[]): string {
  return blocks
    .map((block, i) => {
      const text = blockToPlain(block);
      if (i === blocks.length - 1) return text;
      return text + (block.kind === "heading" ? "\n" : "\n\n");
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Publishing and links

export function isPublishable(entry: FaqEntry): boolean {
  if (!entry.published) return false;
  return ![entry.question, entry.answer, entry.finePrint ?? ""].some((text) =>
    text.includes("[CONFIRM"),
  );
}

export function publishedFaqs(entries: readonly FaqEntry[]): FaqEntry[] {
  return entries.filter(isPublishable);
}

export function faqAnchorId(id: string): string {
  return `faq-${id}`;
}

export function faqUrl(origin: string, id: string): string {
  return `${origin}/#${faqAnchorId(id)}`;
}

export function faqCopyText(plainText: string, origin: string, id: string): string {
  return `${plainText}\n\n${faqUrl(origin, id)}`;
}

// ---------------------------------------------------------------------------
// Prices, derived from PRICING_TIERS so the FAQ can never disagree with the
// calculator (UX §3 Q1 build rule).

function tiersFrom({ fromQuantity }: TierFilter = {}) {
  if (fromQuantity === undefined) return PRICING_TIERS;
  return PRICING_TIERS.filter(
    (tier) => tier.max === null || tier.max >= fromQuantity,
  );
}

/** "$40 to $60": cheapest to dearest per-jersey price. */
export function priceRange(opts?: TierFilter): string {
  const prices = tiersFrom(opts).map((tier) => tier.pricePerUnit);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? `$${low}` : `$${low} to $${high}`;
}

/** "$60 each for 5–9, $50 for 10–24, $45 for 25–49 and $40 for 50 or more". */
export function formatTierPriceList(opts?: TierFilter): string {
  const parts = tiersFrom(opts).map((tier, i) => {
    const each = i === 0 ? " each" : "";
    const range =
      tier.max === null ? `${tier.min} or more` : `${tier.min}–${tier.max}`;
    return `$${tier.pricePerUnit}${each} for ${range}`;
  });
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
