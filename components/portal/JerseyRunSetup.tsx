"use client";

import Link from "next/link";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAX_CUSTOM_QUESTIONS,
  QUESTION_LABEL_MAX_LENGTH,
  newQuestionId,
  parseDeadline,
  toJerseyRunPayload,
  type NamesMode,
} from "@/lib/jerseyRun";
import { userMessage } from "@/lib/userMessage";
import { absoluteUrl, copyLink } from "@/components/portal/CopyLinkButton";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Form settings (a "run" in code). The order form is made from the order page
// ("Make an order form", deadline only); sizes are a fixed catalog nobody is
// asked about. What's managed here is the form itself: the share link, the
// deadline, the custom questions it asks, and names mode (moved here from the
// order page in L-05). What players send lands on the order list, so there is
// no responses view. No lock control — R-08 stays parked (PRD §5).

// Colocated zod schema. Constants reused from lib/jerseyRun so the client and
// server cap values the same way (jerseyRuns.updateSettings enforces matching
// limits server-side). superRefine handles the per-question label rules that
// depend on the whole array.
const formSchema = z
  .object({
    customQuestions: z.array(
      z.object({ id: z.string(), label: z.string() }),
    ),
    deadline: z
      .string()
      .min(1, "Pick a deadline date.")
      .refine((value) => parseDeadline(value) !== null, "Pick a valid deadline.")
      .refine((value) => {
        const ms = parseDeadline(value);
        return ms === null || ms >= Date.now();
      }, "Deadline must be in the future."),
  })
  .superRefine((data, ctx) => {
    if (data.customQuestions.length > MAX_CUSTOM_QUESTIONS) {
      ctx.addIssue({
        code: "custom",
        path: ["customQuestions"],
        message: `Up to ${MAX_CUSTOM_QUESTIONS} custom questions.`,
      });
    } else if (
      data.customQuestions.some((q) => q.label.trim().length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["customQuestions"],
        message: "Every question needs a label.",
      });
    } else if (
      data.customQuestions.some(
        (q) => q.label.trim().length > QUESTION_LABEL_MAX_LENGTH,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["customQuestions"],
        message: `Keep each question under ${QUESTION_LABEL_MAX_LENGTH} characters.`,
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

type ManagedRun = {
  _id: Id<"jerseyRuns">;
  customQuestions: { id: string; label: string }[];
  deadline: number;
  namesMode: NamesMode;
  effectiveStatus: "open" | "closed" | "locked";
};

export function JerseyRunSetup({ orderId }: { orderId: Id<"orders"> }) {
  const run = useQuery(api.jerseyRuns.getByOrder, { orderId });

  if (run === undefined) return <LoadingSkeleton />;
  if (run === null) return <NoRunYet orderId={orderId} />;

  return <RunManagement run={run} />;
}

// Reachable by typing the URL before making a form — the order page is the
// only place one is made, and making one implicitly from here is exactly
// what M-05 removed.
function NoRunYet({ orderId }: { orderId: Id<"orders"> }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/40 px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">
        You haven&apos;t made an order form yet
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Make one from your order page and we&apos;ll give you a link to share.
        Then come back here to change its settings.
      </p>
      <Link
        href={`/portal/orders/${orderId}`}
        className={cn(
          buttonVariants(),
          "mt-4 h-10 bg-teal-600 px-3.5 font-semibold text-white hover:bg-teal-700",
        )}
      >
        Back to your order
      </Link>
    </div>
  );
}

function RunManagement({ run }: { run: ManagedRun }) {
  const open = run.effectiveStatus === "open";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className={cn(
            "border-transparent",
            open
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
              : "bg-muted text-muted-foreground",
          )}
        >
          {open ? "Open" : "Closed"}
        </Badge>
      </div>

      {open && <ShareLink path={`/run/${run._id}`} />}

      <NamesModeSetting run={run} />

      <Separator />

      {open ? <RunSettingsForm run={run} /> : <LockedSummary run={run} />}
    </div>
  );
}

// How the public form asks for names (M-05). Saves on change, apart from the
// deadline/questions form: it's one choice, and in fixed mode the names on
// each design in the order list *are* what players pick from. Switches
// freely in both directions with no confirmation: player-typed names are
// already items on the list, so open → fixed puts them in the picker and
// fixed → open only loosens a constraint. Neither loses data (PRD §6). A
// closed form rejects every write, so it only says what was chosen.
//
// Native radios, not the Base UI group: a wrapping <label> names a native
// input reliably, and the choice is a plain two-way pick.
function NamesModeSetting({ run }: { run: ManagedRun }) {
  const setNamesMode = useMutation(api.jerseyRuns.setNamesMode);
  // The choice shows as soon as it's made; the query catches up when the
  // mutation lands, and a rejected save falls back to the stored mode.
  const [pending, setPending] = useState<NamesMode | null>(null);
  const selected = pending ?? run.namesMode;
  const editable = run.effectiveStatus === "open";

  async function onChange(next: NamesMode) {
    if (next === selected) return;
    setPending(next);
    try {
      await setNamesMode({ jerseyRunId: run._id, namesMode: next });
    } catch (err) {
      toast.error("Could not change how players add their name", {
        description: userMessage(err, "Please try again."),
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-sm font-medium text-foreground">
        Names and numbers
      </legend>
      {editable ? (
        <>
          <p className="text-sm text-muted-foreground">
            How players fill in their name on the form. Switch any time,
            nothing on your list is lost either way.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {NAMES_MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex min-h-10 cursor-pointer items-start gap-3 rounded-md border border-input bg-background p-4 transition-colors hover:border-ring has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="names-mode"
                  value={option.value}
                  checked={selected === option.value}
                  onChange={() => void onChange(option.value)}
                  className="mt-0.5 size-4 shrink-0 accent-teal-600"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-foreground">
          {NAMES_MODE_OPTIONS.find((o) => o.value === run.namesMode)?.label}
        </p>
      )}
    </fieldset>
  );
}

const NAMES_MODE_OPTIONS: { value: NamesMode; label: string; hint: string }[] =
  [
    {
      value: "open",
      label: "Players type their own name and number",
      hint: "Good when you don't have a team list yet.",
    },
    {
      value: "fixed",
      label: "Players pick their name from your list",
      hint: "They choose from the names on each design in your order list.",
    },
  ];

// A closed form rejects every edit server-side, so the form gives way to
// what it was holding. Read-only, not disabled inputs: there's nothing to
// type into and pretending otherwise invites a rejected save.
function LockedSummary({ run }: { run: ManagedRun }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This order form is closed, so its settings can&apos;t change. Need a
        change? Email us at{" "}
        <a
          href="mailto:info@sidestep.design"
          className="font-medium text-teal-700 underline underline-offset-4 hover:text-teal-800 focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:text-teal-300 dark:hover:text-teal-200"
        >
          info@sidestep.design
        </a>
        .
      </p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <SummaryField label="Deadline" value={formatDeadline(run.deadline)} />
        <SummaryField
          label="Custom questions"
          value={
            run.customQuestions.length === 0
              ? "None"
              : `${run.customQuestions.length} question${
                  run.customQuestions.length === 1 ? "" : "s"
                }`
          }
        />
      </dl>
      {run.customQuestions.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
          {run.customQuestions.map((q) => (
            <li key={q.id}>{q.label}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RunSettingsForm({ run }: { run: ManagedRun }) {
  const updateSettings = useMutation(api.jerseyRuns.updateSettings);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customQuestions: run.customQuestions,
      deadline: toDateInput(run.deadline),
    },
  });

  const customQuestions = useWatch({
    control: form.control,
    name: "customQuestions",
  });

  const questionsArray = useFieldArray({
    control: form.control,
    name: "customQuestions",
    keyName: "key",
  });

  async function onSubmit(values: FormValues) {
    try {
      const payload = toJerseyRunPayload(values);
      await updateSettings({
        jerseyRunId: run._id,
        customQuestions: payload.customQuestions,
        deadline: payload.deadline,
      });
      toast.success("Form settings saved");
    } catch (err) {
      toast.error("Could not save your changes", {
        description: userMessage(err, "Please try again in a moment."),
      });
    }
  }

  const isSubmitting = form.formState.isSubmitting;
  const atQuestionLimit = customQuestions.length >= MAX_CUSTOM_QUESTIONS;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="space-y-8"
        aria-busy={isSubmitting}
      >
        <FormField
          control={form.control}
          name="deadline"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deadline</FormLabel>
              <FormDescription>
                The form closes at the end of this day.
              </FormDescription>
              <FormControl>
                <Input type="date" className="h-10" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="customQuestions"
          render={() => (
            <FormItem>
              <FormLabel>Custom questions</FormLabel>
              <FormDescription>
                Ask up to {MAX_CUSTOM_QUESTIONS}{" "}
                extra questions (e.g. &ldquo;How should we deliver?&rdquo;).
              </FormDescription>
              <div className="space-y-2">
                {questionsArray.fields.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-4 text-center text-sm text-muted-foreground">
                    No custom questions.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {questionsArray.fields.map((row, index) => (
                      <li
                        key={row.key}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1 sm:gap-2"
                      >
                        <FormField
                          control={form.control}
                          name={`customQuestions.${index}.label`}
                          render={({ field }) => (
                            <FormControl>
                              <Input
                                placeholder="What do you want to ask?"
                                maxLength={QUESTION_LABEL_MAX_LENGTH}
                                aria-label={`Question ${index + 1}`}
                                className="h-10"
                                {...field}
                              />
                            </FormControl>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-10"
                          disabled={index === 0}
                          onClick={() => questionsArray.swap(index, index - 1)}
                          aria-label={`Move question ${index + 1} up`}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-10"
                          disabled={index === questionsArray.fields.length - 1}
                          onClick={() => questionsArray.swap(index, index + 1)}
                          aria-label={`Move question ${index + 1} down`}
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-10"
                          onClick={() => questionsArray.remove(index)}
                          aria-label={`Remove question ${index + 1}`}
                        >
                          <XIcon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={atQuestionLimit}
                  onClick={() =>
                    questionsArray.append({
                      id: newQuestionId(),
                      label: "",
                    })
                  }
                >
                  <PlusIcon />
                  Add question
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Changes apply to everyone who opens your link from now on.
          </p>
          <Button type="submit" className="h-10" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ShareLink({ path }: { path: string }) {
  // Selecting the input is the fallback for browsers without the async
  // clipboard API: the captain copies it with Ctrl+C.
  function selectInput() {
    const input = document.getElementById(
      "order-form-share-link",
    ) as HTMLInputElement | null;
    input?.select();
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Link to share
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Label htmlFor="order-form-share-link" className="sr-only">
            Link to share
          </Label>
          <Input
            id="order-form-share-link"
            readOnly
            value={absoluteUrl(path)}
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 min-w-0 flex-1"
          />
          <Button
            type="button"
            className="h-10"
            onClick={() => void copyLink(path, selectInput)}
          >
            Copy link
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-2/3" />
    </div>
  );
}

// Deadlines are stored as an end-of-day UTC timestamp (parseDeadline), so
// the date input has to read them back in UTC or a captain west of Greenwich
// sees yesterday.
function toDateInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function formatDeadline(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
