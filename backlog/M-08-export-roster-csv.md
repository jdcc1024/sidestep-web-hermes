# Issue: Export A Design's Roster To CSV

## Status: done

## Phase: 3

## Type: feature

## Description

The design card on the order page shows every rostered player and the sizes
ordered against them, but a captain who wants that list anywhere else — a
supplier email, a printout, their own spreadsheet — has to retype it. Add an
**Export CSV** button beside *Manage roster* on each design card that downloads
that design's roster as an Excel-friendly file with three columns: Name, Number,
Size.

The card collapses repeats into chips (`L ×3`); the CSV does not. A slot with
three Large jerseys is **three rows**, because each row of the file is one
garment to make.

Decisions from the requirements conversation:

- **Unfilled slots are included** with an empty Size cell, so the file doubles
  as the list of people who still owe a size.
- **Blank/bulk jerseys** (sizes ordered with no player behind them) are rows
  with empty Name and Number, listed last.
- **Two row orders**, offered from the button: alphabetical by name (default)
  and grouped by size.

## Acceptance Criteria

- [x] Export CSV sits next to Manage roster on every design card that has a run
- [x] A size ordered N times produces N identical rows
- [x] Columns are Name, Number, Size, with a header row
- [x] An unfilled slot exports with its name and number and a blank size
- [x] Blank/bulk jerseys export with empty name and number, last
- [x] The captain can choose alphabetical (default) or grouped-by-size
- [x] The file opens in Excel with accented names intact (UTF-8 BOM)
- [x] A team or player name that looks like a spreadsheet formula is neutralized
- [x] Tests pass

## Dependencies

- Blocked by: none (builds on M-01's roster read, already on the page)

## Notes

- The order page already holds the roster (`rosterEntries.listForRun` via
  `rosterRowsByDesign`), so this needs **no new Convex query** — the export is
  assembled from data the card is already rendering, which is what keeps the
  file and the card from drifting.
- `lib/orderExport.ts` already has the RFC 4180 serializer and the
  formula-injection guard (3-03); `components/admin/ExportOrderButton.tsx`
  already has the BOM + Blob download. Share those rather than re-writing them.
- `RosterRow` carries a joined `label` ("Gretzky #99") — the CSV needs the name
  and number in separate columns, so the row type has to carry them apart.
