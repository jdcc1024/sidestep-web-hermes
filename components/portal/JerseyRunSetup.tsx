"use client";

import Link from "next/link";
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
  NAMES_MODES,
  QUESTION_LABEL_MAX_LENGTH,
  SIZE_OPTIONS,
  newQuestionId,
  parseDeadline,
  toJerseyRunPayload,
  type NamesMode,
} from "@/lib/jerseyRun";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// Colocated zod schema. Constants reused from lib/jerseyRun.ts so the
// client and server cap values the same way (the Convex mutation enforces
// matching limits server-side). Fixed-mode named slots are seeded from the
// order page's design cards (RosterSheet, M-02), not here, so the setup
// form never collects a roster. superRefine only handles the per-question
// label rules that depend on the whole array.
const formSchema = z
  .object({
    sizeOptions: z
      .array(z.enum(SIZE_OPTIONS))
      .min(1, "Pick at least one size."),
    namesMode: z.enum(NAMES_MODES, {
      message: "Choose how names will be collected.",
    }),
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

export function JerseyRunSetup({ orderId }: { orderId: Id<"orders"> }) {
  const run = useQuery(api.jerseyRuns.getByOrder, { orderId });

  if (run === undefined) return <LoadingSkeleton />;
  if (run === null) return <JerseyRunForm orderId={orderId} />;

  return <JerseyRunSummary run={run} orderId={orderId} />;
}

function JerseyRunForm({ orderId }: { orderId: Id<"orders"> }) {
  const createRun = useMutation(api.jerseyRuns.create);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sizeOptions: [],
      // namesMode starts unselected. zod rejects undefined with the
      // "Choose how names will be collected." message above, so the cast
      // just satisfies the typed RadioGroup binding.
      namesMode: undefined as unknown as NamesMode,
      customQuestions: [],
      deadline: "",
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
      await createRun({
        orderId,
        sizeOptions: payload.sizeOptions,
        namesMode: payload.namesMode,
        customQuestions: payload.customQuestions,
        deadline: payload.deadline,
      });
      toast.success("Jersey run created", {
        description: "Share the link with your team to collect submissions.",
      });
      // Convex query is reactive — the summary view swaps in automatically
      // once the run document appears.
    } catch (err) {
      toast.error("Could not save jersey run", {
        description:
          err instanceof Error
            ? err.message
            : "Please try again in a moment.",
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
          name="sizeOptions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Jersey sizes</FormLabel>
              <FormDescription>
                Pick every size your team might need.
              </FormDescription>
              <FormControl>
                <div className="flex flex-wrap gap-x-5 gap-y-3 pt-1">
                  {SIZE_OPTIONS.map((size) => {
                    const checked = field.value.includes(size);
                    return (
                      <label
                        key={size}
                        className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            field.onChange(
                              next
                                ? [...field.value, size]
                                : field.value.filter((v) => v !== size),
                            );
                          }}
                        />
                        {size}
                      </label>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="namesMode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Names &amp; numbers</FormLabel>
              <FormDescription>
                Choose how each fan picks their name on the form.
              </FormDescription>
              <FormControl>
                <RadioGroup
                  value={field.value ?? ""}
                  onValueChange={(value) => field.onChange(value)}
                  className="grid gap-2 pt-1 sm:grid-cols-2"
                >
                  <ModeOption
                    value="open"
                    title="Open"
                    description="Each fan types their own name and number."
                  />
                  <ModeOption
                    value="fixed"
                    title="Fixed roster"
                    description="You pre-define names; fans pick from a list."
                  />
                </RadioGroup>
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
                Ask up to {MAX_CUSTOM_QUESTIONS} extra questions (e.g. &ldquo;How should we
                deliver?&rdquo;).
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
                        className="grid grid-cols-[1fr_auto_auto_auto] gap-2"
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
                                {...field}
                              />
                            </FormControl>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
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
                  size="sm"
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

        <FormField
          control={form.control}
          name="deadline"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deadline</FormLabel>
              <FormDescription>
                Submissions close at the end of this day.
              </FormDescription>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            You&apos;ll get a shareable link to send to your team.
          </p>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Create jersey run"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ModeOption({
  value,
  title,
  description,
}: {
  value: NamesMode;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-background p-4 transition hover:border-ring has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function JerseyRunSummary({
  run,
  orderId,
}: {
  run: {
    _id: Id<"jerseyRuns">;
    sizeOptions: string[];
    namesMode: "open" | "fixed";
    customQuestions: { id: string; label: string }[];
    deadline: number;
  };
  orderId: Id<"orders">;
}) {
  const shareUrl = useShareUrl(`/run/${run._id}`);
  return (
    <div className="space-y-6">
      <ShareLink url={shareUrl} />

      <Link
        href={`/portal/orders/${orderId}/run/responses`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        View responses →
      </Link>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <SummaryField label="Sizes" value={run.sizeOptions.join(", ")} />
        <SummaryField
          label="Names mode"
          value={run.namesMode === "fixed" ? "Fixed roster" : "Open"}
        />
        <SummaryField
          label="Deadline"
          value={new Date(run.deadline).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        />
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

      <Separator />

      {/* Roster seeding moved to the order page's design cards (M-02) —
          this surface is the collection campaign, not the team list. */}
      <Link
        href={`/portal/orders/${orderId}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        Manage rosters on your order page →
      </Link>

      {run.customQuestions.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Custom questions
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-foreground">
            {run.customQuestions.map((q) => (
              <li key={q.id}>{q.label}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// Builds the absolute URL on the client only — window is unavailable
// during SSR, and a relative path is meaningless to paste into a chat.
function useShareUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

function ShareLink({ url }: { url: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      // Older browsers without the async clipboard API — select the
      // input so the user can copy manually with Ctrl+C.
      const input = document.getElementById(
        "jersey-run-share-link",
      ) as HTMLInputElement | null;
      input?.select();
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Shareable link
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Label htmlFor="jersey-run-share-link" className="sr-only">
            Shareable link
          </Label>
          <Input
            id="jersey-run-share-link"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1"
          />
          <Button type="button" onClick={copy}>
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
