"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CheckIcon } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  BRIEF_MAX_LENGTH,
  DESIGN_PREFERENCES,
  MIN_QUANTITY,
  QUESTIONS_MAX_LENGTH,
  USAGE_CONTEXTS,
  parseDeadlineToMs,
  toIntakePayload,
  type DesignPreference,
} from "@/lib/intake";
import { Button } from "@/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const NAME_MAX = 200;
const TEAM_MAX = 200;
const SPORT_MAX = 200;
const PHONE_MAX = 40;

// Matches the EMAIL_PATTERN in lib/intake.ts and convex/intakes.ts — three
// places need to agree on what we accept or the server will reject what the
// client just let through.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const designOptions: Array<{
  value: DesignPreference;
  label: string;
  hint: string;
}> = [
  {
    value: "own-design",
    label: "I have my own design",
    hint: "Upload comes later — we just need to know.",
  },
  {
    value: "needs-help",
    label: "I need help designing",
    hint: "We'll work with you from a brief or mood board.",
  },
  {
    value: "undecided",
    label: "Still figuring it out",
    hint: "That's fine — we'll talk it through.",
  },
];

const usageOptions: Array<{
  value: (typeof USAGE_CONTEXTS)[number];
  label: string;
  hint: string;
}> = [
  {
    value: "event",
    label: "One-time event",
    hint: "Tournament, charity match, jam, etc.",
  },
  {
    value: "league",
    label: "Ongoing league or season",
    hint: "Recurring schedule across weeks or months.",
  },
];

// Colocated zod schema. Constants reused from lib/intake.ts so the client
// and Convex submitIntake mutation agree on caps and patterns. The deadline
// refine combines parse + past-date checks into one message to keep the
// form simple — the lib helper does both jobs.
const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please share your name.")
    .max(NAME_MAX, `Please keep your name under ${NAME_MAX} characters.`),
  teamName: z
    .string()
    .trim()
    .min(1, "Tell us your team or organization name.")
    .max(
      TEAM_MAX,
      `Please keep the team name under ${TEAM_MAX} characters.`,
    ),
  email: z
    .string()
    .refine((v) => v.trim().length > 0, "We need an email to follow up.")
    .refine(
      (v) => EMAIL_PATTERN.test(v.trim()),
      "That email doesn't look right.",
    ),
  phone: z
    .string()
    .max(PHONE_MAX, `Please keep this under ${PHONE_MAX} characters.`),
  sport: z
    .string()
    .trim()
    .min(1, "Let us know the sport or activity.")
    .max(SPORT_MAX, `Please keep this under ${SPORT_MAX} characters.`),
  estimatedQuantity: z.string().refine((value) => {
    const n = Number.parseInt(value.trim(), 10);
    return Number.isFinite(n) && n >= MIN_QUANTITY;
  }, `Our minimum order is ${MIN_QUANTITY} jerseys.`),
  designPreference: z.enum(DESIGN_PREFERENCES, {
    message: "Pick the option that fits best.",
  }),
  usageContext: z.array(z.enum(USAGE_CONTEXTS)),
  deadline: z.string().refine((value) => {
    const trimmed = value.trim();
    if (!trimmed) return true;
    const ts = parseDeadlineToMs(trimmed);
    if (ts === null) return false;
    return ts >= startOfTodayUtcMs();
  }, "Pick a valid date today or later."),
  brief: z
    .string()
    .trim()
    .min(1, "Tell us a bit about your team.")
    .max(
      BRIEF_MAX_LENGTH,
      `Please keep this under ${BRIEF_MAX_LENGTH} characters.`,
    ),
  questions: z
    .string()
    .max(
      QUESTIONS_MAX_LENGTH,
      `Please keep this under ${QUESTIONS_MAX_LENGTH} characters.`,
    ),
});

type FormValues = z.infer<typeof formSchema>;

function startOfTodayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function useInitialQty(): string {
  const searchParams = useSearchParams();
  const raw = searchParams.get("qty");
  if (!raw) return "10";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? String(n) : "10";
}

