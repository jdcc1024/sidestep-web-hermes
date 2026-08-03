"use client";

import { ChevronDownIcon, DownloadIcon } from "lucide-react";

import { downloadCsv } from "@/lib/csv";
import type { RosterRow } from "@/lib/jerseyBreakdown";
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

// "Export CSV" beside "Manage roster" on the design card (M-08). No query of
// its own, by the same rule the roster sheet follows: the page has already
// read this design's roster for the card, so the export is built from the
// exact rows on screen and the file cannot describe a different team than the
// captain is looking at.
//
// Two orderings rather than one, so it is a menu and not a plain button. They
// are the same jerseys either way — a captain checking the file against a team
// list wants names A–Z, and whoever is pulling stock wants them by size.
export function RosterExportButton({
  teamName,
  designTitle,
  rows,
}: {
  teamName: string;
  designTitle: string;
  rows: readonly RosterRow[];
}) {
  const empty = rows.length === 0;

  const handleExport = (order: RosterExportOrder) => {
    downloadCsv(
      rosterExportFilename(teamName, designTitle, Date.now()),
      buildRosterCsv(rows, order),
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            // A header-only file tells the captain nothing and looks like a
            // broken export; an empty roster has nothing to hand over yet.
            disabled={empty}
          />
        }
      >
        <DownloadIcon aria-hidden />
        Export CSV
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
