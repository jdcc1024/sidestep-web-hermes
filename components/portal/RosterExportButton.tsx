"use client";

import { ChevronDownIcon, DownloadIcon } from "lucide-react";

import { downloadCsv } from "@/lib/csv";
import {
  buildRosterCsv,
  rosterExportFilename,
  type RosterExportOrder,
} from "@/lib/rosterExport";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// "Download CSV" on a design's group in the order list (M-08, L-03). No query
// of its own: the page has already read this design's items for the list, so
// the export is built from the exact items on screen and the file cannot
// describe a different team than the captain is looking at. It stays on a
// locked order — reading the list out is the one thing a frozen list should
// never stop the captain doing.
//
// Two orderings rather than one, so it is a menu and not a plain button. They
// are the same jerseys either way — a captain checking the file against a team
// list wants names A–Z, and whoever is pulling stock wants them by size.
export function RosterExportButton({
  teamName,
  designTitle,
  items,
  className,
}: {
  teamName: string;
  designTitle: string;
  // One per jersey, plus a size-less one per player who still needs sizes.
  items: Parameters<typeof buildRosterCsv>[0];
  className?: string;
}) {
  const empty = items.length === 0;

  const handleExport = (order: RosterExportOrder) => {
    downloadCsv(
      rosterExportFilename(teamName, designTitle, Date.now()),
      buildRosterCsv(items, order),
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            // A header-only file tells the captain nothing and looks like a
            // broken export; an empty list has nothing to hand over yet.
            disabled={empty}
            className={className}
          />
        }
      >
        <DownloadIcon aria-hidden />
        Download CSV
        <ChevronDownIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-56">
        <DropdownMenuItem onClick={() => handleExport("name")}>
          By name (A–Z)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("size")}>
          By size (S, M, L…)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