export function IntakeForm() {
  const submitIntake = useMutation(api.intakes.submitIntake);
  const [submitted, setSubmitted] = useState(false);
  const initialQty = useInitialQty();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      teamName: "",
      email: "",
      phone: "",
      sport: "",
      estimatedQuantity: initialQty,
      // designPreference starts unselected. zod rejects undefined with the
      // "Pick the option that fits best." message; the cast satisfies the
      // typed RadioGroup binding.
      designPreference: undefined as unknown as DesignPreference,
      usageContext: [],
      deadline: "",
      brief: "",
      questions: "",
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      const payload = toIntakePayload({
        name: values.name,
        teamName: values.teamName,
        email: values.email,
        phone: values.phone,
        sport: values.sport,
        estimatedQuantity: values.estimatedQuantity,
        designPreference: values.designPreference,
        usageContext: values.usageContext,
        deadline: values.deadline,
        brief: values.brief,
        questions: values.questions,
        newsletterOptIn: false,
      });
      await submitIntake(payload);
      setSubmitted(true);
      toast.success("Inquiry sent", {
        description: "We'll be in touch within one business day.",
      });
    } catch (err) {
      toast.error("Could not send your inquiry", {
        description:
          err instanceof Error
            ? err.message
            : "Please try again in a moment.",
      });
    }
  }

  if (submitted) return <SuccessState />;

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="space-y-12"
        aria-busy={isSubmitting}
      >
        <FieldSection
          eyebrow="01"
          title="About you"
          description="So we know how to reach you."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="teamName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team or organization</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="organization"
                      placeholder="Sidestep Sports"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@team.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormDescription>Optional</FormDescription>
                  <FormControl>
                    <Input
                      type="tel"
                      autoComplete="tel"
                      placeholder="604 555 0144"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FieldSection>

        <FieldSection
          eyebrow="02"
          title="Your project"
          description="The basics we need to give you a real quote."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="sport"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sport or activity</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ultimate Frisbee, Hockey, Bowling…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="estimatedQuantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated jersey count</FormLabel>
                  <FormDescription>
                    Minimum {MIN_QUANTITY}.
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={MIN_QUANTITY}
                      step={1}
                      placeholder={String(MIN_QUANTITY)}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="designPreference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Where are you with design?</FormLabel>
                <FormControl>
                  <RadioGroup
                    value={field.value ?? ""}
                    onValueChange={(value) => field.onChange(value)}
                    className="grid gap-3 sm:grid-cols-3"
                  >
                    {designOptions.map((opt) => (
                      <ChoiceCard
                        key={opt.value}
                        value={opt.value}
                        label={opt.label}
                        hint={opt.hint}
                      />
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="usageContext"
            render={({ field }) => (
              <FormItem>
                <FormLabel>What&apos;s this for?</FormLabel>
                <FormDescription>Pick any that apply.</FormDescription>
                <FormControl>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {usageOptions.map((opt) => {
                      const checked = field.value.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-background p-4 transition hover:border-ring has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => {
                              field.onChange(
                                next
                                  ? [...field.value, opt.value]
                                  : field.value.filter((v) => v !== opt.value),
                              );
                            }}
                            className="mt-0.5"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-foreground">
                              {opt.label}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {opt.hint}
                            </span>
                          </span>
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
            name="deadline"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deadline or key date</FormLabel>
                <FormDescription>
                  Optional — when do you need these in hand?
                </FormDescription>
                <FormControl>
                  <Input type="date" min={todayIso()} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FieldSection>

        <FieldSection
          eyebrow="03"
          title="Anything else"
          description="Help us start the conversation off right."
        >
          <FormField
            control={form.control}
            name="brief"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tell us about your team and inspiration</FormLabel>
                <FormControl>
                  <Textarea
                    rows={5}
                    maxLength={BRIEF_MAX_LENGTH}
                    placeholder="Theme, history, vibe, colors you love, jerseys you admire…"
                    {...field}
                  />
                </FormControl>
                <CharacterCounter
                  control={form.control}
                  name="brief"
                  max={BRIEF_MAX_LENGTH}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="questions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Questions or concerns</FormLabel>
                <FormDescription>
                  Optional — anything you want us to know up front.
                </FormDescription>
                <FormControl>
                  <Textarea
                    rows={3}
                    maxLength={QUESTIONS_MAX_LENGTH}
                    {...field}
                  />
                </FormControl>
                <CharacterCounter
                  control={form.control}
                  name="questions"
                  max={QUESTIONS_MAX_LENGTH}
                />
                <FormMessage />
              </FormItem>
            )}
          />

        </FieldSection>

        <Separator />

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send my inquiry"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ChoiceCard({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-background p-4 transition hover:border-ring has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function CharacterCounter({
  control,
  name,
  max,
}: {
  control: ReturnType<typeof useForm<FormValues>>["control"];
  name: "brief" | "questions";
  max: number;
}) {
  const value = useWatch({ control, name }) ?? "";
  const remaining = Math.max(0, max - value.length);
  return (
    <p className="text-right text-xs text-muted-foreground">
      {remaining} characters left
    </p>
  );
}

function SuccessState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-primary/30 bg-primary/5 p-10 text-center"
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <CheckIcon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold text-foreground">
        Thanks — we&apos;ve got it.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-muted-foreground">
        We&apos;ll be in touch within one business day with ideas and a quote.
        Keep an eye on your inbox.
      </p>
    </div>
  );
}

function FieldSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-8 md:grid-cols-[200px_1fr]">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Step {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}
