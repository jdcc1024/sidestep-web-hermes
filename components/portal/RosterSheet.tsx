"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  ChevronDownIcon,
  ClipboardPasteIcon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { jerseyLabel, type RosterSlotRead } from "@/lib/jerseyBreakdown";
import { cn } from "@/lib/utils";
import {
  ROSTER_NAME_MAX_LENGTH,
  ROSTER_NUMBER_MAX_LENGTH,
  ROSTER_PASTE_MAX_ROWS,
  describeRosterCopy,
  parseRosterPaste,
  validateRosterEntry,
  type RosterPasteRow,
} from "@/lib/rosterEntry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// The roster editor (M-02), moved off Run Setup and onto the design card it
// belongs to. `RosterManager` used to loop every design inside a page framed
// around sharing a link; this is the same CRUD scoped to *one* design, opened
// from the card the captain is already reading.
//
// No query of its own on purpose: the page hands down the slots it already
// read for the card preview (M-01's `rosterEntries.listForRun`), so the
// preview and the editor cannot drift back into the disagreement M-01 fixed.
// Writes go straight to the mutations and Convex re-pushes the read.

// A slot as the sheet needs it — M-01's read plus the branded id the
// mutations take.
export type RosterSheetSlot = Omit<RosterSlotRead, "_id"> & {
  _id: Id<"rosterEntries">;
};

// The order's *other* designs — the sources the mirror can pull from (M-04).
export type RosterCopySource = {
  designId: Id<"designs">;
  title: string;
};

