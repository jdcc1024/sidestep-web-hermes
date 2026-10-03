import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyLinkButton } from "@/components/portal/CopyLinkButton";
import { StartCollecting } from "@/components/portal/StartCollecting";
import { cn } from "@/lib/utils";
import { formatDate } from "./shared";

// The order form card (L-05, UX §4), below the order list. The order form is
// one way onto the list, not a stage the order passes through: a captain can
// fill the list by hand and never make one. The deadline is asked when the
// form is made (StartCollecting) and nowhere else on this page; everything
// else about the form (deadline changes, custom questions, names mode) lives
// in Form settings. Still gated on an attached design, since the public form
// has nothing to offer without one, and still explicit: nothing makes a form
// implicitly.
export function OrderFormCard({
  orderId,
  run,
  hasDesigns,
}: {
  orderId: Id<"orders">;
  run: RunSummary | null | undefined;
  hasDesigns: boolean;
}) {
  return (
    <Card aria-labelledby="order-form-heading" className="mt-6 py-6 sm:mt-10">
      <CardHeader className="gap-1.5">
        <CardTitle id="order-form-heading" className="text-base">
          Order form
        </CardTitle>
        {run === null && (
          <p className="text-sm text-muted-foreground">
            Want players to send their own name, number and size? Make a link
            to share. Everything they send lands on your list, and you can
            still change it.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {run === undefined ? (
          <Skeleton className="h-10 w-48" />
        ) : run !== null ? (
          <FormStatus orderId={orderId} run={run} />
        ) : hasDesigns ? (
          <StartCollecting orderId={orderId} />
        ) : (
          <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Not available yet.
            </span>{" "}
            Attach a design to this order first. Then you can make an order
            form for your team.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// `effectiveStatus` is the lazily resolved status: a form stored "open" past
// its deadline is already closed, and reading `status` here would show "Open"
// on a form whose submissions all reject. The deadline only closes the form;
// the list locks when the order size is confirmed, and says so itself (L-06).
type RunSummary = {
  _id: Id<"jerseyRuns">;
  deadline: number;
  effectiveStatus: "open" | "closed";
};

function FormStatus({
  orderId,
  run,
}: {
  orderId: Id<"orders">;
  run: RunSummary;
}) {
  const open = run.effectiveStatus === "open";
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {open
          ? "Players add their own name, number and size. It all lands on your list above."
          : "Players can't send anything new. Everything they sent is on your list above."}
      </p>
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
        <Badge variant="outline" className="text-muted-foreground">
          {open ? "Closes" : "Deadline was"} {formatDate(run.deadline)}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-3">
        {open && (
          <CopyLinkButton
            path={`/run/${run._id}`}
            className="bg-teal-600 px-3.5 font-semibold text-white hover:bg-teal-700"
          />
        )}
        <Link
          href={`/portal/orders/${orderId}/run/setup`}
          className={cn(buttonVariants({ variant: "outline" }), "h-10 px-3.5")}
        >
          Form settings
        </Link>
      </div>
    </div>
  );
}
