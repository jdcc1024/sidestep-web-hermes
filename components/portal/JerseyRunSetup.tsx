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
  QUESTION_LABEL_MAX_LENGTH,
  newQuestionId,
  parseDeadline,
  toJerseyRunPayload,
} from "@/lib/jerseyRun";
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

// Run Setup is management-only since M-05. The run is created from the order
// page ("Start collecting", deadline only); sizes are a fixed catalog nobody
// is asked about, and names mode moved next to the designs it affects. What's
// left here is genuinely the collection campaign: the share link, the
// deadline, the custom questions the fan form asks, and where to read the
// responses. No lock control — R-08 stays parked (PRD §5).

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
  effectiveStatus: "open" | "closed" | "locked";
};

export function JerseyRunSetup({ orderId }: { orderId: Id<"orders"> }) {
  const run = useQuery(api.jerseyRuns.getByOrder, { orderId });

  if (run === undefined) return <LoadingSkeleton />;
  if (run === null) return <NoRunYet orderId={orderId} />;

  return <RunManagement run={run} orderId={orderId} />;
}

// Reachable by typing the URL before starting a run — the order page is the
// only place a run is created now, and creating one implicitly from here is
// exactly what M-05 removed.
function NoRunYet({ orderId }: { orderId: Id<"orders"> }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/40 px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">
        You haven&apos;t started collecting yet
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Pick a deadline on your order page and we&apos;ll create the shareable
        link — then come back here to manage it.
      </p>
      <Link
        href={`/portal/orders/${orderId}`}
        className={cn(
          buttonVariants({ size: "sm" }),
          "mt-4 bg-teal-600 font-semibold text-white hover:bg-teal-700",
        )}
      >
        Back to your order
      </Link>
    </div>
  );
}

const RUN_STATUS_LABEL: Record<ManagedRun["effectiveStatus"], string> = {
  open: "Collecting",
  closed: "Collection closed",
  locked: "Roster locked",
};

function RunManagement({
  run,
  orderId,
}: {
  run: ManagedRun;
  orderId: Id<"orders">;
}) {
  const shareUrl = useShareUrl(`/run/${run._id}`);
  const locked = run.effectiveStatus !== "open";

  return (
    <div className="space-y-6">
      <ShareLink url={shareUrl} />

      <div className="flex flex-wrap items-center gap-3">
        <Badge
          className={cn(
            "border-transparent",
            run.effectiveStatus === "open"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
              : "bg-muted text-muted-foreground",
          )}
        >
          {RUN_STATUS_LABEL[run.effectiveStatus]}
        </Badge>
        <Link
          href={`/portal/orders/${orderId}/run/responses`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          View responses →
        </Link>
        {/* Roster seeding and the names-mode switch live on the order page's
            design cards (M-02, M-05) — this surface is the collection
            campaign, not the team list. */}
        <Link
          href={`/portal/orders/${orderId}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Manage rosters →
        </Link>
      </div>

      <Separator />

      {locked ? (
        <LockedSummary run={run} />
      ) : (
        <RunSettingsForm run={run} />
      )}
    </div>
  );
}

// A closed or locked run rejects every edit server-side, so the form gives
// way to what it was holding. Read-only, not disabled inputs: there's nothing
// to type into and pretending otherwise invites a rejected save.
function LockedSummary({ run }: { run: ManagedRun }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This run is no longer collecting, so its settings are frozen. Contact
        Sidestep if something needs to change.
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
      toast.success("Run updated");
    } catch (err) {
      toast.error("Could not save your changes", {
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
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
                Submissions close at the end of this day.
              </FormDescription>
              <FormControl>
                <Input type="date" {...field} />
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

        <Separator />

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Changes apply to everyone who opens your link from now on.
          </p>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
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
