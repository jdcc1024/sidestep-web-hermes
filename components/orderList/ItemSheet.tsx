"use client";

import { useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SIZE_OPTIONS } from "@/lib/jerseyRun";
import { MAX_QTY } from "@/lib/orderEntry/rules";
import {
  ITEM_NAME_MAX_LENGTH,
  checkItemName,
  isPlayerItem,
  removedItemMessage,
} from "@/lib/orderItem";
import {
  ROSTER_NUMBER_MAX_LENGTH,
  checkRosterNumber,
  type RosterDesignation,
} from "@/lib/rosterEntry";
import { userMessage } from "@/lib/userMessage";
import { cn } from "@/lib/utils";
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
import {
  RESTORE_FAILED,
  SAVE_FAILED,
  UNDO_TOAST_MS,
  wrapTabWithin,
  type OrderItem,
} from "./shared";

// The one sheet behind `+ Add item` and a row's `Edit …` button (L-03, UX §4,
// mockup frames 2–3). A bottom sheet, so on a phone it reads as a step inside
// the list rather than a page of its own. It opens from its own trigger, so
// Base UI returns focus there when it closes.
//
// Writes go straight to the `orderItems` mutations; the page's one
// `listForOrder` subscription re-pushes the list, so the row, the chips and
// the footer all move in the same render.
export function ItemSheet({
  orderId,
  designId,
  designTitle,
  item,
  trigger,
  children,
}: {
  orderId: Id<"orders">;
  designId: Id<"designs">;
  designTitle: string;
  // Present: edit this item. Absent: add one to the design.
  item?: OrderItem;
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
        // desktop puts the size pills a metre from the name field.
        className="max-h-[92dvh] gap-0 data-[side=bottom]:sm:mx-auto data-[side=bottom]:sm:max-w-lg data-[side=bottom]:sm:rounded-t-2xl data-[side=bottom]:sm:border-x"
      >
        {/* Mounted only while open, so every opening starts from the item as
            it is now (or from blank), never from a half-edit abandoned with
            Escape. */}
        <ItemForm
          orderId={orderId}
          designId={designId}
          designTitle={designTitle}
          item={item}
          onClose={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

type Fields = {
  name: string;
  number: string;
  size: string | undefined;
  qty: number;
  designation: RosterDesignation | undefined;
};

const BLANK: Fields = {
  name: "",
  number: "",
  size: undefined,
  qty: 1,
  designation: undefined,
};

function fieldsOf(item: OrderItem | undefined): Fields {
  if (!item) return BLANK;
  return {
    name: item.name ?? "",
    number: item.number ?? "",
    size: item.size,
    qty: item.qty,
    designation: item.designation,
  };
}

// The editable fields as the mutations take them: blanks omitted. Never the
// item's provenance (who sent it, their answers) — `update` is a full replace
// of what the captain may edit, and that isn't theirs to edit.
function payloadOf(fields: Fields) {
  const name = checkItemName(fields.name);
  if (!name.ok) return { error: name.error };
  const number = checkRosterNumber(fields.number);
  if (!number.ok) return { error: number.error };
  return {
    value: {
      name: name.value,
      number: number.value,
      designation: fields.designation,
      size: fields.size,
      qty: fields.qty,
    },
  };
}

function ItemForm({
  orderId,
  designId,
  designTitle,
  item,
  onClose,
}: {
  orderId: Id<"orders">;
  designId: Id<"designs">;
  designTitle: string;
  item?: OrderItem;
  onClose: () => void;
}) {
  const add = useMutation(api.orderItems.add);
  const update = useMutation(api.orderItems.update);
  const remove = useMutation(api.orderItems.remove);
  const restore = useMutation(api.orderItems.restore);

  const [fields, setFields] = useState<Fields>(() => fieldsOf(item));
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const ids = {
    name: useId(),
    number: useId(),
    size: useId(),
    qty: useId(),
    letter: useId(),
  };

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  // A legacy size the catalog has since dropped (`XXL`) stays pickable on the
  // item that carries it, so an unrelated edit doesn't clear it.
  const sizes: readonly string[] =
    item?.size && !(SIZE_OPTIONS as readonly string[]).includes(item.size)
      ? [...SIZE_OPTIONS, item.size]
      : SIZE_OPTIONS;

  async function onAdd(another: boolean) {
    const payload = payloadOf(fields);
    if (payload.error !== undefined) {
      toast.error(payload.error);
      return;
    }
    setBusy(true);
    try {
      await add({ orderId, designId, ...payload.value });
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

  async function onSave(current: OrderItem) {
    const payload = payloadOf(fields);
    if (payload.error !== undefined) {
      toast.error(payload.error);
      return;
    }
    setBusy(true);
    try {
      await update({ itemId: current._id, ...payload.value });
      onClose();
    } catch (err) {
      toast.error(userMessage(err, SAVE_FAILED));
    } finally {
      setBusy(false);
    }
  }

  // No confirm step (UX §7.4): the item goes whole, sized or not, and Undo
  // brings the same item back — restore un-deletes it, so its id, its place
  // in the list and who sent it all survive.
  async function onRemove(current: OrderItem) {
    setBusy(true);
    try {
      await remove({ itemId: current._id });
    } catch (err) {
      toast.error(userMessage(err, SAVE_FAILED));
      setBusy(false);
      return;
    }
    onClose();
    toast(removedItemMessage(current), {
      duration: UNDO_TOAST_MS,
      action: {
        label: "Undo",
        onClick: () => undo(current._id),
      },
    });
  }

  // Runs after the sheet (and maybe the row) has gone; the mutation is bound
  // to the client, not to this component, so that's fine.
  async function undo(itemId: Id<"orderItems">) {
    try {
      await restore({ itemId });
    } catch (err) {
      toast.error(userMessage(err, RESTORE_FAILED));
    }
  }

  const editing = item !== undefined;

  return (
    <>
      <SheetHeader className="relative border-b border-border px-4 pt-4 pb-3 pr-14">
        <SheetTitle className="text-lg font-semibold">
          {editing ? "Edit item" : "Add an item"}
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
        {item && isPlayerItem(item) && <PlayerDetails item={item} />}

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
            Leave either one blank if you don&apos;t want it printed.
          </p>
        </div>

        <div>
          <p id={ids.size} className="text-sm font-medium">
            Size
          </p>
          {!editing && (
            <p className="mt-1 text-xs text-muted-foreground">
              Not sure yet? Skip it and we&apos;ll mark it &quot;needs
              size&quot;.
            </p>
          )}
          {/* Toggle buttons rather than radios: tapping the picked size again
              takes it back off, which is how an item goes back to Needs
              size. */}
          <div
            role="group"
            aria-labelledby={ids.size}
            className="mt-2 flex flex-wrap gap-1.5"
          >
            {sizes.map((size) => {
              const picked = fields.size === size;
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => set("size", picked ? undefined : size)}
                  className={cn(
                    "h-10 min-w-12 rounded-lg border px-2.5 text-sm font-semibold tabular-nums outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    picked
                      ? "border-teal-600 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div>
            <p id={ids.qty} className="text-sm font-medium">
              How many
            </p>
            <div
              role="group"
              aria-labelledby={ids.qty}
              className="mt-2 inline-flex items-center rounded-lg border border-border"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10"
                aria-label="One fewer"
                disabled={fields.qty <= 1}
                onClick={() => set("qty", Math.max(1, fields.qty - 1))}
              >
                <MinusIcon aria-hidden />
              </Button>
              <output
                aria-live="polite"
                className="w-9 text-center font-semibold tabular-nums"
              >
                {fields.qty}
              </output>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10"
                aria-label="One more"
                disabled={fields.qty >= MAX_QTY}
                onClick={() => set("qty", Math.min(MAX_QTY, fields.qty + 1))}
              >
                <PlusIcon aria-hidden />
              </Button>
            </div>
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
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row-reverse">
        {item ? (
          <>
            <Button
              type="button"
              disabled={busy}
              className="h-11 shrink-0 sm:flex-1 bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => void onSave(item)}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="h-11 shrink-0 sm:flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void onRemove(item)}
            >
              Remove
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={busy}
              className="h-11 shrink-0 sm:flex-1 bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => void onAdd(false)}
            >
              Add
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="h-11 shrink-0 sm:flex-1"
              onClick={() => void onAdd(true)}
            >
              Add and start another
            </Button>
          </>
        )}
      </div>
    </>
  );
}

// Who sent a player's item and what they answered, read-only, above the
// fields (UX frame 3), so the captain knows whose item it is before changing
// it.
function PlayerDetails({ item }: { item: OrderItem }) {
  const who = [
    item.submitterName,
    item.submitterEmail,
    formatDay(item.createdAt),
  ].filter(Boolean);
  return (
    <dl className="space-y-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
      <div>
        <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Added by
        </dt>
        <dd className="break-words">{`${who.join(" · ")}, through the order form`}</dd>
      </div>
      {Object.entries(item.customAnswers).map(([question, answer]) => (
        <div key={question}>
          <dt className="text-xs font-medium text-muted-foreground">
            {question}
          </dt>
          <dd className="break-words">{answer}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
