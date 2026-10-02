import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DesignThumbnail } from "@/components/design/DesignThumbnail";
import { NamesModeControl } from "@/components/portal/NamesModeControl";
import type { OrderListData } from "@/components/orderList/shared";
import { cn } from "@/lib/utils";
import {
  formatDate,
  type OrderDesign,
  type OrderRecord,
  type OrderRun,
} from "./shared";

// The order's details, below the list (L-03): the basics the captain entered
// at intake, then each design's specs. What's *on* each design lives in the
// order list above; these cards say what the design is.
export function OrderDetailsSection({
  orderId,
  order,
  designs,
  total,
  run,
  list,
  locked,
}: {
  orderId: Id<"orders">;
  order: OrderRecord;
  designs: readonly OrderDesign[];
  total: number;
  run: OrderRun | undefined;
  list: OrderListData | null | undefined;
  locked: boolean;
}) {
  const named = new Set(
    (list?.designs ?? [])
      .filter((d) => d.items.some((item) => item.name))
      .map((d) => d.designId),
  );

  return (
    <>
      <Card aria-labelledby="specs-heading" className="mt-6 py-6 sm:mt-10">
        <CardHeader className="gap-1.5">
          <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase dark:text-teal-300">
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

        {/* How the public form collects names (M-05). It sits by the designs
            because in fixed mode a design's named items *are* the picker list
            players choose from. Needs a run — there's no mode to switch
            before one exists. L-05 moves it into the order form's settings. */}
        {run && (
          <NamesModeControl
            runId={run._id}
            namesMode={run.namesMode}
            locked={run.effectiveStatus === "locked"}
          />
        )}

        {designs.length === 0 ? (
          <NoDesigns orderId={orderId} locked={locked} />
        ) : (
          <div className="mt-4 space-y-4">
            {designs.map((design) => (
              <DesignCard
                key={design._id}
                design={design}
                // In fixed mode the public form only offers the names already
                // on the design, so a design with none takes no orders (M-05).
                // Only once the list has loaded, so it can't flash.
                unorderable={
                  run?.namesMode === "fixed" && !!list && !named.has(design._id)
                }
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// Each linked design's own card under the one order timeline (O-05): its
// picture, file count and silhouette specs.
function DesignCard({
  design,
  unorderable,
}: {
  design: OrderDesign;
  unorderable: boolean;
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
              className="size-14 shrink-0"
              zoomable
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
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
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

        {/* A warning, not a block: the captain is usually mid-way through
            adding names, and blocking would fight that. Disappears with the
            first named item. */}
        {unorderable && (
          <p
            role="note"
            aria-label={`Nobody can order ${design.title}`}
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <span className="font-semibold">Nobody can order this design.</span>{" "}
            You&apos;re collecting from a fixed roster, and this design has no
            players yet — add some in the order list above, or switch to open
            names.
          </p>
        )}
      </CardContent>
    </Card>
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

// A silhouette spec as a chip: "Label · Value". An undecided spec stays a
// muted outline chip so the cut still reads as a set of choices, not a gap.
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
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}
