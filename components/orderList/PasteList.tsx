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
  type RosterPastePreview,
} from "@/lib/orderItem";
import { userMessage } from "@/lib/userMessage";
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
import { SizeQty } from "./SizeQty";

// `Paste a list` (M-03, moved here from the old per-design sheet by L-03):
// parse, preview, confirm. The parser is pure and lives in `lib/orderItem`,
// so the players shown here are exactly what goes to `rosterEntries.addMany`.
// L-04 added the size column; R2-04 groups rows by player, reads a "how
// many" column, and a player already there gets the pasted sizes added.
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
  // The design's players, so the preview can point out a player already
  // there and the sizes it has.
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
        player.name
          ? [{ name: player.name, number: player.number, sizes: player.sizes }]
          : [],
      ),
    [players],
  );
  const parsed = useMemo(
    () => parseRosterPaste(text, named),
    [text, named],
  );
  const { counts, preview, rows, tooManyRows } = parsed;
  const toSend = parsed.players;
  async function onConfirm() {
    setBusy(true);
    try {
      const result = await addMany({
        orderId,
        designId,
        players: toSend.map((player) => ({
          name: player.name || undefined,
          number: player.number,
          sizes: player.sizes,
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
          Google Sheets. One row per jersey, or add a &ldquo;how many&rdquo;
          column after the size. Nothing is added until you confirm.
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
          placeholder={"Gretzky\t99\tL\nGretzky\t99\tM\t2\nLemieux\t66"}
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
              {countLine(counts) || "Nothing to add"}
            </p>
            {/* An unreadable row keeps its place: the captain is checking the
                paste against what they copied, so a silently dropped line is
                the one thing they couldn't verify. */}
            <ul aria-label="Paste preview" className="space-y-1.5">
              {preview.map((item) => (
                <PreviewItem
                  key={item.kind === "player" ? item.key : `row-${item.row.line}`}
                  item={item}
                />
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
          disabled={busy || toSend.length === 0}
          onClick={() => void onConfirm()}
        >
          {toSend.length === 0 ? "Nothing to add" : `Add to ${designTitle}`}
        </Button>
      </div>
    </>
  );
}

// `3 new players · 1 updated · 6 jerseys · 2 need sizes · 1 skipped`, zero
// parts left out (UX §7).
function countLine(counts: {
  added: number;
  updated: number;
  jerseys: number;
  needSize: number;
  invalid: number;
}): string {
  return [
    counts.added > 0
      ? `${counts.added} new ${counts.added === 1 ? "player" : "players"}`
      : null,
    counts.updated > 0 ? `${counts.updated} updated` : null,
    counts.jerseys > 0 ? jerseyCountText(counts.jerseys) : null,
    counts.needSize > 0
      ? `${counts.needSize} ${counts.needSize === 1 ? "needs" : "need"} sizes`
      : null,
    counts.invalid > 0 ? `${counts.invalid} skipped` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// The server's counts: `Added 3 players and 6 jerseys`, and how many
// players were already on the list.
function addedMessage({
  added,
  updated,
  jerseys,
}: {
  added: number;
  updated: number;
  jerseys: number;
}): string {
  const message = `Added ${playerCountText(added)} and ${jerseyCountText(jerseys)}`;
  return updated > 0 ? `${message} · ${updated} already on the list` : message;
}

// Every piece wraps rather than truncates: at 375px a long name or note must
// push the row taller, never the sheet wider (§8.2). A player shows the sizes
// this paste adds as the same chips the list rows use (S×1, M×3, XL×1).
function PreviewItem({ item }: { item: RosterPastePreview }) {
  if (item.kind === "invalid")
    return (
      <li className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
        <span className="min-w-0 flex-1 text-sm break-words text-muted-foreground">
          {item.row.raw}
        </span>
        <Badge
          variant="secondary"
          className="h-auto bg-muted whitespace-normal text-muted-foreground"
        >
          {item.row.problem}
        </Badge>
      </li>
    );

  // A matched player with no pasted sizes keeps the sizes it has; only a
  // new one is waiting on sizes.
  const needsSizes = item.status === "new" && item.sizes.length === 0;
  return (
    <li className="rounded-md border border-border/60 bg-background px-3 py-2">
      <p className="text-sm font-medium break-words text-foreground">
        {jerseyLabel(item.name, item.number)}
      </p>
      {(needsSizes || item.sizes.length > 0) && (
        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs tabular-nums">
          {needsSizes ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
              Needs sizes
            </span>
          ) : (
            item.sizes.map((line) => (
              <span
                key={line.size}
                className="rounded-full bg-muted px-2 py-0.5"
              >
                <SizeQty size={line.size} qty={line.qty} />
              </span>
            ))
          )}
        </p>
      )}
      {item.orderedBy.length > 0 && (
        <p className="mt-1 text-xs break-words text-muted-foreground">
          Ordered by{" "}
          <span className="text-foreground">{item.orderedBy.join(", ")}</span>
        </p>
      )}
      {item.notes.map((note) => (
        <p key={note} className="mt-1 text-xs break-words text-muted-foreground">
          {note}
        </p>
      ))}
    </li>
  );
}
