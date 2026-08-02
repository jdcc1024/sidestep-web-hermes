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
//
// M-06 removed the six-row cap and its "+ N more" tail. A cap always hides
// the same thing — the end of the roster — and the end is where the captain
// looks, because that is where the person they just added landed. Columns
// buy back the height instead: fifteen players are five rows at desktop
// width, which is shorter than the capped list they replaced.

export function DesignRosterPreview({
  rows,
  className,
}: {
  rows: readonly RosterRow[];
  className?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <ul
      aria-label="Roster"
      className={cn(
        // Each cell paints its own 1px ring into the `gap-px` around it, so
        // adjacent cells share a hairline and the grid draws both its row and
        // its column rules at any column count — no per-breakpoint nth-child
        // arithmetic, which is what borders on the cells would need. The ring
        // rather than a `bg-border` container because the last row is usually
        // short: colouring the container would leave the unfilled cells of
        // that row as a stray block of border colour. `overflow-hidden` clips
        // the outermost rings against the container's own border.
        "grid gap-px overflow-hidden rounded-md border border-border sm:grid-cols-2 lg:grid-cols-3",
        // One height for every breakpoint, and it self-adjusts: three columns
        // swallow ~30 entries before this binds, a phone's single column
        // starts scrolling around thirteen. A count-based cap would have to
        // be a different count per breakpoint — something CSS can express and
        // a component reading `rows.length` cannot see.
        "max-h-80 overflow-y-auto",
        className,
      )}
    >
      {rows.map((row) => (
        <PreviewRow key={row.key} row={row} />
      ))}
    </ul>
  );
}

function PreviewRow({ row }: { row: RosterRow }) {
  return (
    <li
      aria-label={row.label}
      className="flex items-center gap-2 px-3 py-1.5 text-sm shadow-[0_0_0_1px_var(--border)]"
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
        // The words, not a dash (M-07). Even the narrowest column — a third
        // of the card at 1280 — has room for them beside a truncating name,
        // and "nobody has ordered this one yet" is worth saying rather than
        // leaving a captain to infer it from an empty size column.
        <span className="shrink-0 text-xs text-muted-foreground">
          Not yet filled
        </span>
      ) : (
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {row.sizes.map(({ size, qty }) => (
            <span
              key={size}
              className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground"
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
