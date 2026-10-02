import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StartCollecting } from "@/components/portal/StartCollecting";
import { cn } from "@/lib/utils";
import { formatDate } from "./shared";

// Where collecting starts (M-05). Run creation lives here, taking only a
// deadline — sizes are a fixed catalog and names mode is switched beside the
// designs, so the old setup form had one field left and no reason to be its
// own page. Still gated until at least one design is attached, so the
// progress milestone the order page shows stays honest, and still explicit:
// nothing creates a run implicitly. L-05 reworks this card into the order
// form card.
export function CollectSection({
  orderId,
  run,
  hasDesigns,
}: {
  orderId: Id<"orders">;
  run: RunSummary | null | undefined;
  hasDesigns: boolean;
}) {
  return (
    <Card aria-labelledby="collect-heading" className="mt-6 py-6 sm:mt-10">
      <CardHeader className="gap-1.5">
        <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase dark:text-teal-300">
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
          <StartCollecting orderId={orderId} />
        ) : (
          <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Not available yet.
            </span>{" "}
            Attach a design above first — then you can start collecting sizes
            from your team.
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
  namesMode: "open" | "fixed";
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
