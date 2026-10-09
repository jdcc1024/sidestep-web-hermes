"use client";

import { useId, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CheckIcon,
  ChevronDownIcon,
  Maximize2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  EMAIL_MAX_LENGTH,
  EMAIL_PATTERN,
  MAX_QTY,
  SUBMITTER_NAME_MAX_LENGTH,
  addOneSize,
  cardJerseyCount,
  cardToLines,
  lineQty,
  pickedSizes,
  pictureBlock,
  removeOneSize,
  rosterRowLabel,
  toggleOpenRow,
} from "@/lib/orderEntry";
import type { CardSizes, PickedSize } from "@/lib/orderEntry";
import type { PublicDesignImage } from "@/lib/designAsset";
import {
  ROSTER_NAME_MAX_LENGTH,
  ROSTER_NUMBER_MAX_LENGTH,
} from "@/lib/rosterEntry";
import { ANSWER_MAX_LENGTH, isOrderFormClosed } from "@/lib/orderFormResponse";
import { sortSizes } from "@/lib/orderForm";
import { userMessage } from "@/lib/userMessage";
import { cn } from "@/lib/utils";
import { DesignThumbnail } from "@/components/design/DesignThumbnail";
import { SizeCounter } from "@/components/orderList/SizeCounter";
import { SizeQty } from "@/components/orderList/SizeQty";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

// The form's view of a design the fan can order under, the seeded roster
// slots that back the fixed-mode name picker, and its main picture when the
// server found one a browser can draw (null otherwise).
type PublicDesign = {
  _id: Id<"designs">;
  title: string;
  roster: { _id: Id<"rosterEntries">; name: string; number?: string }[];
  mainImage: PublicDesignImage | null;
};

// One control height on this form (0004 UX §4.2): what you type into or
// choose with is 40px. The size buttons go in an even grid rather than
// wrapping, so every button is the same width.
const SIZE_GRID_CLASS = "grid grid-cols-3 gap-1.5 sm:grid-cols-4";
const SIZE_COUNTER_CLASS = "h-10 w-full min-w-0";

type PublicRun = {
  namesMode: "open" | "fixed";
  sizeOptions: string[];
  customQuestions: { id: string; label: string }[];
  deadline: number;
  status: "open" | "closed";
};

export function PublicOrderForm({
  orderFormId,
}: {
  orderFormId: Id<"orderForms">;
}) {
  const data = useQuery(api.orderForms.getPublic, { orderFormId });

  if (data === undefined) return <Skeleton />;
  if (data === null) return <NotFound />;

  const run: PublicRun = {
    namesMode: data.run.namesMode,
    sizeOptions: data.run.sizeOptions,
    customQuestions: data.run.customQuestions,
    deadline: data.run.deadline,
    status: data.run.status,
  };

  // A confirmed list takes no more submissions either (L-06): the server
  // refuses them, so the form shows closed rather than inviting a rejection.
  if (isOrderFormClosed(run) || data.listLocked) {
    return (
      <ClosedState teamName={data.teamName} captainName={data.captainName} />
    );
  }

  return (
    <PublicOrderFormBody
      orderFormId={orderFormId}
      run={run}
      designs={data.designs}
      teamName={data.teamName}
      captainName={data.captainName}
    />
  );
}

// Fixed mode: one line per (roster slot × size) the fan has tapped.
type LineValues = {
  designId: string;
  rosterEntryId: string;
  size: string;
  qty: string;
};

// Open mode: one card per name + number, with a count per size (R2-05).
type CardValues = {
  designId: string;
  name: string;
  number: string;
  sizes: CardSizes;
};

type FormValues = {
  submitterName: string;
  submitterEmail: string;
  customAnswers: Record<string, string>;
  lines: LineValues[];
  cards: CardValues[];
};

function emptyCard(designs: PublicDesign[]): CardValues {
  return {
    // A single-design order shows no design choice — preselect that design
    // so the fan never has to choose.
    designId: designs.length === 1 ? designs[0]._id : "",
    name: "",
    number: "",
    sizes: {},
  };
}

// A card expands to one submitOrder line per (size, qty). Validation already
// ran `cardToLines` on every card, so the failure branch is unreachable.
function cardSubmitLines(card: CardValues, sizeOptions: string[]) {
  const lines = cardToLines(card, sortSizes(sizeOptions));
  if (!lines.ok) return [];
  return lines.value.map((line) => ({
    designId: line.designId as Id<"designs">,
    name: line.name.trim() || undefined,
    number: line.number.trim() || undefined,
    size: line.size,
    qty: line.qty,
  }));
}

