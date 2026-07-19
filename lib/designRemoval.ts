// Copy + diff helpers for the relabel/remove design warning (O-08). The
// data behind the warning comes from convex/orderEntries.ts
// (`affectedByDesignRemoval`, `removedDesigns`, both from R-05); this
// module only turns it into the sentence a captain reads.
//
// Relabel needs nothing here: order entries key off `designId`, so renaming
// a design carries its submissions over untouched and the warning never
// fires. Removal is the case worth warning about.

export type AffectedSubmitter = { name: string; email: string; qty: number };

// The designs the captain has unchecked but not yet saved — the saved
// order's design list minus the form's current one. Deduped, since the
// warning is per design, not per checkbox. Additions are deliberately
// ignored: linking a new design orphans nobody.
export function pendingDesignRemovals(
  saved: string[],
  current: string[],
): string[] {
  const linked = new Set(current);
  return [...new Set(saved)].filter((id) => !linked.has(id));
}

// "Ana Ruiz (2), Ben Chu (1), and Cy Okafor (3)" — names first, because the
// point of the warning is who's affected, with each person's jersey Σ in
// parentheses. Caps at `max` names so a 40-person roster doesn't bury the
// warning; the overflow still gets counted so nobody is silently dropped.
export function describeSubmitters(
  submitters: AffectedSubmitter[],
  max = 3,
): string {
  if (submitters.length === 0) return "";

  const shown = submitters.slice(0, max).map((s) => `${s.name} (${s.qty})`);
  const hidden = submitters.length - shown.length;
  const parts =
    hidden > 0
      ? [...shown, `${hidden} other${hidden === 1 ? "" : "s"}`]
      : shown;

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function jerseyCount(n: number): string {
  return `${n} jersey${n === 1 ? "" : "s"}`;
}
