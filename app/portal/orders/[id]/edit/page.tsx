"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOwnedResource } from "@/lib/ownedResource";
import { OrderForm } from "@/components/portal/OrderForm";
import { OrderLockedNotice } from "@/components/portal/OrderLocked";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PageProps = {
  params: Promise<{ id: string }>;
};

// Edit reuses the same OrderForm as New (O-04): one component renders both
// surfaces. Here we resolve the order, then hand the doc to OrderForm to
// pre-populate and route the submit through updateOrder.
//
// Once the roster is locked (O-06) the form is replaced outright by a
// read-only summary. The route stays reachable — bookmarks and the browser
// back button both land here — so it has to explain the freeze rather than
// 404, and rendering fields that `updateOrder` would reject on save would be
// a worse lie than showing none.
export default function EditOrderPage({ params }: PageProps) {
  const { id } = use(params);
  const orderId = id as Id<"orders">;
  const result = useOwnedResource(
    useQuery(api.orders.getMyOrder, { orderId }),
  );

  if (result.status === "loading") return <Loading />;
  if (result.status === "not-found") return <NotFound />;

  const { order, designs, locked } = result.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href={`/portal/orders/${orderId}`}
        className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
      >
        ← Back to order
      </Link>
      <header className="mt-3">
        <p className="text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          {locked ? "Order locked" : "Edit order"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {order.teamName}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {locked
            ? "Your roster is locked, so this order is now read-only."
            : "Update your team details and the designs linked to this order. You can edit anytime before the roster is locked."}
        </p>
      </header>

      {locked ? (
        <div className="mt-8 space-y-6">
          <OrderLockedNotice />
          <FrozenOrder order={order} designs={designs} />
        </div>
      ) : (
        <div className="mt-10">
          <OrderForm order={order} />
        </div>
      )}
    </div>
  );
}

// What the form would have shown, as text. The captain still needs to read
// their order back — to check it against a quote, or to know exactly what to
// mention when they email Sidestep about a change.
function FrozenOrder({
  order,
  designs,
}: {
  order: {
    teamName: string;
    sport: string;
    estimatedQuantity: number;
    hasOwnDesign: boolean;
  };
  designs: Array<{ _id: Id<"designs">; title: string }>;
}) {
  return (
    <Card aria-labelledby="frozen-order-heading" className="py-6">
      <CardHeader className="gap-1.5">
        <CardTitle id="frozen-order-heading" className="text-base">
          What we&apos;re making
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Team name" value={order.teamName} />
          <Field label="Sport" value={order.sport} />
          <Field
            label="Estimated quantity"
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
        </dl>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Linked designs
          </p>
          {designs.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No designs are linked to this order.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm" aria-label="Linked designs">
              {designs.map((d) => (
                <li key={d._id}>
                  <Link
                    href={`/portal/designs/${d._id}`}
                    className="font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
                  >
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-10 w-2/3 animate-pulse rounded bg-muted" />
      <div className="mt-8 h-64 animate-pulse rounded bg-muted" />
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
