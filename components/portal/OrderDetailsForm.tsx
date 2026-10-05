"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Lock, Loader2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  SPORT_MAX_LENGTH,
  TEAM_NAME_MAX_LENGTH,
  linkedDesignCount,
  orderMilestones,
  toOrderPayload,
  type OrderMilestone,
} from "@/lib/order";
import { pendingDesignRemovals } from "@/lib/designRemoval";
import { userMessage } from "@/lib/userMessage";
import { cn } from "@/lib/utils";
import { DesignRemovalWarning } from "@/components/portal/DesignRemoval";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";

// Colocated zod schema. Field-level rules match the constants and error
// messages in lib/order.ts so client and server (convex/orders.ts) reject
// the same inputs with the same wording. estimatedQuantity stays a string
// so the empty default doesn't immediately read as invalid — refines do
// the numeric work.
const formSchema = z.object({
  teamName: z
    .string()
    .trim()
    .min(1, "Give your team a name.")
    .max(
      TEAM_NAME_MAX_LENGTH,
      `Please keep the team name under ${TEAM_NAME_MAX_LENGTH} characters.`,
    ),
  sport: z
    .string()
    .trim()
    .min(1, "What sport or activity is this for?")
    .max(
      SPORT_MAX_LENGTH,
      `Please keep this under ${SPORT_MAX_LENGTH} characters.`,
    ),
  estimatedQuantity: z
    .string()
    .refine((value) => {
      const n = Number.parseInt(value.trim(), 10);
      return Number.isFinite(n) && n >= MIN_QUANTITY;
    }, `Order at least ${MIN_QUANTITY} jersey.`)
    .refine((value) => {
      const n = Number.parseInt(value.trim(), 10);
      return !Number.isFinite(n) || n <= MAX_QUANTITY;
    }, `That's a lot — please contact us directly for orders over ${MAX_QUANTITY}.`),
  hasOwnDesign: z.boolean(),
  designIds: z.array(z.string()),
});

type FormValues = z.infer<typeof formSchema>;

// The fields the edit surface pre-populates from an existing order. The page
// passes the order doc; only the captain-editable fields are read here.
export type EditableOrder = Pick<
  Doc<"orders">,
  "_id" | "teamName" | "sport" | "estimatedQuantity" | "hasOwnDesign" | "designIds"
>;

