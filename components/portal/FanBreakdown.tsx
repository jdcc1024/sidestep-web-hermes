import {
  jerseysByFan,
  type FanEntry,
  type FanGroup,
} from "@/lib/jerseyBreakdown";
import { cn } from "@/lib/utils";

// The collected run read from the submitter's side (C-02) — the counterpart
// to `RosterBreakdown`, which reads it from the production side. A captain
// chasing one person ("did Sam ever send in a size?") scans this; a captain
// handing a list to the printer scans that.
//
// Deliberately one row per jersey rather than a merged line: this view is
// about what a person asked for, so their three jerseys are three rows even
// when two of them are identical. UI-only over `jerseyRuns.listOrderEntries`,
// no query of its own.
export function FanBreakdown({
  entries,
  className,
}: {
  entries: readonly FanEntry[];
  className?: string;
}) {
  const fans = jerseysByFan(entries);
  // On a single-design run the title is the same on every row, so it's pure
  // noise; on a multi-design run it's the thing that tells two otherwise
  // identical lines apart.
  const showDesign = new Set(entries.map((e) => e.designId)).size > 1;

  if (fans.length === 0)
    return (
      <p
        className={cn(
          "rounded-md border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground",
          className,
        )}
      >
        Nothing collected yet — nobody has submitted a jersey.
      </p>
    );

  return (
    <div className={cn("space-y-6", className)}>
      {fans.map((fan) => (
        <FanGroupSection key={fan.email} fan={fan} showDesign={showDesign} />
      ))}
    </div>
  );
}

function FanGroupSection({
  fan,
  showDesign,
}: {
  fan: FanGroup;
  showDesign: boolean;
}) {
  return (
    <section aria-label={`Fan: ${fan.email}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {fan.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">{fan.email}</p>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {fan.total} jersey{fan.total === 1 ? "" : "s"}
        </p>
      </div>

      <ul
        aria-label={`Jerseys ordered by ${fan.email}`}
        className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border"
      >
        {fan.jerseys.map((jersey) => (
          <li
            key={jersey.key}
            className="flex items-center gap-3 px-4 py-2 text-sm"
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate",
                  jersey.label === "Blank"
                    ? "italic text-muted-foreground"
                    : "font-medium text-foreground",
                )}
              >
                {jersey.label}
              </span>
              {showDesign && (
                <span className="block truncate text-xs text-muted-foreground">
                  {jersey.designTitle}
                </span>
              )}
            </span>
            <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
              {jersey.size}
            </span>
            {/* Same rule as the roster lines: "×1" on every row is noise. */}
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {jersey.qty > 1 ? `×${jersey.qty}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
