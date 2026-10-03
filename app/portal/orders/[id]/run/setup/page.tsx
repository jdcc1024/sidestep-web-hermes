"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOwnedResource } from "@/lib/ownedResource";
import { JerseyRunSetup } from "@/components/portal/JerseyRunSetup";

type PageProps = {
  params: Promise<{ id: string }>;
};

// Form settings: the order form (a "run" in code) is *made* on the order page
// ("Make an order form", deadline only) — this page manages one that already
// exists: share link, deadline, custom questions and names mode. The names
// players pick from live on the order list.
export default function RunSetupPage({ params }: PageProps) {
  const { id } = use(params);
  const orderId = id as Id<"orders">;
  const result = useOwnedResource(
    useQuery(api.orders.getMyOrder, { orderId }),
  );

  if (result.status === "loading") return <Loading orderId={orderId} />;
  if (result.status === "not-found") return <NotFound />;

  const { order } = result.data;

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
          Order form · {order.teamName}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Form settings
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link to share, the deadline, how players add their name, and
          anything extra you want to ask. Everything players send lands on
          your order list.
        </p>
      </header>

      <section className="mt-10 rounded-lg border border-border bg-card p-6 shadow-sm">
        <JerseyRunSetup orderId={orderId} />
      </section>
    </div>
  );
}

function Loading({ orderId }: { orderId: Id<"orders"> }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href={`/portal/orders/${orderId}`}
        className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
      >
        ← Back to order
      </Link>
      <div className="mt-6 h-10 w-2/3 animate-pulse rounded bg-muted" />
      <div className="mt-8 h-60 animate-pulse rounded bg-muted" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
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
