import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrderLockedNotice } from "@/components/portal/OrderLocked";
import { itemCountText } from "@/lib/orderItem";
import { cn } from "@/lib/utils";
import {
  chipToneForStage,
  type ChipTone,
  type CustomerStageName,
} from "@/lib/orderStages";
import { formatDate, type OrderRecord } from "./shared";

// The top of the order page: back link, team name, the at-a-glance chips and
// the stage. Locked (O-06) drops the edit link and explains why underneath.
export function OrderHeader({
  orderId,
  order,
  stage,
  total,
  locked,
}: {
  orderId: Id<"orders">;
  order: OrderRecord;
  stage: CustomerStageName | null;
  // The live production total (O-07): Σ qty of sized items on the linked
  // designs, from the same list the order list renders.
  total: number;
  locked: boolean;
}) {
  return (
    <>
      <Link
        href="/portal"
        className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
      >
        ← Back to dashboard
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <p className="text-sm font-semibold tracking-wider text-teal-700 uppercase dark:text-teal-300">
            Order
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground sm:mt-2 sm:text-4xl">
            {order.teamName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{order.sport}</Badge>
            <Badge variant="secondary" className="tabular-nums">
              {itemCountText(total)}
            </Badge>
            <Badge variant="outline">
              Created {formatDate(order.createdAt)}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StageChip stage={stage} tone={chipToneForStage(stage)} />
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
    </>
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
