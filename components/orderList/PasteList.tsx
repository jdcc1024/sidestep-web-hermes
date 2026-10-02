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
  parseRosterPaste,
  type RosterPasteRow,
} from "@/lib/rosterEntry";
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
import { SAVE_FAILED, wrapTabWithin, type OrderItem } from "./shared";

// `Paste a list` (M-03, moved here from the old per-design sheet by L-03):
// parse, preview, confirm. The parser is pure and lives in `lib/rosterEntry`,
// so the rows shown here and the array sent to `addMany` are literally the
// same object — the count on the button is the promise this screen keeps.
// L-04 adds the size column.
export function PasteList({
  orderId,
  designId,
  designTitle,
  items,
  className,
}: {
  orderId: Id<"orders">;
  designId: Id<"designs">;
  designTitle: string;
  // The design's items, so a paste can't add a name that's already there.
  items: readonly OrderItem[];
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
          items={items}
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
  items,
  onDone,
}: {
  orderId: Id<"orders">;
  designId: Id<"designs">;
  designTitle: string;
  items: readonly OrderItem[];
  onDone: () => void;
}) {
  const addMany = useMutation(api.orderItems.addMany);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const named = useMemo(
    () =>
      items.flatMap((item) =>
        item.name ? [{ name: item.name, number: item.number }] : [],
      ),
    [items],
  );
  const { additions, counts, rows, tooManyRows } = useMemo(
    () => parseRosterPaste(text, named),
    [text, named],
  );
  const skipped = counts.existing + counts.duplicate + counts.invalid;

  async function onConfirm() {
    setBusy(true);
    try {
      await addMany({ orderId, designId, rows: additions });
      toast.success(`Added ${countOf(additions.length)}`);
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
          {designTitle}. Paste two columns, name and number, straight from Excel
          or Google Sheets. Nothing is added until you confirm.
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
          placeholder={"Gretzky\t99\nLemieux\t66"}
          className="max-h-40 font-mono text-sm"
          onChange={(e) => setText(e.target.value)}
        />

        {tooManyRows ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Too many rows. Paste {ROSTER_PASTE_MAX_ROWS} or fewer at a time.
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing pasted yet. Either column order works, we read whichever one
            is the number.
          </p>
        ) : (
          <>
            <p className="text-sm font-medium">
              {[
                `${counts.additions} to add`,
                skipped > 0 ? `${skipped} skipped` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {/* An excluded row keeps its place: the captain is checking the
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
  return `${n} item${n === 1 ? "" : "s"}`;
}

function PreviewRow({ row }: { row: RosterPasteRow }) {
  const excluded = row.status !== "new";
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
          "min-w-0 flex-1 truncate text-sm",
          excluded ? "text-muted-foreground" : "font-medium text-foreground",
        )}
      >
        {row.status === "invalid" ? row.raw : jerseyLabel(row.name, row.number)}
      </span>
      {row.problem && (
        <Badge
          variant="secondary"
          className="h-auto bg-muted whitespace-normal text-muted-foreground"
        >
          {row.problem}
        </Badge>
      )}
    </li>
  );
}
