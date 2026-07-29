"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useQuery } from "convex/react";
import { ImageIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/ui/button";
import { isWebSafeImage } from "@/lib/designAsset";
import { cn } from "@/lib/utils";
import { OrderTimeline } from "@/components/portal/OrderTimeline";
import { RemovedDesigns } from "@/components/portal/DesignRemoval";
import { OrderLockedNotice } from "@/components/portal/OrderLocked";
import { DesignRosterPreview } from "@/components/portal/DesignRosterPreview";
import {
  RosterSheet,
  type RosterCopySource,
  type RosterSheetSlot,
} from "@/components/portal/RosterSheet";
import { SizeBreakdown } from "@/components/portal/SizeBreakdown";
import {
  entriesForDesigns,
  rosterRowsByDesign,
  type RosterRow,
} from "@/lib/jerseyBreakdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnedResource } from "@/lib/ownedResource";
import {
  chipToneForStage,
  deriveCustomerStage,
  type ChipTone,
  type CustomerStageName,
} from "@/lib/orderStages";

type PageProps = {
  params: Promise<{ id: string }>;
};

type OrderDesign = {
  _id: Id<"designs">;
  title: string;
  overview: string;
  canvaLink?: string;
  jerseyStyle?: string;
  neckline?: string;
  sleeveStyle?: string;
  fileCount: number;
  // The design's resolved main image (D-07). Null when it has no files;
  // `url` is null when the file itself has gone from storage.
  mainImage: {
    url: string | null;
    filename: string;
    contentType: string;
  } | null;
};

export default function OrderDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const orderId = id as Id<"orders">;
  // Owner-scoped, so a bare `null` can mean "not yours" *or* "no identity
  // attached yet" — useOwnedResource keeps the second from rendering as the
  // first (B-03).
  const result = useOwnedResource(
    useQuery(api.orders.getMyOrder, { orderId }),
  );
  // Run state drives the handoff CTA. A run only exists once the captain has
  // gone through Run Setup ("first collect") — saving an order never creates
  // one, so null here is the common starting state, not an error.
  const run = useQuery(api.jerseyRuns.getByOrder, { orderId });
  // The live production total, derived from the roster rows (O-07, reading
  // R-04's `countsByRun`). Skipped until a run exists — before that there are
  // no rows, so the total is simply 0. This replaces `estimatedQuantity` as
  // the order's real quantity; the estimate stays only as an intake seed.
  const counts = useQuery(
    api.orderEntries.countsByRun,
    run ? { runId: run._id } : "skip",
  );
  // The jerseys behind that total (C-01) — every collected entry, which is
  // what the order-wide size run is a projection of. Same gating as the
  // counts: no run means nothing was collected.
  const collected = useQuery(
    api.jerseyRuns.listOrderEntries,
    run ? { jerseyRunId: run._id } : "skip",
  );
  // The roster itself (M-01) — every slot on every design, seeded-unfilled
  // included, with the sizes ordered against it. This is what the design
  // cards render: the entries above can only describe jerseys somebody
  // ordered, so on their own they hide a seeded player nobody ordered for.
  const roster = useQuery(
    api.rosterEntries.listForRun,
    run ? { runId: run._id } : "skip",
  );

  if (result.status === "loading") return <Loading />;
  if (result.status === "not-found") return <NotFound />;

  // Locked (O-06) means the confirmed production basis is frozen: every edit
  // affordance on this page goes away and the note below says why.
  const { order, designs, locked } = result.data;
  const stage = deriveCustomerStage(order.internalStages);
  const tone = chipToneForStage(stage);

  // 0 is the resting total: an empty roster, a run still loading, or no run
  // yet all read as "nothing collected", never as the stale estimate.
  const total = counts?.total ?? 0;
  const countByDesign = new Map(
    (counts?.byDesign ?? []).map((d) => [d.designId, d.total] as const),
  );

  // Scoped to the designs the order still carries, so the size chips
  // reconcile with the counts above — entries on a since-removed design keep
  // their own section further down (O-08). `listForRun` applies the same
  // scoping server-side, so the per-design rows need no filtering here.
  const entries = entriesForDesigns(collected?.entries ?? [], designs);
  const rowsByDesign = new Map(
    rosterRowsByDesign(roster?.designs ?? []).map(
      (view) => [view.designId, view.rows] as const,
    ),
  );
  // The same read again, unflattened: the card renders rows, the sheet (M-02)
  // edits slots, and both come from this one query so they can't disagree.
  const slotsByDesign = new Map(
    (roster?.designs ?? []).map((d) => [d.designId, d.entries] as const),
  );
  // A locked run freezes the roster (R-06's lazy auto-lock, so this is
  // reachable with no lock control anywhere): the sheet opens read-only.
  const runLocked = run?.effectiveStatus === "locked";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/portal"
        className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
      >
        ← Back to dashboard
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            Order
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {order.teamName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{order.sport}</Badge>
            <Badge variant="secondary" className="tabular-nums">
              {total} collected
            </Badge>
            <Badge variant="outline">Created {formatDate(order.createdAt)}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StageChip stage={stage} tone={tone} />
          {!locked && (
            <Link
              href={`/portal/orders/${orderId}/edit`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Edit order
            </Link>
          )}
        </div>
      </header>

      {locked && <OrderLockedNotice className="mt-6" />}

      <Card aria-labelledby="timeline-heading" className="mt-10 py-6">
        <CardHeader className="gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            Progress
          </p>
          <CardTitle id="timeline-heading" className="text-base">
            Where your order stands
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Updates live as Sidestep moves your order forward.
          </p>
        </CardHeader>
        <CardContent>
          <OrderTimeline currentStage={stage} />
        </CardContent>
      </Card>

      <Card aria-labelledby="specs-heading" className="mt-6 py-6">
        <CardHeader className="gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            Order details
          </p>
          <CardTitle id="specs-heading" className="text-base">
            The basics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Field label="Team name" value={order.teamName} />
            <Field label="Sport" value={order.sport} />
            {/* The live total is the real quantity (O-07); the intake estimate
                sits beside it, plainly labelled as the seed it was. */}
            <Field
              label="Collected"
              value={`${total} jersey${total === 1 ? "" : "s"}`}
            />
            <Field
              label="Estimated at intake"
              value={`${order.estimatedQuantity} jerseys`}
            />
            <Field
              label="Design"
              value={
                order.hasOwnDesign
                  ? "I have my own design"
                  : "Sidestep is helping"
              }
            />
            <Field label="Last updated" value={formatDate(order.updatedAt)} />
          </dl>
        </CardContent>
      </Card>

      <section aria-labelledby="designs-heading" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="designs-heading"
                className="text-lg font-semibold text-foreground"
              >
                Designs
              </h2>
              {designs.length > 0 && (
                <Badge variant="secondary" className="tabular-nums">
                  {designs.length}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {designs.length === 0
                ? "Each design in this order — home, away, warmup — gets its own section here."
                : `${designs.length} design${
                    designs.length === 1 ? "" : "s"
                  } in this order.`}
            </p>
          </div>
          {!locked && (
            <Link
              href={`/portal/orders/${orderId}/edit`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {designs.length === 0 ? "Attach a design" : "Manage designs"}
            </Link>
          )}
        </div>

        {/* The whole order's size run, above the per-design sections: the
            captain reads "what are we making" once, then drills in. */}
        <SizeBreakdown entries={entries} className="mt-4" />

        {designs.length === 0 ? (
          <NoDesigns orderId={orderId} locked={locked} />
        ) : (
          <div className="mt-4 space-y-4">
            {designs.map((design) => (
              <DesignSection
                key={design._id}
                design={design}
                count={countByDesign.get(design._id) ?? 0}
                rows={rowsByDesign.get(design._id) ?? []}
                runId={run?._id ?? null}
                slots={slotsByDesign.get(design._id) ?? []}
                // Everything this design could pull a roster from (M-04) —
                // the order's designs minus itself, since copying a design
                // onto itself is the one thing the mutation rejects.
                otherDesigns={designs
                  .filter((other) => other._id !== design._id)
                  .map((other) => ({
                    designId: other._id,
                    title: other.title,
                  }))}
                locked={runLocked}
              />
            ))}
          </div>
        )}
      </section>

      {/* Designs dropped from the order after people had already ordered
          them (O-08). Renders nothing until that actually happens. */}
      <RemovedDesigns runId={run?._id ?? null} />

      <CollectSection
        orderId={orderId}
        run={run}
        hasDesigns={designs.length > 0}
      />
    </div>
  );
}

// Each linked design renders as its own section under the one order timeline
// (O-05). It carries the design's silhouette specs, its own collected count
// — Σ qty over the roster rows tagged with this design (O-07) — and, since
// M-01, the design's roster: every player slot, ordered against or not. M-02
// puts the editor for that roster behind a button here, so seeding a team no
// longer means hunting for Run Setup.
function DesignSection({
  design,
  count,
  rows,
  runId,
  slots,
  otherDesigns,
  locked,
}: {
  design: OrderDesign;
  count: number;
  rows: RosterRow[];
  runId: Id<"jerseyRuns"> | null;
  slots: readonly RosterSheetSlot[];
  otherDesigns: readonly RosterCopySource[];
  locked: boolean;
}) {
  const hasSpecs = design.jerseyStyle || design.neckline || design.sleeveStyle;
  return (
    <Card aria-label={`Design: ${design.title}`} className="py-6">
      <CardHeader className="gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <DesignThumbnail
              title={design.title}
              mainImage={design.mainImage}
            />
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{design.title}</CardTitle>
              <Badge variant={design.fileCount === 0 ? "outline" : "secondary"}>
                {design.fileCount === 0
                  ? "No files yet"
                  : `${design.fileCount} file${
                      design.fileCount === 1 ? "" : "s"
                    }`}
              </Badge>
            </div>
          </div>
          <Link
            href={`/portal/designs/${design._id}`}
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
          >
            View design →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasSpecs ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Silhouette
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <SpecChip label="Style" value={design.jerseyStyle} />
              <SpecChip label="Neckline" value={design.neckline} />
              <SpecChip label="Sleeve" value={design.sleeveStyle} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            The cut isn&apos;t decided yet — Sidestep will help you choose.
          </p>
        )}

        {/* Per-design rollup — Σ qty over this design's roster rows (O-07).
            The run spans every design, so "which design" is a per-row tag the
            derived-counts query groups on. The roster beneath it breaks that
            same Σ out per player slot and size (M-01), so the two always add
            up to each other — plus the seeded slots contributing 0, which the
            count alone can't show. */}
        <DesignRollup count={count} />
        <DesignRosterPreview rows={rows} />

        {/* Roster entries hang off a run, so there is nothing to edit until
            one exists — the card sends the captain to Collect rather than
            opening an editor whose every write would reject. */}
        {runId ? (
          <RosterSheet
            runId={runId}
            designId={design._id}
            designTitle={design.title}
            slots={slots}
            otherDesigns={otherDesigns}
            locked={locked}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Set up a run below to start building this design&apos;s roster.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// The collected count for one design. Zero keeps the dashed, muted look of an
// empty slot — nothing's come in yet — while any real count reads as a solid
// figure so the derived total feels like the source of truth it is.
function DesignRollup({ count }: { count: number }) {
  if (count === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        No jerseys collected yet — counts appear here as your team submits.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
      <span className="font-semibold tabular-nums text-foreground">{count}</span>{" "}
      <span className="text-muted-foreground">
        jersey{count === 1 ? "" : "s"} collected
      </span>
    </div>
  );
}

// The design's picture at a glance (D-07) — deliberately modest, sitting
// beside the file count rather than replacing it: the count says how much
// material exists, the thumbnail says what it looks like.
//
// Three things stop an image rendering, and all of them land on the same
// placeholder: the design has no files, the main file isn't something a
// browser draws (a print template can be the owner's explicit pick), or its
// short-lived storage URL went stale between the query and the render.
function DesignThumbnail({
  title,
  mainImage,
}: {
  title: string;
  mainImage: OrderDesign["mainImage"];
}) {
  const [failed, setFailed] = useState(false);
  const src =
    !failed && mainImage?.url && isWebSafeImage(mainImage.contentType)
      ? mainImage.url
      : null;

  return (
    <div className="size-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted/50">
      {src ? (
        // Convex storage serves short-lived signed URLs from a per-deployment
        // host, so next/image optimization doesn't apply.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${title} main image`}
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          role="img"
          aria-label={`No image yet for ${title}`}
          className="flex size-full items-center justify-center text-muted-foreground"
        >
          <ImageIcon className="size-5" aria-hidden />
        </div>
      )}
    </div>
  );
}

// The empty state doubles as the nudge to attach a design — but a locked
// order can't attach one, so it drops the CTA rather than offering a button
// that lands on a frozen edit page.
function NoDesigns({
  orderId,
  locked,
}: {
  orderId: Id<"orders">;
  locked: boolean;
}) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">
        No designs attached yet
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {locked
          ? "This order was locked without a design attached — contact Sidestep and we'll sort it out with you."
          : "Attach at least one design to move this order forward and unlock collecting sizes from your team."}
      </p>
      {!locked && (
        <Link
          href={`/portal/orders/${orderId}/edit`}
          className={cn(
            buttonVariants({ size: "sm" }),
            "mt-4 bg-teal-600 font-semibold text-white hover:bg-teal-700",
          )}
        >
          Attach a design
        </Link>
      )}
    </div>
  );
}

// The handoff into Run Setup. Run creation is lazy: this section routes the
// captain to the setup surface, where the first "collect" creates the run.
// Gated until at least one design is attached so the progress milestone the
// order page shows stays honest.
function CollectSection({
  orderId,
  run,
  hasDesigns,
}: {
  orderId: Id<"orders">;
  run: RunSummary | null | undefined;
  hasDesigns: boolean;
}) {
  return (
    <Card aria-labelledby="collect-heading" className="mt-10 py-6">
      <CardHeader className="gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          Collect
        </p>
        <CardTitle id="collect-heading" className="text-base">
          Collect from your team
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Gather sizes, names, and numbers with one shareable link.
        </p>
      </CardHeader>
      <CardContent>
        {run === undefined ? (
          <Skeleton className="h-10 w-48" />
        ) : run !== null ? (
          <RunStatus orderId={orderId} run={run} />
        ) : hasDesigns ? (
          <Link
            href={`/portal/orders/${orderId}/run/setup`}
            className={cn(
              buttonVariants({ size: "lg" }),
              "bg-teal-600 font-semibold text-white hover:bg-teal-700",
            )}
          >
            Set up your run
          </Link>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Not available yet.
            </span>{" "}
            Attach a design above first — then you can set up a run to collect
            sizes from your team.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// The run behind the collect CTA. `effectiveStatus` (R-06) is the lazily
// resolved status — a run stored "open" past its deadline is already locked,
// and reading `status` here would show "Collecting" on a run whose mutations
// all reject.
type RunSummary = {
  _id: Id<"jerseyRuns">;
  deadline: number;
  effectiveStatus: "open" | "closed" | "locked";
};

const RUN_STATUS_LABEL: Record<RunSummary["effectiveStatus"], string> = {
  open: "Collecting",
  closed: "Collection closed",
  locked: "Roster locked",
};

function RunStatus({
  orderId,
  run,
}: {
  orderId: Id<"orders">;
  run: RunSummary;
}) {
  const collecting = run.effectiveStatus === "open";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          className={cn(
            "border-transparent",
            collecting
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
              : "bg-muted text-muted-foreground",
          )}
        >
          {RUN_STATUS_LABEL[run.effectiveStatus]}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {collecting ? "Closes " : "Closed "}
          {formatDate(run.deadline)}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/portal/orders/${orderId}/run/responses`}
          className={cn(
            buttonVariants({ size: "sm" }),
            "bg-teal-600 font-semibold text-white hover:bg-teal-700",
          )}
        >
          View responses
        </Link>
        <Link
          href={`/portal/orders/${orderId}/run/setup`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Manage run
        </Link>
      </div>
    </div>
  );
}

// A silhouette spec as a chip: "Label · Value". An undecided spec stays a
// muted outline chip so the cut still reads as a set of slots, not a gap.
function SpecChip({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {label} · Not set
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </Badge>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

function StageChip({
  stage,
  tone,
}: {
  stage: CustomerStageName | null;
  tone: ChipTone;
}) {
  const palette: Record<ChipTone, string> = {
    pending: "bg-muted text-muted-foreground",
    "in-progress":
      "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    complete:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  };
  return (
    <Badge className={cn("border-transparent", palette[tone])}>
      {stage ?? "Pending"}
    </Badge>
  );
}

function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading order"
      className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
    >
      <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-10 w-2/3 animate-pulse rounded bg-muted" />
      <div className="mt-8 h-32 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-40 animate-pulse rounded bg-muted" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-foreground">Order not found</h1>
      <p className="mt-2 text-muted-foreground">
        We couldn&apos;t find that order — it may have been removed.
      </p>
      <Link
        href="/portal"
        className={cn(
          buttonVariants({ size: "lg" }),
          "mt-6 bg-teal-600 font-semibold text-white shadow-sm hover:bg-teal-700",
        )}
      >
        Back to dashboard
      </Link>
    </div>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
