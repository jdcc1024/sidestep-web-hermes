"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { jerseyLabel } from "@/lib/jerseyBreakdown";
import {
  ROSTER_PASTE_MAX_ROWS,
  jerseyCountText,
  parseRosterPaste,
  playerCountText,
  type RosterPasteRow,
} from "@/lib/orderItem";
import { userMessage } from "@/lib/userMessage";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SAVE_FAILED, wrapTabWithin, type OrderPlayer } from "./shared";

// `Paste a list` (M-03, moved here from the old per-design sheet by L-03):
// parse, preview, confirm. The parser is pure and lives in `lib/orderItem`,
// so the rows shown here are exactly what goes to `rosterEntries.addMany`,
// one player per pasted row (R2-04 groups them) — the count on the button is
// the promise this screen keeps. L-04 added the size column; a row matching
// a player already there adds its size to that player.
export function PasteList({
  orderId,
  designId,
  designTitle,
  players,
  className,
}: {
  orderId: Id<"orders">;
  designId: Id<"designs">;
  designTitle: string;
  // The design's players, so the preview can point out a name already there.
  players: readonly OrderPlayer[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button type="button" variant="ghost" className={className} />}
      >
        Paste a list
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onKeyDown={wrapTabWithin}
        className="max-h-[92dvh] gap-0 data-[side=bottom]:sm:mx-auto data-[side=bottom]:sm:max-w-lg data-[side=bottom]:sm:rounded-t-2xl data-[side=bottom]:sm:border-x"
      >
        <PasteForm
          orderId={orderId}
          designId={designId}
          designTitle={designTitle}
          players={players}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function PasteForm({
  orderId,
  designId,
  designTitle,
  players,
  onDone,
}: {
  orderId: Id<"orders">;
  designId: Id<"designs">;
  designTitle: string;
  players: readonly OrderPlayer[];
  onDone: () => void;
}) {
  const addMany = useMutation(api.rosterEntries.addMany);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const named = useMemo(
    () =>
      players.flatMap((player) =>
        player.name ? [{ name: player.name, number: player.number }] : [],
      ),
    [players],
  );
  const { additions, counts, rows, tooManyRows } = useMemo(
    () => parseRosterPaste(text, named),
    [text, named],
  );
  async function onConfirm() {
    setBusy(true);
    try {
      const result = await addMany({
        orderId,
        designId,
        players: additions.map((row) => ({
          name: row.name || undefined,
          number: row.number,
          sizes: row.size ? [{ size: row.size, qty: 1 }] : [],
        })),
      });
      toast.success(addedMessage(result));
      onDone();
    } catch (err) {
      // Stays open: the block is still in the box, so the captain can fix a
      // row and try again rather than re-copying it.
      toast.error(userMessage(err, SAVE_FAILED));
      setBusy(false);
    }
  }

  return (
    <>
      <SheetHeader className="relative border-b border-border px-4 pt-4 pb-3 pr-14">
        <SheetTitle className="text-lg font-semibold">Paste a list</SheetTitle>
        <SheetDescription>
          {designTitle}. Paste name, number and size straight from Excel or
          Google Sheets. The size column is optional. Nothing is added until
          you confirm.
        </SheetDescription>
        <SheetClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2.5 right-2.5 size-10"
            />
          }
        >
          <XIcon aria-hidden />
          <span className="sr-only">Close</span>
        </SheetClose>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <Textarea
          value={text}
          rows={4}
          aria-label="Paste your list"
          placeholder={"Gretzky\t99\tL\nLemieux\t66"}
          className="max-h-40 font-mono text-sm"
          onChange={(e) => setText(e.target.value)}
        />

        {tooManyRows ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Too many rows. Paste {ROSTER_PASTE_MAX_ROWS} or fewer at a time.
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing pasted yet. Any column order works: we read whichever one
            is the number, and whichever is the size.
          </p>
        ) : (
          <>
            <p className="text-sm font-medium">
              {[
                `${counts.additions} to add`,
                counts.needSize > 0
                  ? `${counts.needSize} ${counts.needSize === 1 ? "needs" : "need"} sizes`
                  : null,
                counts.repeats > 0
                  ? `${counts.repeats} repeat${counts.repeats === 1 ? "" : "s"}`
                  : null,
                counts.invalid > 0 ? `${counts.invalid} skipped` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {/* An unreadable row keeps its place: the captain is checking the
                paste against what they copied, so a silently dropped line is
                the one thing they couldn't verify. */}
            <ul aria-label="Paste preview" className="space-y-1.5">
              {rows.map((row) => (
                <PreviewRow key={row.line} row={row} />
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          disabled={busy}
          onClick={onDone}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="h-11 bg-teal-600 text-white hover:bg-teal-700"
          disabled={busy || additions.length === 0}
          onClick={() => void onConfirm()}
        >
          {additions.length === 0
            ? "Nothing to add"
            : `Add ${countOf(additions.length)}`}
        </Button>
      </div>
    </>
  );
}

function countOf(n: number): string {
  return playerCountText(n);
}

// The server's counts: `Added 3 players · 2 jerseys`, and how many rows
// joined a player already on the list.
function addedMessage({
  added,
  updated,
  jerseys,
}: {
  added: number;
  updated: number;
  jerseys: number;
}): string {
  const parts = [`Added ${playerCountText(added)}`, jerseyCountText(jerseys)];
  if (updated > 0)
    parts.push(`${updated} already on the list`);
  return parts.join(" · ");
}

// Every piece wraps rather than truncates: at 375px a long name or note must
// push the row taller, never the sheet wider (§8.2).
function PreviewRow({ row }: { row: RosterPasteRow }) {
  const excluded = row.status === "invalid";
  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md border px-3 py-2",
        excluded
          ? "border-dashed border-border bg-muted/40"
          : "border-border/60 bg-background",
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 text-sm break-words",
          excluded ? "text-muted-foreground" : "font-medium text-foreground",
        )}
      >
        {excluded ? row.raw : jerseyLabel(row.name, row.number)}
      </span>
      {excluded ? (
        <Badge
          variant="secondary"
          className="h-auto bg-muted whitespace-normal text-muted-foreground"
        >
          {row.problem}
        </Badge>
      ) : row.size ? (
        <Badge variant="secondary">{row.size}</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">Needs sizes</span>
      )}
      {row.note && (
        <p className="basis-full text-xs break-words text-muted-foreground">
          {row.note}
        </p>
      )}
    </li>
  );
}
