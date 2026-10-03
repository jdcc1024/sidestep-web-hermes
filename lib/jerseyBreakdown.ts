// A jersey's display identity, shared by the paste preview and the roster
// export. The roster derivations that used to live here (C-01) read the R-01
// tables, which L-06 retired; every count now comes from the order-item read
// model (lib/orderItem/summary).

const BLANK = "Blank";

// Name and number joined, falling back to "Blank" for a bulk/spare jersey
// that legitimately carries no player (PRD §6, "ship as true blanks").
export function jerseyLabel(name?: string, number?: string): string {
  const label = [name?.trim(), number?.trim() ? `#${number.trim()}` : null]
    .filter(Boolean)
    .join(" ");
  return label || BLANK;
}