// Schema depends on the run (sizeOptions, namesMode) and the order's
// designs, so it's rebuilt per run via useMemo. Reuses the same caps the
// Convex submitOrder mutation enforces so client and server can't drift.
function buildSchema(run: PublicRun, designs: PublicDesign[]) {
  const designIds = new Set<string>(designs.map((d) => d._id));
  const rosterByDesign = new Map<string, Set<string>>(
    designs.map((d) => [d._id, new Set<string>(d.roster.map((r) => r._id))]),
  );

  return z
    .object({
      submitterName: z
        .string()
        .refine((v) => v.trim().length > 0, "Tell us your name.")
        .refine(
          (v) => v.trim().length <= SUBMITTER_NAME_MAX_LENGTH,
          `Keep your name under ${SUBMITTER_NAME_MAX_LENGTH} characters.`,
        ),
      submitterEmail: z
        .string()
        .refine(
          (v) => v.trim().length > 0,
          "We need an email so your captain can reach you.",
        )
        .refine(
          (v) => v.trim().length <= EMAIL_MAX_LENGTH,
          "That email is too long.",
        )
        .refine(
          (v) => EMAIL_PATTERN.test(v.trim()),
          "That doesn't look like an email.",
        ),
      customAnswers: z.record(z.string(), z.string()),
      lines: z.array(
        z.object({
          designId: z.string(),
          rosterEntryId: z.string(),
          size: z.string(),
          qty: z.string(),
        }),
      ),
      cards: z.array(
        z.object({
          designId: z.string(),
          name: z.string(),
          number: z.string(),
          sizes: z.record(z.string(), z.number()),
        }),
      ),
    })
    .superRefine((data, ctx) => {
      // Each mode fills its own array; the other stays empty.
      const filled = run.namesMode === "fixed" ? data.lines : data.cards;
      if (filled.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: [run.namesMode === "fixed" ? "lines" : "cards"],
          message: "Add at least one jersey.",
        });
      }

      data.lines.forEach((line, i) => {
        if (!designIds.has(line.designId)) {
          ctx.addIssue({
            code: "custom",
            path: ["lines", i, "designId"],
            message: "Pick a design.",
          });
        }

        // Size taps only offer sizeOptions, so this guards stale state only.
        if (!run.sizeOptions.includes(line.size)) {
          ctx.addIssue({
            code: "custom",
            path: ["lines", i, "size"],
            message: "That size isn't on this form.",
          });
        }

        const qty = Number.parseInt(line.qty.trim(), 10);
        if (!Number.isInteger(qty) || qty < 1) {
          ctx.addIssue({
            code: "custom",
            path: ["lines", i, "qty"],
            message: "Order at least one.",
          });
        } else if (qty > MAX_QTY) {
          ctx.addIssue({
            code: "custom",
            path: ["lines", i, "qty"],
            message: `Order at most ${MAX_QTY} on one line.`,
          });
        }

        const slots = rosterByDesign.get(line.designId);
        if (!line.rosterEntryId || !slots?.has(line.rosterEntryId)) {
          ctx.addIssue({
            code: "custom",
            path: ["lines", i, "rosterEntryId"],
            message: "Pick a name from the list.",
          });
        }
      });

      data.cards.forEach((card, i) => {
        if (!designIds.has(card.designId)) {
          ctx.addIssue({
            code: "custom",
            path: ["cards", i, "designId"],
            message: "Pick a design.",
          });
        }

        // The rule submit expands the card with, so a valid card always
        // yields lines.
        const lines = cardToLines(card, run.sizeOptions);
        if (!lines.ok) {
          ctx.addIssue({
            code: "custom",
            path: ["cards", i, "sizes"],
            message: lines.error,
          });
        }

        if (card.name.trim().length > ROSTER_NAME_MAX_LENGTH) {
          ctx.addIssue({
            code: "custom",
            path: ["cards", i, "name"],
            message: `Keep the name under ${ROSTER_NAME_MAX_LENGTH} characters.`,
          });
        }
        if (card.number.trim().length > ROSTER_NUMBER_MAX_LENGTH) {
          ctx.addIssue({
            code: "custom",
            path: ["cards", i, "number"],
            message: `Keep the number under ${ROSTER_NUMBER_MAX_LENGTH} characters.`,
          });
        }
      });

      const knownIds = new Set(run.customQuestions.map((q) => q.id));
      for (const id of knownIds) {
        const value = data.customAnswers[id] ?? "";
        if (value.length > ANSWER_MAX_LENGTH) {
          ctx.addIssue({
            code: "custom",
            path: ["customAnswers"],
            message: `Keep each answer under ${ANSWER_MAX_LENGTH} characters.`,
          });
          break;
        }
      }
    });
}

