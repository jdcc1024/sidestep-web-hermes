"use client";

import { useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  EMAIL_MAX_LENGTH,
  EMAIL_PATTERN,
  MAX_QTY,
  SUBMITTER_NAME_MAX_LENGTH,
} from "@/lib/orderEntry";
import {
  ROSTER_NAME_MAX_LENGTH,
  ROSTER_NUMBER_MAX_LENGTH,
} from "@/lib/rosterEntry";
import { ANSWER_MAX_LENGTH, isOrderFormClosed } from "@/lib/orderFormResponse";
import { sortSizes } from "@/lib/orderForm";
import { userMessage } from "@/lib/userMessage";
import { SizeCounter } from "@/components/orderList/SizeCounter";
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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

// The form's view of a design the fan can order under, plus the seeded
// roster slots that back the fixed-mode name picker.
type PublicDesign = {
  _id: Id<"designs">;
  title: string;
  roster: { _id: Id<"rosterEntries">; name: string; number?: string }[];
};

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

type LineValues = {
  designId: string;
  name: string;
  number: string;
  rosterEntryId: string;
  size: string;
  qty: string;
};

type FormValues = {
  submitterName: string;
  submitterEmail: string;
  customAnswers: Record<string, string>;
  lines: LineValues[];
};

function emptyLine(designs: PublicDesign[]): LineValues {
  return {
    // A single-design order collapses the picker — preselect that design
    // so the fan never has to choose.
    designId: designs.length === 1 ? designs[0]._id : "",
    name: "",
    number: "",
    rosterEntryId: "",
    size: "",
    qty: "1",
  };
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
      lines: z
        .array(
          z.object({
            designId: z.string(),
            name: z.string(),
            number: z.string(),
            rosterEntryId: z.string(),
            size: z.string(),
            qty: z.string(),
          }),
        )
        .min(1, "Add at least one jersey."),
    })
    .superRefine((data, ctx) => {
      data.lines.forEach((line, i) => {
        if (!designIds.has(line.designId)) {
          ctx.addIssue({
            code: "custom",
            path: ["lines", i, "designId"],
            message: "Pick a design.",
          });
        }

        if (!run.sizeOptions.includes(line.size)) {
          ctx.addIssue({
            code: "custom",
            path: ["lines", i, "size"],
            message: "Pick a size.",
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

        if (run.namesMode === "fixed") {
          const slots = rosterByDesign.get(line.designId);
          if (!line.rosterEntryId || !slots?.has(line.rosterEntryId)) {
            ctx.addIssue({
              code: "custom",
              path: ["lines", i, "rosterEntryId"],
              message: "Pick a name from the list.",
            });
          }
        } else {
          if (line.name.trim().length > ROSTER_NAME_MAX_LENGTH) {
            ctx.addIssue({
              code: "custom",
              path: ["lines", i, "name"],
              message: `Keep the name under ${ROSTER_NAME_MAX_LENGTH} characters.`,
            });
          }
          if (line.number.trim().length > ROSTER_NUMBER_MAX_LENGTH) {
            ctx.addIssue({
              code: "custom",
              path: ["lines", i, "number"],
              message: `Keep the number under ${ROSTER_NUMBER_MAX_LENGTH} characters.`,
            });
          }
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
      // Fixed mode builds its lines from the roster grid (starts empty);
      // open mode seeds one blank line for the fan to fill in.
      lines: run.namesMode === "fixed" ? [] : [emptyLine(designs)],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  // Fixed mode reads live line quantities to render its per-slot counters
  // and the header tally. Each (roster slot × size) the fan picks is one
  // line; clicking a size bumps that line's qty, decrementing trims it.
  const watchedLines =
    useWatch({ control: form.control, name: "lines" }) ?? [];

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
      append({ designId, name: "", number: "", rosterEntryId, size, qty: "1" });
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
        lines: values.lines.map((line) => {
          const qty = Number.parseInt(line.qty.trim(), 10);
          if (run.namesMode === "fixed") {
            return {
              designId: line.designId as Id<"designs">,
              rosterEntryId: line.rosterEntryId as Id<"rosterEntries">,
              size: line.size,
              qty,
            };
          }
          return {
            designId: line.designId as Id<"designs">,
            name: line.name.trim() || undefined,
            number: line.number.trim() || undefined,
            size: line.size,
            qty,
          };
        }),
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
      values.lines.some(
        (l) => l.name.trim().length === 0 && l.number.trim().length === 0,
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
  const linesError = form.formState.errors.lines?.message;
  const singleDesign = designs.length === 1;

  // Open mode counts line cards; fixed mode counts total jerseys (Σ qty
  // across the slots the fan has picked) since one slot can take several.
  const jerseyCount =
    run.namesMode === "fixed"
      ? watchedLines.reduce(
          (sum, l) => sum + (Number.parseInt(l.qty, 10) || 0),
          0,
        )
      : fields.length;

  return (
    <>
      <Header teamName={teamName} captainName={captainName} run={run} />

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
                  <Input type="email" autoComplete="email" {...field} />
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
              <RosterGrid
                run={run}
                designs={designs}
                singleDesign={singleDesign}
                lines={watchedLines}
                onAdd={addSize}
                onRemove={removeSize}
              />
            ) : (
              <>
                {fields.map((fieldItem, index) => (
                  <JerseyLine
                    key={fieldItem.id}
                    control={form.control}
                    index={index}
                    designs={designs}
                    run={run}
                    singleDesign={singleDesign}
                    removable={fields.length > 1}
                    onRemove={() => remove(index)}
                  />
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => append(emptyLine(designs))}
                >
                  <PlusIcon aria-hidden className="h-4 w-4" />
                  Add another jersey
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
            <Button type="submit" disabled={busy} data-submit-mode="final">
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

// One open-mode jersey line: design (when the order has more than one),
// free-text name/number, size, and quantity. Fixed-mode runs render the
// roster grid (below) instead of these cards.
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

  return (
    <fieldset
      aria-label={`Jersey ${index + 1}`}
      className="space-y-5 rounded-xl border border-border bg-muted/30 p-5"
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
          name={`lines.${index}.designId`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Design
                <RequiredMark />
              </FormLabel>
              <Select
                value={field.value}
                onValueChange={(value) => field.onChange(value)}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick a design…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {designs.map((d) => (
                    <SelectItem key={d._id} value={d._id}>
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
        <FormField
          control={control}
          name={`lines.${index}.name`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name on jersey</FormLabel>
              <FormDescription>Leave blank for no name.</FormDescription>
              <FormControl>
                <Input maxLength={ROSTER_NAME_MAX_LENGTH} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`lines.${index}.number`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number</FormLabel>
              <FormDescription>Leave blank for none.</FormDescription>
              <FormControl>
                <Input
                  inputMode="numeric"
                  maxLength={ROSTER_NUMBER_MAX_LENGTH}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name={`lines.${index}.size`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Size
              <RequiredMark />
            </FormLabel>
            <FormControl>
              <RadioGroup
                value={field.value}
                onValueChange={(value) => field.onChange(value)}
                className="flex flex-wrap gap-2"
              >
                {sizes.map((size) => (
                  <SizeOption key={size} value={size} />
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={`lines.${index}.qty`}
        render={({ field }) => (
          <FormItem className="sm:max-w-[140px]">
            <FormLabel>
              Quantity
              <RequiredMark />
            </FormLabel>
            <FormControl>
              <Input type="number" inputMode="numeric" min={1} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </fieldset>
  );
}

// Fixed-mode order editor: the captain's roster, one row per slot, with a
// tappable counter per size. There's no free-text entry — every jersey is
// tied to a pre-seeded name. Each (slot × size) the fan picks maps to one
// line in the shared `lines` model, so submit reuses the open-mode path.
function RosterGrid({
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

  const qtyFor = (rosterEntryId: string, size: string) => {
    const line = lines.find(
      (l) => l.rosterEntryId === rosterEntryId && l.size === size,
    );
    if (!line) return 0;
    const n = Number.parseInt(line.qty, 10);
    return Number.isFinite(n) ? n : 0;
  };

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
        <fieldset
          key={design._id}
          aria-label={design.title}
          className="space-y-4 rounded-xl border border-border bg-muted/30 p-5"
        >
          {!singleDesign && (
            <legend className="text-sm font-semibold text-foreground">
              {design.title}
            </legend>
          )}

          {design.roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No names for this design yet.
            </p>
          ) : (
            <ul className="space-y-4">
              {design.roster.map((slot) => (
                <li
                  key={slot._id}
                  className="flex flex-col gap-3 border-b border-border/60 pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="font-medium text-foreground">
                      {slot.name}
                    </span>
                    {slot.number ? (
                      <span className="text-muted-foreground">
                        #{slot.number}
                      </span>
                    ) : null}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((size) => (
                      <SizeCounter
                        key={size}
                        size={size}
                        playerName={slot.name}
                        qty={qtyFor(slot._id, size)}
                        onAdd={() => onAdd(design._id, slot._id, size)}
                        onRemove={() => onRemove(slot._id, size)}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      ))}
    </div>
  );
}

function SizeOption({ value }: { value: string }) {
  return (
    <label className="flex cursor-pointer items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-ring has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/10 has-[[data-checked]]:text-primary">
      <RadioGroupItem value={value} className="sr-only" />
      {value}
    </label>
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

function Header({
  teamName,
  captainName,
  run,
}: {
  teamName: string;
  captainName: string;
  run: PublicRun;
}) {
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
