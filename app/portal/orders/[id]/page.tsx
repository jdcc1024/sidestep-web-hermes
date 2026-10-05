"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RemovedDesigns } from "@/components/portal/DesignRemoval";
import { OrderDetailsSection } from "@/components/portal/order/OrderDetailsSection";
import { OrderFormCard } from "@/components/portal/order/OrderFormCard";
import { OrderHeader } from "@/components/portal/order/OrderHeader";
import { OrderListSection } from "@/components/portal/order/OrderListSection";
import { ProgressSection } from "@/components/portal/order/ProgressSection";
import { useOwnedResource } from "@/lib/ownedResource";
import { deriveCustomerStage } from "@/lib/orderStages";

type PageProps = {
  params: Promise<{ id: string }>;
};

// The captain's order page. It owns the reads and lays out the sections
// (L-03): header → timeline → order list → order form card → order details →
// removed designs. Each section is its own component under
// `components/portal/order/`, so later slices edit a section, not this page.
export default function OrderDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const orderId = id as Id<"orders">;
  // Owner-scoped, so a bare `null` can mean "not yours" *or* "no identity
  // attached yet" — useOwnedResource keeps the second from rendering as the
  // first (B-03).
  const result = useOwnedResource(useQuery(api.orders.getMyOrder, { orderId }));
  // The order form (a "run" in code) drives the order form card and the
  // list's fixed-mode warning. One only exists once the captain makes it —
  // saving an order never creates one, so null here is the common starting
  // state, not an error.
  const run = useQuery(api.orderForms.getByOrder, { orderId });
  // The order's list (L-02): every item on every design, with or without a
  // form. The header total, the order list's rows, chips, footer and CSV all
  // come from this one subscription, so an edit updates every one of them in
  // the same render and they can't disagree (§7.9).
  const list = useQuery(api.orderItems.listForOrder, { orderId });

  if (result.status === "loading") return <Loading />;
  if (result.status === "not-found") return <NotFound />;

  // Locked (O-06) means the confirmed production basis is frozen: every edit
  // affordance on this page goes away and the note under the header says why.
  const { order, designs, locked } = result.data;
  const stage = deriveCustomerStage(order.internalStages);
  // Σ qty of sized items on the linked designs (O-07). 0 is the resting
  // total — an empty list or one still loading never reads as the stale
  // intake estimate.
  const total = list?.summary.itemCount ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <OrderHeader
        orderId={orderId}
        order={order}
        stage={stage}
        total={total}
        locked={locked}
      />

      <ProgressSection stage={stage} />

      <OrderListSection
        orderId={orderId}
        teamName={order.teamName}
        designs={designs}
        list={list}
        customQuestions={run?.customQuestions}
        namesMode={run?.namesMode}
      />

      <OrderFormCard
        orderId={orderId}
        run={run}
        hasDesigns={designs.length > 0}
      />

      <OrderDetailsSection
        orderId={orderId}
        order={order}
        designs={designs}
        total={total}
        locked={locked}
      />

      {/* Designs dropped from the order while items were still on them
          (O-08, L-04). Renders nothing until that actually happens. */}
      <RemovedDesigns orderId={orderId} />
    </div>
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