export function RosterSheet({
  runId,
  designId,
  designTitle,
  slots,
  otherDesigns,
  locked,
}: {
  runId: Id<"jerseyRuns">;
  designId: Id<"designs">;
  designTitle: string;
  slots: readonly RosterSheetSlot[];
  otherDesigns: readonly RosterCopySource[];
  locked: boolean;
}) {
  // The sheet is either the roster or the paste preview, never both: the
  // preview is a decision the captain has to finish, and at 375px a
  // textarea plus fifteen preview rows plus the roster underneath is a
  // scroll nobody reads.
  const [pasting, setPasting] = useState(false);

  return (
    <Sheet onOpenChange={(open) => !open && setPasting(false)}>
      <SheetTrigger
        render={<Button type="button" variant="outline" size="sm" />}
      >
        <UsersIcon aria-hidden />
        {locked ? "View roster" : "Manage roster"}
      </SheetTrigger>
      {/* Full-bleed under `sm` so a 15-row roster and its add row fit a
          375px phone without horizontal scroll; a side panel from there up.
          Both classes carry the `data-[side=right]` prefix on purpose — the
          primitive's own width is variant-prefixed, and tailwind-merge only
          overrides a class when the variants match. */}
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="pr-12">
          <SheetTitle>{designTitle}</SheetTitle>
          <SheetDescription>
            {pasting
              ? "Paste two columns — name and number — straight out of Excel or Google Sheets. Nothing is added until you confirm."
              : locked
                ? "This run is locked, so the roster is read-only. Contact Sidestep if something needs to change."
                : "Add the players on this design. A slot stays not yet filled until someone orders a size for it."}
          </SheetDescription>
        </SheetHeader>

        {pasting ? (
          <PasteRoster
            runId={runId}
            designId={designId}
            slots={slots}
            onDone={() => setPasting(false)}
          />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
              {slots.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                  No players yet.
                  {locked ? "" : " Add the first one below."}
                </p>
              ) : (
                <ul aria-label="Roster" className="space-y-2">
                  {slots.map((slot) => (
                    <SlotRow key={slot._id} slot={slot} locked={locked} />
                  ))}
                </ul>
              )}
            </div>

            {!locked && (
              <SheetFooter className="border-t border-border">
                <AddSlotRow runId={runId} designId={designId} />
                {/* The two bulk ways in, under the one-at-a-time row they're
                    shortcuts for. Both wrap at 375px rather than shrink. */}
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPasting(true)}
                  >
                    <ClipboardPasteIcon aria-hidden />
                    Paste a list
                  </Button>
                  <CopyRosterMenu
                    runId={runId}
                    designId={designId}
                    otherDesigns={otherDesigns}
                  />
                </div>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// The mirror (M-04). Pull direction: the captain is already in the sheet for
// the design that's missing players, so this reads as "fill this one in"
// (PRD §6). Picking a source *is* the action — the copy only ever adds slots
// and skips what's already here, so there's nothing to confirm and nothing
// to undo. Renders nothing on a one-design order, where it would be an
// affordance with no possible target.
function CopyRosterMenu({
  runId,
  designId,
  otherDesigns,
}: {
  runId: Id<"jerseyRuns">;
  designId: Id<"designs">;
  otherDesigns: readonly RosterCopySource[];
}) {
  const copyToDesign = useMutation(api.rosterEntries.copyToDesign);
  const [busy, setBusy] = useState(false);

  if (otherDesigns.length === 0) return null;

  async function onCopy(sourceDesignId: Id<"designs">) {
    setBusy(true);
    try {
      const result = await copyToDesign({
        runId,
        sourceDesignId,
        targetDesignId: designId,
      });
      // The server's counts, not a client guess: a slot skipped here was
      // decided against the roster as it stood at write time.
      toast.success(describeRosterCopy(result));
    } catch (err) {
      toast.error("Could not copy the roster", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="sm" disabled={busy} />}
      >
        <CopyIcon aria-hidden />
        Copy roster from
        <ChevronDownIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-48">
        {otherDesigns.map((design) => (
          <DropdownMenuItem
            key={design.designId}
            onClick={() => void onCopy(design.designId)}
          >
            {design.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The bulk-paste flow (M-03): parse, preview, confirm. The parser is pure
// and lives in `lib/rosterEntry`, so the rows shown here and the array sent
// to `createMany` are literally the same object — there is no undo, and the
// count on the button is the promise this screen has to keep.
function PasteRoster({
  runId,
  designId,
  slots,
  onDone,
}: {
  runId: Id<"jerseyRuns">;
  designId: Id<"designs">;
  slots: readonly RosterSheetSlot[];
  onDone: () => void;
}) {
  const createMany = useMutation(api.rosterEntries.createMany);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseRosterPaste(text, slots), [text, slots]);
  const { additions, counts, rows, tooManyRows } = parsed;

  async function onConfirm() {
    setBusy(true);
    try {
      await createMany({ runId, designId, players: additions });
      toast.success(
        `Added ${additions.length} player${additions.length === 1 ? "" : "s"}`,
      );
      onDone();
    } catch (err) {
      // Stays on the paste screen: the block is still in the box, so the
      // captain can fix a row and try again rather than re-copying it.
      toast.error("Could not add players", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4">
        <Textarea
          value={text}
          rows={4}
          aria-label="Paste roster rows"
          placeholder={"Gretzky\t99\nLemieux\t66"}
          className="max-h-40 font-mono text-xs"
          onChange={(e) => setText(e.target.value)}
        />

        {tooManyRows ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Too many rows — paste {ROSTER_PASTE_MAX_ROWS} or fewer at a time.
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing pasted yet. Either column order works — we read whichever
            one is the number.
          </p>
        ) : (
          <>
            <PasteSummary counts={counts} />
            <ul aria-label="Paste preview" className="space-y-1.5">
              {rows.map((row) => (
                <PastePreviewRow key={row.line} row={row} />
              ))}
            </ul>
          </>
        )}
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
        <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={busy || additions.length === 0}
          onClick={() => void onConfirm()}
        >
          {additions.length === 0
            ? "Nothing to add"
            : `Add ${additions.length} player${
                additions.length === 1 ? "" : "s"
              }`}
        </Button>
      </SheetFooter>
    </>
  );
}

// What the paste adds up to, before the row-by-row detail. Only the
// non-zero parts show, so a clean fifteen-row paste reads as one number.
function PasteSummary({
  counts,
}: {
  counts: ReturnType<typeof parseRosterPaste>["counts"];
}) {
  const parts = [
    `${counts.additions} to add`,
    counts.existing > 0 ? `${counts.existing} already there` : null,
    counts.duplicate > 0 ? `${counts.duplicate} repeated` : null,
    counts.invalid > 0 ? `${counts.invalid} couldn't be read` : null,
  ].filter(Boolean);
  return (
    <p className="text-sm font-medium text-foreground">{parts.join(" · ")}</p>
  );
}

// One parsed row. An excluded row keeps its place in the list — the captain
// is checking their paste against what they copied, so a silently dropped
// line would be the one thing they can't verify.
function PastePreviewRow({ row }: { row: RosterPasteRow }) {
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
        {row.status === "invalid"
          ? row.raw
          : jerseyLabel(row.name, row.number)}
      </span>
      {row.problem && (
        <Badge variant="secondary" className="bg-muted text-muted-foreground">
          {row.problem}
        </Badge>
      )}
    </li>
  );
}

function AddSlotRow({
  runId,
  designId,
}: {
  runId: Id<"jerseyRuns">;
  designId: Id<"designs">;
}) {
  const create = useMutation(api.rosterEntries.create);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [adding, setAdding] = useState(false);

  async function onAdd() {
    const errors = validateRosterEntry({ name, number });
    if (errors.name || errors.number) {
      toast.error(errors.name ?? errors.number);
      return;
    }
    setAdding(true);
    try {
      await create({
        runId,
        designId,
        name: name.trim(),
        number: number.trim() || undefined,
      });
      setName("");
      setNumber("");
    } catch (err) {
      toast.error("Could not add player", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setAdding(false);
    }
  }

  // Enter submits from either field: seeding fifteen people is a typing
  // rhythm, and reaching for the button every row breaks it.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void onAdd();
    }
  }

  return (
    <div className="grid grid-cols-[1fr_5rem_auto] gap-2">
      <Input
        placeholder="Player name"
        value={name}
        maxLength={ROSTER_NAME_MAX_LENGTH}
        aria-label="Add player name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <Input
        placeholder="No."
        value={number}
        maxLength={ROSTER_NUMBER_MAX_LENGTH}
        aria-label="Add player number"
        onChange={(e) => setNumber(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <Button type="button" disabled={adding} onClick={() => void onAdd()}>
        <PlusIcon aria-hidden />
        Add
      </Button>
    </div>
  );
}

function SlotRow({
  slot,
  locked,
}: {
  slot: RosterSheetSlot;
  locked: boolean;
}) {
  const update = useMutation(api.rosterEntries.update);
  const remove = useMutation(api.rosterEntries.remove);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(slot.name);
  const [number, setNumber] = useState(slot.number ?? "");
  const [busy, setBusy] = useState(false);
  const label = jerseyLabel(slot.name, slot.number);

  async function onSave() {
    const errors = validateRosterEntry({ name, number });
    if (errors.name || errors.number) {
      toast.error(errors.name ?? errors.number);
      return;
    }
    setBusy(true);
    try {
      await update({
        rosterEntryId: slot._id,
        name: name.trim(),
        number: number.trim() || undefined,
      });
      setEditing(false);
    } catch (err) {
      toast.error("Could not save player", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      await remove({ rosterEntryId: slot._id });
    } catch (err) {
      toast.error("Could not remove player", {
        description: err instanceof Error ? err.message : undefined,
      });
      // Only on failure: a successful remove drops the row entirely, so
      // clearing `busy` there would set state on an unmounted component.
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-md border border-border bg-background p-2">
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <Input
            value={name}
            maxLength={ROSTER_NAME_MAX_LENGTH}
            aria-label={`Edit name for ${label}`}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            value={number}
            maxLength={ROSTER_NUMBER_MAX_LENGTH}
            aria-label={`Edit number for ${label}`}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setName(slot.name);
              setNumber(slot.number ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={() => void onSave()}>
            Save
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li
      aria-label={label}
      className="flex items-start justify-between gap-2 rounded-md border border-border/60 bg-background px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {slot.total === 0 ? (
            <Badge variant="secondary" className="bg-muted text-muted-foreground">
              Not yet filled
            </Badge>
          ) : (
            slot.sizes.map(({ size, qty }) => (
              <Badge
                key={size}
                variant="secondary"
                className="tabular-nums font-semibold"
              >
                {qty > 1 ? `${size} ×${qty}` : size}
              </Badge>
            ))
          )}
          {/* Surfaced, never resolved (PRD §6): the captain fixes it by
              editing, so the flag just has to be legible. */}
          {slot.collision && (
            <Badge
              variant="secondary"
              className="bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
            >
              Two people claimed this
            </Badge>
          )}
        </div>
      </div>
      {!locked && (
        <span className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${label}`}
            onClick={() => setEditing(true)}
          >
            <PencilIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={`Remove ${label}`}
            onClick={() => void onRemove()}
          >
            <XIcon />
          </Button>
        </span>
      )}
    </li>
  );
}
