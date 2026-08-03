import {
  rosterLinesByDesign,
  type BreakdownEntry,
  type DesignRef,
  type DesignRoster,
  type RosterLine,
} from "@/lib/jerseyBreakdown";
import { cn } from "@/lib/utils";
import { DesignThumbnail } from "@/components/design/DesignThumbnail";
import { DesignationBadge } from "./RosterDesignation";

// The collected roster, read as jerseys rather than as submissions (C-01).
// The responses table answers "who sent what, when"; this answers the
// question a captain actually acts on — "what are we making?" — so a line is
// a player slot in a size, and repeats collapse into a quantity.
//
// Both exports are UI-only over `jerseyRuns.listOrderEntries`: no query of
// their own, so the order detail page and the responses page (C-02) can
// mount them against the same data without a second round-trip.

// One design's lines. The order detail page renders this inside a design
// section that already carries the title, so it deliberately shows none.
export function RosterLines({
  lines,
  className,
}: {
  lines: readonly RosterLine[];
  className?: string;
}) {
  if (lines.length === 0) return null;

  return (
    <ul
      aria-label="Collected jerseys"
      className={cn(
        "divide-y divide-border overflow-hidden rounded-md border border-border",
        className,
      )}
    >
      {lines.map((line) => (
        <li
          key={line.key}
          aria-label={line.label}
          className="flex items-center gap-3 px-4 py-2 text-sm"
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              line.label === "Blank"
                ? "italic text-muted-foreground"
                : "font-medium text-foreground",
            )}
          >
            {line.label}
          </span>
          {/* The letter is a second thing to apply to this garment, so it
              belongs on the line that says what the garment is (M-09). */}
          <DesignationBadge designation={line.designation} />
          <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
            {line.size}
          </span>
          {/* A quantity only earns space when it isn't 1 — most lines are
              one jersey, and "×1" on every row is noise. */}
          <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {line.qty > 1 ? `×${line.qty}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Every design's lines under its own heading — the standalone "By roster"
// view (C-02), where there are no design sections to sit inside.
export function RosterBreakdown({
  entries,
  designs,
  className,
}: {
  entries: readonly BreakdownEntry[];
  designs: readonly DesignRef[];
  className?: string;
}) {
  const groups = rosterLinesByDesign(entries, designs);

  return (
    <div className={cn("space-y-6", className)}>
      {groups.map((group) => (
        <DesignGroup key={group.designId} group={group} />
      ))}
    </div>
  );
}

// The design's picture leads its group. This view is a list of production
// lines under several near-identically-shaped headings, and the kit is what a
// captain recognises a group by faster than its title — so the thumbnail is
// the heading's anchor, sized to the two-line block it sits against.
function DesignGroup({ group }: { group: DesignRoster }) {
  return (
    <section aria-label={`Roster: ${group.designTitle}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <DesignThumbnail
            title={group.designTitle}
            mainImage={group.mainImage}
            className="size-10 shrink-0"
            iconClassName="size-4"
          />
          <h3 className="truncate text-sm font-semibold text-foreground">
            {group.designTitle}
          </h3>
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {group.total} jersey{group.total === 1 ? "" : "s"}
        </p>
      </div>
      {group.lines.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Nothing collected for this design yet.
        </p>
      ) : (
        <RosterLines lines={group.lines} className="mt-2" />
      )}
    </section>
  );
}
