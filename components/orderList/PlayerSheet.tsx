"use client";

import { useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SIZE_OPTIONS, sortSizes } from "@/lib/orderForm";
import { MAX_QTY } from "@/lib/orderEntry/rules";
import {
  ITEM_NAME_MAX_LENGTH,
  checkItemName,
  jerseyCountText,
  playerLabel,
  removedPlayerMessage,
  sendersOf,
  sizeChip,
  sizeQtyText,
  type PlayerLine,
} from "@/lib/orderItem";
import {
  ROSTER_NUMBER_MAX_LENGTH,
  checkRosterNumber,
  playerKey,
  type RosterDesignation,
} from "@/lib/rosterEntry";
import { userMessage } from "@/lib/userMessage";
import { DesignationPicker } from "@/components/portal/RosterDesignation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SizeCounter } from "./SizeCounter";
import {
  RESTORE_FAILED,
  SAVE_FAILED,
  UNDO_TOAST_MS,
  wrapTabWithin,
  type OrderPlayer,
  useQuestionLabel,
} from "./shared";

// The one sheet behind `+ Add player` and a row's `Edit …` button (R2-02, UX
// §5, mockup frames 2–5): name, number, letter and a grid of size counters,
// so "Sidestep #72 in S, M×3, XL" is one sheet. A bottom sheet, so on a phone
// it reads as a step inside the list rather than a page of its own. It opens
// from its own trigger, so Base UI returns focus there when it closes.
//
// Writes go straight to the `rosterEntries` mutations; the page's one
// `listForOrder` subscription re-pushes the list, so the row, the chips and
// the footer all move in the same render. The "already on" notice is a
// client-side `playerKey` lookup over the design's loaded players: a hint
// only, since the server resolves the player again on every write.
export function PlayerSheet({
  orderId,
  designId,
  designTitle,
  players,
  player,
  trigger,
  children,
}: {
  orderId: Id<"orders">;
  designId: Id<"designs">;
  designTitle: string;
  // The design's players as loaded, for the match notice.
  players: readonly OrderPlayer[];
  // Present: edit this player. Absent: add one to the design.
  player?: OrderPlayer;
  // The self-closing button element the sheet opens from.
  trigger: React.ReactElement;
  // The trigger's label.
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger}>{children}</SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onKeyDown={wrapTabWithin}
        // Centred and capped from `sm` up: a full-width bottom sheet on a
        // desktop puts the size grid a metre from the name field.
        className="max-h-[92dvh] gap-0 data-[side=bottom]:sm:mx-auto data-[side=bottom]:sm:max-w-lg data-[side=bottom]:sm:rounded-t-2xl data-[side=bottom]:sm:border-x"
      >
        {/* Mounted only while open, so every opening starts from the player
            as it is now (or from blank), never from a half-edit abandoned
            with Escape. */}
        <PlayerForm
          orderId={orderId}
          designId={designId}
          designTitle={designTitle}
          players={players}
          player={player}
          onClose={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

type Fields = {
  name: string;
  number: string;
  designation: RosterDesignation | undefined;
  // The sheet's count per size. In the edit sheet it starts at the player's
  // totals; what's saved is the difference.
  counts: Record<string, number>;
};

const BLANK: Fields = {
  name: "",
  number: "",
  designation: undefined,
  counts: {},
};

function fieldsOf(player: OrderPlayer | undefined): Fields {
  if (!player) return BLANK;
  return {
    name: player.name ?? "",
    number: player.number ?? "",
    designation: player.designation,
    counts: Object.fromEntries(player.sizes.map((s) => [s.size, s.qty])),
  };
}

// The printed values as the mutations take them: blanks omitted.
function valuesOf(fields: Fields) {
  const name = checkItemName(fields.name);
  if (!name.ok) return { error: name.error };
  const number = checkRosterNumber(fields.number);
  if (!number.ok) return { error: number.error };
  return {
    value: {
      name: name.value,
      number: number.value,
      designation: fields.designation,
    },
  };
}

// The sheet's counts, catalogue order, zeroes dropped.
function picked(counts: Record<string, number>) {
  return sortSizes(Object.keys(counts))
    .map((size) => ({ size, qty: counts[size] ?? 0 }))
    .filter((s) => s.qty > 0);
}

function PlayerForm({
  orderId,
  designId,
  designTitle,
  players,
  player,
  onClose,
}: {
  orderId: Id<"orders">;
  designId: Id<"designs">;
  designTitle: string;
  players: readonly OrderPlayer[];
  player?: OrderPlayer;
  onClose: () => void;
}) {
  const add = useMutation(api.rosterEntries.add);
  const update = useMutation(api.rosterEntries.update);
  const remove = useMutation(api.rosterEntries.remove);
  const restore = useMutation(api.rosterEntries.restore);

  const [fields, setFields] = useState<Fields>(() => fieldsOf(player));
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const ids = {
    name: useId(),
    number: useId(),
    sizes: useId(),
    letter: useId(),
  };

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }));
  const bump = (size: string, by: number) =>
    setFields((prev) => {
      const next = Math.min(MAX_QTY, Math.max(0, (prev.counts[size] ?? 0) + by));
      return { ...prev, counts: { ...prev.counts, [size]: next } };
    });

  // A legacy size the catalogue has since dropped (`XXL`) stays on the player
  // that carries it, so an unrelated edit doesn't clear it.
  const sizes = sortSizes([
    ...new Set<string>([
      ...SIZE_OPTIONS,
      ...(player?.sizes.map((s) => s.size) ?? []),
    ]),
  ]);

  const editing = player !== undefined;
  const typed = { name: fields.name, number: fields.number };
  const typedBlank = playerKey(typed) === "";
  const typedLabel = playerLabel(typed);
  // Another player on this design with the typed name + number: on add the
  // sizes join that row; on edit, saving merges into it.
  const match = players.find(
    (p) =>
      p.entryId !== player?.entryId && playerKey(p) === playerKey(typed),
  );
  const chosen = picked(fields.counts);
  const jerseys = chosen.reduce((sum, s) => sum + s.qty, 0);

  // What the add button says it will do (UX §5): the label is the promise.
  const addLabel = match
    ? jerseys > 0
      ? `Add ${jerseys} to ${playerLabel(match)}`
      : `Add to ${playerLabel(match)}`
    : typedBlank
      ? jerseys > 0
        ? `Add ${jerseys} blank jersey${jerseys === 1 ? "" : "s"}`
        : "Add player"
      : jerseys > 0
        ? `Add ${typedLabel} · ${jerseyCountText(jerseys)}`
        : `Add ${typedLabel}`;
  // Nothing to write: no name, number or size; or a match with no sizes and
  // no letter to set on it.
  const canAdd = match
    ? jerseys > 0 ||
      (fields.designation !== undefined &&
        fields.designation !== match.designation)
    : !typedBlank || jerseys > 0;

  async function onAdd(another: boolean) {
    const values = valuesOf(fields);
    if (values.error !== undefined) {
      toast.error(values.error);
      return;
    }
    setBusy(true);
    try {
      await add({ orderId, designId, ...values.value, sizes: chosen });
      if (another) {
        // A whole team goes in without leaving the sheet (UX frame 2).
        setFields(BLANK);
        nameRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      // The sheet stays open with what was typed, so nothing is lost.
      toast.error(userMessage(err, SAVE_FAILED));
    } finally {
      setBusy(false);
    }
  }

  async function onSave(current: OrderPlayer) {
    const values = valuesOf(fields);
    if (values.error !== undefined) {
      toast.error(values.error);
      return;
    }
    // Deltas, not totals: a fan's jersey that lands while the sheet is open
    // must not be overwritten by this sheet's stale count.
    const before = Object.fromEntries(current.sizes.map((s) => [s.size, s.qty]));
    const sizeDeltas = sortSizes([
      ...new Set([...Object.keys(before), ...Object.keys(fields.counts)]),
    ])
      .map((size) => ({
        size,
        delta: (fields.counts[size] ?? 0) - (before[size] ?? 0),
      }))
      .filter((d) => d.delta !== 0);
    setBusy(true);
    try {
      await update({
        entryId: current.entryId,
        ...values.value,
        sizeDeltas,
        ...(match ? { merge: true } : {}),
      });
      onClose();
    } catch (err) {
      toast.error(userMessage(err, SAVE_FAILED));
    } finally {
      setBusy(false);
    }
  }

  // No confirm step (UX §5): the player goes whole, and Undo brings the same
  // player back — restore un-deletes the entry, so every size and who added
  // each one survive.
  async function onRemove(current: OrderPlayer) {
    setBusy(true);
    try {
      await remove({ entryId: current.entryId });
    } catch (err) {
      toast.error(userMessage(err, SAVE_FAILED));
      setBusy(false);
      return;
    }
    onClose();
    toast(removedPlayerMessage(current), {
      duration: UNDO_TOAST_MS,
      action: {
        label: "Undo",
        onClick: () => undo(current.entryId),
      },
    });
  }

  // Runs after the sheet (and maybe the row) has gone; the mutation is bound
  // to the client, not to this component, so that's fine.
  async function undo(entryId: Id<"rosterEntries">) {
    try {
      await restore({ entryId });
    } catch (err) {
      toast.error(userMessage(err, RESTORE_FAILED));
    }
  }

  return (
    <>
      <SheetHeader className="relative border-b border-border px-4 pt-4 pb-3 pr-14">
        <SheetTitle className="text-lg font-semibold">
          {editing ? "Edit player" : "Add a player"}
        </SheetTitle>
        <SheetDescription>{designTitle}</SheetDescription>
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

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {player && player.lines.length > 0 && (
          <SizesAddedBy lines={player.lines} />
        )}

        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={ids.name}>Name on jersey</Label>
              <Input
                ref={nameRef}
                id={ids.name}
                value={fields.name}
                maxLength={ITEM_NAME_MAX_LENGTH}
                autoComplete="off"
                className="h-11 text-base"
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.number}>Number</Label>
              <Input
                id={ids.number}
                value={fields.number}
                maxLength={ROSTER_NUMBER_MAX_LENGTH}
                inputMode="numeric"
                autoComplete="off"
                className="h-11 text-base"
                onChange={(e) => set("number", e.target.value)}
              />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Leave anything blank you don&apos;t want printed.
          </p>
        </div>

        {match && (
          // A status, not an error: joining the existing row is the point.
          <p
            role="status"
            className="rounded-md border border-teal-600/30 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:bg-teal-500/10 dark:text-teal-100"
          >
            <span className="font-semibold">{playerLabel(match)}</span>
            {editing
              ? ` ${isAre(match)} already on ${designTitle}. Saving puts these sizes on that row.`
              : ` ${isAre(match)} already on ${designTitle}${matchSizes(match)}. The sizes you pick here get added to that row.`}
          </p>
        )}

        <div>
          <p id={ids.sizes} className="text-sm font-medium">
            Sizes
          </p>
          {!editing && (
            <p className="mt-1 text-xs text-muted-foreground">
              Tap a size once for each jersey. Not sure yet? Skip it and
              we&apos;ll mark it &quot;needs sizes&quot;.
            </p>
          )}
          <div
            role="group"
            aria-labelledby={ids.sizes}
            className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4"
          >
            {sizes.map((size) => (
              <SizeCounter
                key={size}
                size={size}
                playerName={typedBlank ? undefined : typedLabel}
                qty={fields.counts[size] ?? 0}
                max={MAX_QTY}
                className="min-w-0"
                onAdd={() => bump(size, 1)}
                onRemove={() => bump(size, -1)}
              />
            ))}
          </div>
          {chosen.length > 0 && (
            <p className="mt-2 flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground tabular-nums">
              <span>{chosen.map(sizeChip).join(" · ")}</span>
              <span>{jerseyCountText(jerseys)}</span>
            </p>
          )}
        </div>

        <div>
          <p id={ids.letter} className="text-sm font-medium">
            Captain letter
          </p>
          <DesignationPicker
            label="Captain letter"
            value={fields.designation}
            onChange={(next) => set("designation", next)}
            className="mt-2"
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row-reverse">
        {player ? (
          <>
            <Button
              type="button"
              disabled={busy}
              className="h-11 shrink-0 sm:flex-1 bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => void onSave(player)}
            >
              {match ? "Merge and save" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="h-11 shrink-0 sm:flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void onRemove(player)}
            >
              Remove player
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={busy || !canAdd}
              className="h-auto min-h-11 shrink-0 whitespace-normal sm:flex-1 bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => void onAdd(false)}
            >
              {addLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !canAdd}
              className="h-11 shrink-0 sm:flex-1"
              onClick={() => void onAdd(true)}
            >
              Add and start another
            </Button>
            {!canAdd && !match && (
              <p className="text-xs text-muted-foreground sm:order-last sm:basis-full">
                Add a name, a number or at least one size.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

// "Blank jerseys are", "Sidestep #72 is".
function isAre(player: OrderPlayer): string {
  return playerKey(player) === "" ? "are" : "is";
}

// ` (S×1, M×3, XL×1)`, or nothing for a player with no sizes yet.
function matchSizes(player: OrderPlayer): string {
  return player.sizes.length > 0
    ? ` (${player.sizes.map(sizeQtyText).join(", ")})`
    : "";
}

// Who added this player's sizes, one line per person, read-only above the
// fields (UX frame 4): `You · S×1, M×2 · Oct 2`, `Riley Chen · M×1, XL×1 ·
// Oct 4, through the order form`, plus what each player answered on the form.
function SizesAddedBy({
  lines,
}: {
  lines: readonly PlayerLine<Id<"orderItems">>[];
}) {
  const questionLabel = useQuestionLabel();
  return (
    <section aria-label="Sizes added by" className="rounded-lg bg-muted px-3 py-2.5 text-sm">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Sizes added by
      </h3>
      <ul className="mt-1.5 space-y-2">
        {sendersOf(lines).map((sender) => {
          const totals = new Map<string, number>();
          for (const line of sender.lines)
            totals.set(line.size, (totals.get(line.size) ?? 0) + line.qty);
          const sizes = sortSizes([...totals.keys()])
            .map((size) => sizeQtyText({ size, qty: totals.get(size)! }))
            .join(", ");
          const who = sender.isYou
            ? "You"
            : (sender.name ?? sender.email ?? "A player");
          const day = formatDay(sender.lines[0].createdAt);
          const answers = Object.assign(
            {},
            ...sender.lines.map((line) => line.customAnswers),
          ) as Record<string, string>;
          return (
            <li key={sender.key} className="break-words">
              <p>
                {`${who} · ${sizes} · ${day}`}
                {!sender.isYou && ", through the order form"}
              </p>
              {sender.email && sender.name && (
                <p className="text-xs text-muted-foreground">{sender.email}</p>
              )}
              {Object.keys(answers).length > 0 && (
                <dl className="mt-1 space-y-1">
                  {Object.entries(answers).map(([question, answer]) => (
                    <div key={question}>
                      <dt className="text-xs font-medium text-muted-foreground">
                        {questionLabel(question)}
                      </dt>
                      <dd className="break-words">{answer}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
