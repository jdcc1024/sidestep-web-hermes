// Form adapter for the portal's new-design form. Wraps the
// atomic rules in ./rules into a DesignErrors record keyed by form field,
// plus a toDesignPayload helper that converts validated input into the
// shape the Convex mutation accepts. The Convex side imports the same
// rules directly — see convex/designs.ts.
//
// Silhouette specs (style/neckline/sleeve) live in ./rules and on the
// designs table. The design form captures them as of O-02 — all three are
// optional so an idea-only design (overview + files, cut undecided) still
// saves. jerseyStyle is free text; neckline / sleeve are allowlists.
//
// `overview` is the design's description. It's stored as the Overview text
// block rather than a column since D-02, so the cap comes from
// lib/designBlock — the form and the block validator have to agree.

import {
  CANVA_LINK_MAX_LENGTH,
  JERSEY_STYLE_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  isHttpUrl,
  isNeckline,
  isSleeveStyle,
} from "./rules";
import { TEXT_BODY_MAX_LENGTH } from "../designBlock";

export type DesignInput = {
  title: string;
  overview: string;
  canvaLink: string;
  // Silhouette specs — optional. Blank means "not decided yet".
  jerseyStyle: string;
  neckline: string;
  sleeveStyle: string;
  // Number of files selected for this design. Validated as a count rather
  // than a list so "at least one file" is one rule, wherever it's checked —
  // the server re-runs it against the stored rows.
  fileCount: number;
};

export type DesignErrors = Partial<Record<keyof DesignInput, string>>;

export type DesignPayload = {
  title: string;
  overview: string;
  canvaLink?: string;
  jerseyStyle?: string;
  neckline?: string;
  sleeveStyle?: string;
};

export const EMPTY_DESIGN: DesignInput = {
  title: "",
  overview: "",
  canvaLink: "",
  jerseyStyle: "",
  neckline: "",
  sleeveStyle: "",
  fileCount: 0,
};

export function validateDesign(input: DesignInput): DesignErrors {
  const errors: DesignErrors = {};

  const title = input.title.trim();
  if (!title) errors.title = "Give your design a title.";
  else if (title.length > TITLE_MAX_LENGTH)
    errors.title = `Please keep the title under ${TITLE_MAX_LENGTH} characters.`;

  const overview = input.overview.trim();
  if (!overview)
    errors.overview = "Add an overview so Sidestep knows what you want.";
  else if (overview.length > TEXT_BODY_MAX_LENGTH)
    errors.overview = `Please keep the overview under ${TEXT_BODY_MAX_LENGTH} characters.`;

  const canvaLink = input.canvaLink.trim();
  if (canvaLink) {
    if (canvaLink.length > CANVA_LINK_MAX_LENGTH)
      errors.canvaLink = "That link is too long.";
    else if (!isHttpUrl(canvaLink))
      errors.canvaLink = "Paste a full link starting with https://";
  }

  const jerseyStyle = input.jerseyStyle.trim();
  if (jerseyStyle.length > JERSEY_STYLE_MAX_LENGTH)
    errors.jerseyStyle = `Please keep the jersey style under ${JERSEY_STYLE_MAX_LENGTH} characters.`;

  const neckline = input.neckline.trim();
  if (neckline && !isNeckline(neckline))
    errors.neckline = "Choose a neckline from the list.";

  const sleeveStyle = input.sleeveStyle.trim();
  if (sleeveStyle && !isSleeveStyle(sleeveStyle))
    errors.sleeveStyle = "Choose a sleeve style from the list.";

  if (input.fileCount < 1)
    errors.fileCount = "Upload at least one file (logo, mood board, reference image).";

  return errors;
}

export function toDesignPayload(input: DesignInput): DesignPayload {
  const title = input.title.trim();
  const overview = input.overview.trim();
  const canvaLink = input.canvaLink.trim();
  const jerseyStyle = input.jerseyStyle.trim();
  const neckline = input.neckline.trim();
  const sleeveStyle = input.sleeveStyle.trim();
  return {
    title,
    overview,
    ...(canvaLink ? { canvaLink } : {}),
    ...(jerseyStyle ? { jerseyStyle } : {}),
    ...(neckline ? { neckline } : {}),
    ...(sleeveStyle ? { sleeveStyle } : {}),
  };
}
