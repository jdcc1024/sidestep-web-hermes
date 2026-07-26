// Atomic rules for designs. Constants, type guards, and pure helpers that
// both the form adapter (./form.ts) and the Convex `designs.create` /
// `designs.update` mutations import from. Single source of truth so the
// client and server can't drift on length caps or silhouette-spec
// allowlists.
//
// Silhouette specs (jerseyStyle / neckline / sleeveStyle) live here now
// that a design owns its own cut — they moved off the order in O-01.
// `jerseyStyle` stays free text (a picker is out of scope per the
// new-edit-order-page PRD §6); neckline and sleeve style are allowlists.

export const TITLE_MAX_LENGTH = 120;
export const CANVA_LINK_MAX_LENGTH = 500;
export const JERSEY_STYLE_MAX_LENGTH = 120;

export const NECKLINES = ["Crew Neck", "V-Neck"] as const;
export type Neckline = (typeof NECKLINES)[number];

export const SLEEVE_STYLES = ["Regular", "Raglan"] as const;
export type SleeveStyle = (typeof SLEEVE_STYLES)[number];

export function isNeckline(value: string): value is Neckline {
  return (NECKLINES as readonly string[]).includes(value);
}

export function isSleeveStyle(value: string): value is SleeveStyle {
  return (SLEEVE_STYLES as readonly string[]).includes(value);
}

// Liberal URL check — we display the link as a clickable anchor and do no
// rendering of the content itself, so the goal is just to catch obvious
// typos and reject schemes other than http/https.
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