// One component renders both New and Edit (O-04 AC): pass an existing `order`
// to pre-populate fields and route the submit through updateOrder instead of
// createOrder. Everything else — layout, validation, progress gate — is shared.
export function OrderDetailsForm({ order }: { order?: EditableOrder } = {}) {
  const router = useRouter();
  const isEdit = order !== undefined;
  const createOrder = useMutation(api.orders.createOrder);
  const updateOrder = useMutation(api.orders.updateOrder);
  const designs = useQuery(api.designs.listMyDesigns);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: order
      ? {
          teamName: order.teamName,
          sport: order.sport,
          estimatedQuantity: String(order.estimatedQuantity),
          hasOwnDesign: order.hasOwnDesign,
          designIds: order.designIds as unknown as string[],
        }
      : {
          teamName: "",
          sport: "",
          estimatedQuantity: "",
          hasOwnDesign: false,
          designIds: [],
        },
  });

  // Recompute the progress gate on every change so the "design attached"
  // milestone clears the instant a design is checked. useWatch (not
  // form.watch) keeps the subscription React-Compiler-friendly, matching the
  // other portal forms. hasOwnDesign doesn't affect the gate, so it's omitted.
  const watched = useWatch({ control: form.control });
  const milestones = orderMilestones({
    teamName: watched.teamName ?? "",
    sport: watched.sport ?? "",
    estimatedQuantity: watched.estimatedQuantity ?? "",
    hasOwnDesign: false,
    designIds: watched.designIds ?? [],
  });
  const hasLinkedDesign = linkedDesignCount(watched.designIds ?? []) >= 1;

  // Designs unchecked since the order was saved. Each gets its own warning
  // counting the items that would drop (O-08, L-04) — order form or not. A
  // preview, not a gate: the save path below is untouched, so removing is
  // always possible. Only an edit has saved designs to remove.
  const removals = order
    ? pendingDesignRemovals(
        order.designIds as unknown as string[],
        watched.designIds ?? [],
      )
    : [];

  async function onSubmit(values: FormValues) {
    try {
      const payload = toOrderPayload({
        teamName: values.teamName,
        sport: values.sport,
        estimatedQuantity: values.estimatedQuantity,
        hasOwnDesign: values.hasOwnDesign,
        designIds: values.designIds,
      });
      const fields = {
        teamName: payload.teamName,
        sport: payload.sport,
        estimatedQuantity: payload.estimatedQuantity,
        hasOwnDesign: payload.hasOwnDesign,
        designIds: payload.designIds as unknown as Id<"designs">[],
      };
      const orderId =
        order !== undefined
          ? await updateOrder({ orderId: order._id, ...fields })
          : await createOrder(fields);
      toast.success(isEdit ? "Order updated" : "Order created", {
        description: isEdit
          ? "Your changes are saved."
          : "We'll take it from here — track its progress on the order page.",
      });
      router.push(`/portal/orders/${orderId}`);
    } catch (err) {
      toast.error("Could not save your order", {
        description: userMessage(err, "Please try again in a moment."),
      });
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="space-y-10"
        aria-busy={isSubmitting}
      >
        <OrderProgress milestones={milestones} />
        <FieldSection
          eyebrow="01"
          title="Team & order"
          description="The basics so we know who this is for and how many to make."
        >
          <FormField
            control={form.control}
            name="teamName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Team name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Westside FC"
                    maxLength={TEAM_NAME_MAX_LENGTH}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sport"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sport or activity</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ultimate frisbee, hockey, rugby…"
                    maxLength={SPORT_MAX_LENGTH}
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
                <FormLabel>Estimated quantity</FormLabel>
                <FormDescription>
                  {MIN_QUANTITY} jersey minimum.
                </FormDescription>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={MIN_QUANTITY}
                    max={MAX_QUANTITY}
                    step={1}
                    placeholder="12"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FieldSection>

        <FieldSection
          eyebrow="02"
          title="Design"
          description="Tell us whether you're bringing your own artwork. Silhouette specs (style, neckline, sleeve) now live on each design."
        >
          <FormField
            control={form.control}
            name="hasOwnDesign"
            render={({ field }) => (
              <FormItem>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-background px-4 py-3 transition hover:border-ring has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(next) => field.onChange(next === true)}
                      className="mt-0.5"
                    />
                  </FormControl>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      I already have my own design
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Check this if you&apos;ll provide the artwork yourself —
                      otherwise leave it unchecked and we&apos;ll work with you
                      on a design.
                    </span>
                  </span>
                </label>
                <FormMessage />
              </FormItem>
            )}
          />
        </FieldSection>

        <FieldSection
          eyebrow="03"
          title="Link designs"
          description="Attach any briefs you've already uploaded so Sidestep starts with your vibe in mind."
        >
          <FormField
            control={form.control}
            name="designIds"
            render={({ field }) => (
              <FormItem>
                <DesignChecklist
                  designs={designs}
                  value={field.value}
                  onChange={field.onChange}
                />
                {order &&
                  removals.map((designId) => (
                    <DesignRemovalWarning
                      key={designId}
                      orderId={order._id}
                      designId={designId as Id<"designs">}
                      title={designs?.find((d) => d._id === designId)?.title}
                    />
                  ))}
                {!hasLinkedDesign && (
                  <p
                    role="note"
                    className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                  >
                    No design attached yet — that&apos;s okay, you can save now
                    and add one whenever you&apos;re ready. Your order stays
                    incomplete until a design is linked.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </FieldSection>

        <Separator />

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            You can update specs and link more designs later from the order
            page.
          </p>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-teal-600 font-semibold text-white hover:bg-teal-700"
          >
            {isSubmitting
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : "Create order"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// The order-readiness gate. Renders each milestone with a status icon and a
// caption ("Done" / "In progress" / "Locked"). The "Design attached"
// milestone shows Locked until a design is linked, which is the visible block
// the PRD calls for — and "Ready to collect" stays Locked behind it.
const STATUS_CAPTION: Record<OrderMilestone["status"], string> = {
  complete: "Done",
  current: "In progress",
  blocked: "Locked",
};

function OrderProgress({ milestones }: { milestones: OrderMilestone[] }) {
  const completeCount = milestones.filter((m) => m.status === "complete").length;
  const total = milestones.length;
  const pct = total === 0 ? 0 : Math.round((completeCount / total) * 100);

  return (
    <Card
      aria-label="Order progress"
      className="gap-4 bg-card/80 px-5 py-5 ring-foreground/[0.07]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          Order readiness
        </p>
        <Badge
          variant="secondary"
          className="font-mono text-[0.7rem] tabular-nums"
        >
          {completeCount} of {total} ready
        </Badge>
      </div>

      {/* "X of N" meter — the mock's progress-bar treatment. The milestone
          list below stays the source of per-step status. */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="presentation"
      >
        <div
          aria-hidden
          className="h-full rounded-full bg-teal-600 transition-[width] duration-500 dark:bg-teal-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
        {milestones.map((m, i) => (
          <li
            key={m.id}
            className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:text-center"
          >
            <MilestoneIcon status={m.status} />
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  m.status === "blocked"
                    ? "text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {m.label}
              </p>
              <p
                className={cn(
                  "text-xs",
                  m.status === "complete"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : m.status === "blocked"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground",
                )}
              >
                {STATUS_CAPTION[m.status]}
              </p>
            </div>
            {i < milestones.length - 1 && (
              <span
                aria-hidden
                className="hidden h-px flex-1 self-center bg-border sm:block"
              />
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function MilestoneIcon({ status }: { status: OrderMilestone["status"] }) {
  const base =
    "flex size-7 shrink-0 items-center justify-center rounded-full";
  if (status === "complete") {
    return (
      <span
        className={cn(
          base,
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
        )}
      >
        <Check className="size-4" aria-hidden />
      </span>
    );
  }
  if (status === "blocked") {
    return (
      <span
        className={cn(
          base,
          "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
        )}
      >
        <Lock className="size-4" aria-hidden />
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-primary/10 text-primary")}>
      <Loader2 className="size-4" aria-hidden />
    </span>
  );
}

function DesignChecklist({
  designs,
  value,
  onChange,
}: {
  designs: Array<Doc<"designs"> & { fileCount: number }> | undefined;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const selected = useMemo(() => new Set(value), [value]);

  if (designs === undefined) return <DesignListSkeleton />;
  if (designs.length === 0) return <EmptyDesigns />;

  function toggle(id: string, checked: boolean) {
    onChange(
      checked
        ? Array.from(new Set([...value, id]))
        : value.filter((existing) => existing !== id),
    );
  }

  return (
    <ul className="space-y-2" aria-label="Your designs">
      {designs.map((design) => {
        const id = design._id as unknown as string;
        const isSelected = selected.has(id);
        const fileCount = design.fileCount;
        return (
          <li key={design._id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-background px-4 py-3 transition hover:border-ring has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5">
              <Checkbox
                checked={isSelected}
                onCheckedChange={(next) => toggle(id, next === true)}
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {design.title}
                </span>
                <Badge
                  variant={fileCount === 0 ? "outline" : "secondary"}
                  className="mt-1"
                >
                  {fileCount === 0
                    ? "No files yet"
                    : `${fileCount} file${fileCount === 1 ? "" : "s"}`}
                </Badge>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyDesigns() {
  return (
    <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
      No designs yet — you can add one after creating this order.
    </p>
  );
}

function DesignListSkeleton() {
  return (
    <ul className="space-y-2" aria-label="Loading">
      {[0, 1].map((i) => (
        <li
          key={i}
          className="h-14 animate-pulse rounded-md border border-border bg-muted"
        />
      ))}
    </ul>
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
    <Card className="gap-5 py-6">
      <CardHeader className="gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          Step {eyebrow}
        </p>
        <CardTitle className="text-lg font-semibold text-foreground">
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}