function PublicOrderFormBody({
  orderFormId,
  run,
  designs,
  teamName,
  captainName,
}: {
  orderFormId: Id<"orderForms">;
  run: PublicRun;
  designs: PublicDesign[];
  teamName: string;
  captainName: string;
}) {
  const submitOrder = useMutation(api.orderEntries.submitOrder);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<FormValues | null>(null);
  const [pending, setPending] = useState(false);

  const schema = useMemo(() => buildSchema(run, designs), [run, designs]);
  const emptyCustomAnswers = useMemo(
    () => Object.fromEntries(run.customQuestions.map((q) => [q.id, ""])),
    [run.customQuestions],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      submitterName: "",
      submitterEmail: "",
      customAnswers: emptyCustomAnswers,
      // Fixed mode builds its lines from the pick-your-name list (starts empty);
      // open mode seeds one blank card for the fan to fill in.
      lines: [],
      cards: run.namesMode === "fixed" ? [] : [emptyCard(designs)],
    },
  });

  const { append, remove, update } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const cards = useFieldArray({ control: form.control, name: "cards" });

  // Fixed mode reads live line quantities to render its per-slot counters
  // and the header tally. Each (roster slot × size) the fan picks is one
  // line; clicking a size bumps that line's qty, decrementing trims it.
  const watchedLines =
    useWatch({ control: form.control, name: "lines" }) ?? [];
  const watchedCards =
    useWatch({ control: form.control, name: "cards" }) ?? [];

  function addSize(
    designId: string,
    rosterEntryId: string,
    size: string,
  ) {
    const lines = form.getValues("lines");
    const idx = lines.findIndex(
      (l) => l.rosterEntryId === rosterEntryId && l.size === size,
    );
    if (idx === -1) {
      append({ designId, rosterEntryId, size, qty: "1" });
    } else {
      const cur = Number.parseInt(lines[idx].qty, 10) || 0;
      if (cur < MAX_QTY) update(idx, { ...lines[idx], qty: String(cur + 1) });
    }
    if (form.formState.errors.lines) form.clearErrors("lines");
  }

  function removeSize(rosterEntryId: string, size: string) {
    const lines = form.getValues("lines");
    const idx = lines.findIndex(
      (l) => l.rosterEntryId === rosterEntryId && l.size === size,
    );
    if (idx === -1) return;
    const cur = Number.parseInt(lines[idx].qty, 10) || 0;
    if (cur <= 1) remove(idx);
    else update(idx, { ...lines[idx], qty: String(cur - 1) });
  }

  async function actuallySubmit(values: FormValues) {
    setSubmitError(null);
    setPending(true);
    try {
      await submitOrder({
        orderFormId,
        submitterName: values.submitterName.trim(),
        submitterEmail: values.submitterEmail.trim(),
        customAnswers: values.customAnswers,
        lines:
          run.namesMode === "fixed"
            ? values.lines.map((line) => ({
                designId: line.designId as Id<"designs">,
                rosterEntryId: line.rosterEntryId as Id<"rosterEntries">,
                size: line.size,
                qty: Number.parseInt(line.qty.trim(), 10),
              }))
            : values.cards.flatMap((card) =>
                cardSubmitLines(card, run.sizeOptions),
              ),
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        userMessage(err, "Something went wrong. Please try again."),
      );
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(values: FormValues) {
    // Open-mode only: a line with neither name nor number is a plain
    // jersey. Confirm it's intentional before writing (the captain can't
    // tell a deliberate blank from a forgotten name otherwise). Fixed mode
    // always carries a chosen name, so it skips this.
    if (
      run.namesMode === "open" &&
      values.cards.some(
        (c) => c.name.trim().length === 0 && c.number.trim().length === 0,
      )
    ) {
      setConfirming(values);
      return;
    }
    await actuallySubmit(values);
  }

  if (submitted) return <SuccessState teamName={teamName} />;

  const busy = pending || form.formState.isSubmitting;
  const customAnswersError = form.formState.errors.customAnswers?.message;
  const linesError =
    form.formState.errors.lines?.message ??
    form.formState.errors.cards?.message;
  const singleDesign = designs.length === 1;

  // Both modes count jerseys (Σ qty): a roster slot or a card can each take
  // several sizes.
  const jerseyCount =
    run.namesMode === "fixed"
      ? watchedLines.reduce(
          (sum, l) => sum + (Number.parseInt(l.qty, 10) || 0),
          0,
        )
      : watchedCards.reduce((sum, c) => sum + cardJerseyCount(c.sizes), 0);

  return (
    <>
      <Header
        teamName={teamName}
        captainName={captainName}
        run={run}
        designs={designs}
      />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="mt-8 space-y-8"
          aria-busy={busy}
        >
          <FormField
            control={form.control}
            name="submitterName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Your name
                  <RequiredMark />
                </FormLabel>
                <FormControl>
                  <Input
                    className="h-10"
                    autoComplete="name"
                    maxLength={SUBMITTER_NAME_MAX_LENGTH}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="submitterEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Your email
                  <RequiredMark />
                </FormLabel>
                <FormDescription>
                  So your captain can reach you with updates.
                </FormDescription>
                <FormControl>
                  <Input
                    className="h-10"
                    type="email"
                    autoComplete="email"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {singleDesign ? "Your jerseys" : "Your jerseys & designs"}
              </h2>
              <span className="text-sm text-muted-foreground">
                {jerseyCount} {jerseyCount === 1 ? "jersey" : "jerseys"}
              </span>
            </div>

            {run.namesMode === "fixed" ? (
              <RosterList
                run={run}
                designs={designs}
                singleDesign={singleDesign}
                lines={watchedLines}
                onAdd={addSize}
                onRemove={removeSize}
              />
            ) : (
              <>
                {cards.fields.map((fieldItem, index) => (
                  <JerseyLine
                    key={fieldItem.id}
                    control={form.control}
                    index={index}
                    designs={designs}
                    run={run}
                    singleDesign={singleDesign}
                    removable={cards.fields.length > 1}
                    onRemove={() => cards.remove(index)}
                  />
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cards.append(emptyCard(designs))}
                >
                  <PlusIcon aria-hidden className="h-4 w-4" />
                  Add a different name or number
                </Button>
              </>
            )}

            {linesError && (
              <p role="alert" className="text-sm text-destructive">
                {String(linesError)}
              </p>
            )}
          </div>

          {run.customQuestions.length > 0 && (
            <div className="space-y-6">
              {run.customQuestions.map((q) => (
                <FormField
                  key={q.id}
                  control={form.control}
                  name={`customAnswers.${q.id}` as const}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{q.label}</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          maxLength={ANSWER_MAX_LENGTH}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
              {customAnswersError && (
                <p
                  role="alert"
                  className="text-[0.8rem] font-medium text-destructive"
                >
                  {String(customAnswersError)}
                </p>
              )}
            </div>
          )}

          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}

          <Separator />

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Your captain will see your submission right away.
            </p>
            <Button
              type="submit"
              disabled={busy}
              data-submit-mode="final"
              className="h-10 w-full sm:w-auto sm:px-6"
            >
              {busy ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </form>
      </Form>

      <BlankNameNumberDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        onConfirm={() => {
          const values = confirming;
          setConfirming(null);
          if (values) void actuallySubmit(values);
        }}
      />
    </>
  );
}

// One open-mode jersey card: design tiles (when the order has more than one),
// free-text name and number side by side with one shared helper line, and a
// counter per size (R2-05, 0004 UX §4.3). Fixed-mode runs render the
// pick-your-name list (below) instead of these cards.
function JerseyLine({
  control,
  index,
  run,
  designs,
  singleDesign,
  removable,
  onRemove,
}: {
  control: Control<FormValues>;
  index: number;
  run: PublicRun;
  designs: PublicDesign[];
  singleDesign: boolean;
  removable: boolean;
  onRemove: () => void;
}) {
  const sizes = useMemo(() => sortSizes(run.sizeOptions), [run.sizeOptions]);
  const sizesLabelId = useId();
  const designLabelId = useId();
  const nameNumberHelpId = useId();

  return (
    <fieldset
      aria-label={`Jersey ${index + 1}`}
      className="space-y-4 rounded-xl border border-border bg-muted/30 p-3 sm:p-5"
    >
      <div className="flex items-center justify-between">
        <legend className="text-sm font-semibold text-foreground">
          Jersey {index + 1}
        </legend>
        {removable && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={`Remove jersey ${index + 1}`}
          >
            <Trash2Icon aria-hidden className="h-4 w-4" />
            Remove
          </Button>
        )}
      </div>

      {!singleDesign && (
        <FormField
          control={control}
          name={`cards.${index}.designId`}
          render={({ field }) => (
            <FormItem>
              <FormLabel id={designLabelId}>
                Design
                <RequiredMark />
              </FormLabel>
              {/* Tiles, not a dropdown: the picture shows without opening
                  anything, and the pick reads as the design's title. */}
              <FormControl>
                <RadioGroupPrimitive
                  aria-labelledby={designLabelId}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value)}
                  className="grid grid-cols-2 gap-2"
                >
                  {designs.map((d) => (
                    <DesignTile key={d._id} design={d} />
                  ))}
                </RadioGroupPrimitive>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Name and number on one row at every width; minmax(0,1fr) lets a
          long name scroll inside its box instead of widening the card. */}
      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
          <FormField
            control={control}
            name={`cards.${index}.name`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name on jersey</FormLabel>
                <HelpedInput
                  helpId={nameNumberHelpId}
                  className="h-10"
                  maxLength={ROSTER_NAME_MAX_LENGTH}
                  {...field}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`cards.${index}.number`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number</FormLabel>
                <HelpedInput
                  helpId={nameNumberHelpId}
                  className="h-10 text-center font-medium tabular-nums"
                  inputMode="numeric"
                  maxLength={ROSTER_NUMBER_MAX_LENGTH}
                  {...field}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <p
          id={nameNumberHelpId}
          className="text-[0.8rem] text-muted-foreground"
        >
          Leave either one blank and we won&apos;t print it.
        </p>
      </div>

      <FormField
        control={control}
        name={`cards.${index}.sizes`}
        render={({ field }) => (
          <FormItem>
            <FormLabel id={sizesLabelId}>
              Sizes
              <RequiredMark />
            </FormLabel>
            <FormControl>
              <div
                role="group"
                aria-labelledby={sizesLabelId}
                className={SIZE_GRID_CLASS}
              >
                {sizes.map((size) => (
                  <SizeCounter
                    key={size}
                    className={SIZE_COUNTER_CLASS}
                    size={size}
                    qty={field.value[size] ?? 0}
                    max={MAX_QTY}
                    onAdd={() => field.onChange(addOneSize(field.value, size))}
                    onRemove={() =>
                      field.onChange(removeOneSize(field.value, size))
                    }
                  />
                ))}
              </div>
            </FormControl>
            <FormDescription>
              Tap a size once for each jersey you want with this name and
              number.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </fieldset>
  );
}

// One design choice in a jersey card: a 40px picture and the title. The
// picture is decoration here (the title names the radio), and it isn't
// zoomable because it sits inside the radio.
function DesignTile({ design }: { design: PublicDesign }) {
  return (
    <RadioPrimitive.Root
      value={design._id}
      className={cn(
        "flex h-14 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-2 text-left text-sm outline-none transition-colors",
        "hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-checked:border-primary data-checked:bg-primary/10 data-checked:ring-1 data-checked:ring-primary",
      )}
    >
      <span aria-hidden className="shrink-0">
        <DesignThumbnail
          title={design.title}
          mainImage={design.mainImage}
          className="size-10"
          iconClassName="size-4"
        />
      </span>
      <span className="line-clamp-2 min-w-0 font-medium text-foreground">
        {design.title}
      </span>
    </RadioPrimitive.Root>
  );
}

// A text input described by a helper line it shares with a sibling field
// (name + number have one), plus its own error once there is one. Lives
// under the field's FormItem so it can read that field's message id.
function HelpedInput({
  helpId,
  ...props
}: React.ComponentProps<typeof Input> & { helpId: string }) {
  const { error, formMessageId } = useFormField();
  return (
    <FormControl>
      <Input
        {...props}
        aria-describedby={error ? `${helpId} ${formMessageId}` : helpId}
      />
    </FormControl>
  );
}

// Fixed-mode order editor ("pick your name", 0004 UX §4.4): the captain's
// roster as a list, one row per slot. Tapping a row opens its size counters;
// one row is open at a time and none to start, so a long roster stays a
// list you can scan for your name. A closed row shows what was picked as
// chips. There's no free-text entry — every jersey is tied to a pre-seeded
// name. Each (slot × size) the fan picks maps to one line in the shared
// `lines` model, so submit reuses the open-mode path.
function RosterList({
  run,
  designs,
  singleDesign,
  lines,
  onAdd,
  onRemove,
}: {
  run: PublicRun;
  designs: PublicDesign[];
  singleDesign: boolean;
  lines: LineValues[];
  onAdd: (designId: string, rosterEntryId: string, size: string) => void;
  onRemove: (rosterEntryId: string, size: string) => void;
}) {
  const sizes = useMemo(() => sortSizes(run.sizeOptions), [run.sizeOptions]);
  // Slot ids are unique across designs, so one id covers the whole form.
  const [openRow, setOpenRow] = useState<string | null>(null);

  const anyRoster = designs.some((d) => d.roster.length > 0);
  if (!anyRoster) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
        Your captain hasn&apos;t added any names yet. Check back once the roster
        is set.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {designs.map((design) => (
        <div
          key={design._id}
          role="group"
          aria-label={design.title}
          className="overflow-hidden rounded-xl border border-border bg-muted/30"
        >
          <div className="flex items-center gap-3 px-3 py-3 sm:px-5">
            {!singleDesign && (
              <DesignThumbnail
                title={design.title}
                mainImage={design.mainImage}
                className="size-10 shrink-0"
                iconClassName="size-4"
              />
            )}
            <div className="min-w-0">
              {!singleDesign && (
                <p className="text-sm font-semibold text-foreground">
                  {design.title}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {design.roster.length === 0
                  ? "No names for this design yet."
                  : "Find your name and tap it to pick sizes."}
              </p>
            </div>
          </div>

          {design.roster.length > 0 && (
            <ul>
              {design.roster.map((slot) => (
                <RosterRow
                  key={slot._id}
                  slot={slot}
                  sizes={sizes}
                  picked={pickedSizes(lines, slot._id, sizes)}
                  qtyFor={(size) => lineQty(lines, slot._id, size)}
                  open={openRow === slot._id}
                  onToggle={() =>
                    setOpenRow((open) => toggleOpenRow(open, slot._id))
                  }
                  onAdd={(size) => onAdd(design._id, slot._id, size)}
                  onRemove={(size) => onRemove(slot._id, size)}
                />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// One player on the pick-your-name list: a 48px row (number, name, picked
// sizes) that opens their size counters underneath. The `#` and the digits
// are separate nodes so the digits right-align in their column on their own.
// Opening moves no focus: the counters are next in tab order (UX §8).
function RosterRow({
  slot,
  sizes,
  picked,
  qtyFor,
  open,
  onToggle,
  onAdd,
  onRemove,
}: {
  slot: PublicDesign["roster"][number];
  sizes: string[];
  picked: PickedSize[];
  qtyFor: (size: string) => number;
  open: boolean;
  onToggle: () => void;
  onAdd: (size: string) => void;
  onRemove: (size: string) => void;
}) {
  const panelId = useId();
  const number = slot.number?.trim();

  return (
    <li className="border-t border-border/60">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={rosterRowLabel(slot, picked)}
        onClick={onToggle}
        className={cn(
          // min-h rather than h: the open row shows the full name, wrapped.
          // 16px on a phone, like the inputs and the approved mock; 14px from sm.
          "flex min-h-12 w-full items-center gap-3 px-3 text-left text-base outline-none transition-colors sm:px-5 sm:text-sm",
          "hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50",
          open && "bg-primary/[.04]",
        )}
      >
        <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-foreground">
          {number ? (
            <>
              <span className="text-muted-foreground">#</span>
              <span>{number}</span>
            </>
          ) : null}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 font-medium text-foreground",
            open ? "py-2 break-words" : "truncate",
          )}
        >
          {slot.name}
        </span>
        {!open && picked.length > 0 && (
          <span className="flex shrink-0 gap-2">
            {picked.map((p) => (
              <span key={p.size}>
                <SizeQty size={p.size} qty={p.qty} />
              </span>
            ))}
          </span>
        )}
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="space-y-2 bg-primary/[.04] px-3 pt-1 pb-4 sm:pr-5 sm:pl-[4.5rem]"
      >
        {open && (
          <>
            <div className={SIZE_GRID_CLASS}>
              {sizes.map((size) => (
                <SizeCounter
                  key={size}
                  className={SIZE_COUNTER_CLASS}
                  size={size}
                  playerName={slot.name}
                  qty={qtyFor(size)}
                  onAdd={() => onAdd(size)}
                  onRemove={() => onRemove(size)}
                />
              ))}
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Tap a size once for each jersey you want.
            </p>
          </>
        )}
      </div>
    </li>
  );
}

function RequiredMark() {
  return (
    <span aria-hidden className="ml-0.5 text-destructive">
      *
    </span>
  );
}

function BlankNameNumberDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave a jersey blank?</DialogTitle>
          <DialogDescription>
            One of your jerseys has no name or number. That jersey will be
            plain — is that what you want?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Go back</Button>} />
          <Button onClick={onConfirm}>Yes, submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The intro, then the design picture (0004 UX §4.5) above "Your name": the
// player's first question is "is this my team's jersey?", so it's answered
// before they type anything.
function Header({
  teamName,
  captainName,
  run,
  designs,
}: {
  teamName: string;
  captainName: string;
  run: PublicRun;
  designs: PublicDesign[];
}) {
  const picture = pictureBlock(designs);
  return (
    <header>
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">
        Jersey run
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {teamName || "Your team"}
      </h1>
      <p className="mt-3 text-muted-foreground">
        {captainName ? `${captainName} is ordering` : "Your captain is ordering"}{" "}
        custom jerseys. Add a jersey for each person — pick the design, size,
        and how you&apos;d like the name and number.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Submissions close {formatDeadline(run.deadline)}.
      </p>

      {picture.kind === "designLine" && (
        <p className="mt-1 text-sm text-muted-foreground">
          Design: {picture.title}
        </p>
      )}

      {picture.kind === "single" && (
        <figure className="mt-6">
          {/* contain, not cover: a jersey mustn't be cropped. Above the
              fold, so it loads straight away. */}
          <DesignThumbnail
            title={picture.design.title}
            mainImage={picture.design.mainImage}
            zoomable
            priority
            fit="contain"
            className="block h-48 w-full rounded-xl sm:h-64"
          />
          <figcaption className="mt-2 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-foreground">
              {picture.design.title}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <Maximize2Icon aria-hidden className="size-3" />
              Tap to enlarge
            </span>
          </figcaption>
        </figure>
      )}

      {/* A tile per design; one without a picture keeps its slot with the
          placeholder, which has nothing to enlarge. */}
      {picture.kind === "tiles" && (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {designs.map((d) => (
            <li key={d._id} className="min-w-0">
              <DesignThumbnail
                title={d.title}
                mainImage={d.mainImage}
                zoomable
                fit="contain"
                className="block h-36 w-full rounded-xl sm:h-40"
              />
              <p className="mt-1.5 line-clamp-2 text-sm font-medium text-foreground">
                {d.title}
              </p>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

function SuccessState({ teamName }: { teamName: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-primary/30 bg-primary/5 p-10 text-center"
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <CheckIcon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold text-foreground">You&apos;re in!</h1>
      <p className="mt-2 text-muted-foreground">
        Your captain at {teamName || "your team"} will be in touch.
      </p>
    </div>
  );
}

function ClosedState({
  teamName,
  captainName,
}: {
  teamName: string;
  captainName: string;
}) {
  return (
    <div className="text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">
        Jersey run
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
        {teamName || "This jersey run"} is closed.
      </h1>
      <p className="mt-3 text-muted-foreground">
        Submissions are no longer being accepted.
        {captainName
          ? ` Reach out to ${captainName} if you think this is a mistake.`
          : ""}
      </p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-foreground">
        We couldn&apos;t find that jersey run.
      </h1>
      <p className="mt-2 text-muted-foreground">
        Double-check the link your captain shared with you.
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      <div className="h-10 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-32 animate-pulse rounded bg-muted" />
      <div className="h-10 w-full animate-pulse rounded bg-muted" />
    </div>
  );
}

function formatDeadline(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
