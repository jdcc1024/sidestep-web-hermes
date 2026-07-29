import type { RosterRow } from "@/lib/jerseyBreakdown";
import { cn } from "@/lib/utils";

// The design card's roster (M-01). Unlike `RosterLines` — which only ever
// showed jerseys somebody ordered — this renders the design's *roster*: a
// captain-seeded player nobody has ordered for is a muted "not yet filled"
// row rather than an absence, which is the feedback the order page was
// missing. Fed by `rosterRowsByDesign` over `rosterEntries.listForRun`, the
// same read the roster editor uses, so the card and the editor can't drift.
//
// UI-only, no query of its own — the page owns the read and hands rows down.

// Six rows: enough of a 15-player roster to recognise it as yours and read
// the first few names, without the card growing taller than the order it
// summarises. The card is a summary; the sheet (M-02) is where the whole
// roster lives.
export const ROSTER_PREVIEW_CAP = 6;

export function DesignRosterPreview({
  rows,
  cap = ROSTER_PREVIEW_CAP,
  className,
}: {
  rows: readonly RosterRow[];
  cap?: number;
  className?: string;
}) {
  if (rows.length === 0) return null;

  const shown = rows.slice(0, cap);
  const hidden = rows.length - shown.length;

  return (
    <ul
      aria-label="Roster"
      className={cn(
        "divide-y divide-border overflow-hidden rounded-md border border-border",
        className,
      )}
    >
      {shown.map((row) => (
        <PreviewRow key={row.key} row={row} />
      ))}
      {hidden > 0 && (
        <li className="px-4 py-2 text-xs text-muted-foreground">
          + {hidden} more
        </li>
      )}
    </ul>
  );
}

function PreviewRow({ row }: { row: RosterRow }) {
  return (
    <li
      aria-label={row.label}
      className="flex items-center gap-3 px-4 py-2 text-sm"
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          row.blank
            ? "italic text-muted-foreground"
            : row.filled
              ? "font-medium text-foreground"
              : "text-muted-foreground",
        )}
      >
        {row.label}
      </span>
      {row.total === 0 ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          Not yet filled
        </span>
      ) : (
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {row.sizes.map(({ size, qty }) => (
            <span
              key={size}
              className="rounded bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground"
            >
              {/* A quantity only earns space when it isn't 1 — most slots are
                  one jersey, and "×1" on every chip is noise. */}
              {qty > 1 ? `${size} ×${qty}` : size}
            </span>
          ))}
        </span>
      )}
    </li>
  );
}
