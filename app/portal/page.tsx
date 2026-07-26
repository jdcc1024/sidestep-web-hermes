"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { overviewOf } from "@/lib/designBlock";
import {
  chipToneForStage,
  deriveCustomerStage,
  type ChipTone,
} from "@/lib/orderStages";

// Shape returned by api.jerseyRuns.listMyResponses — the response row joined
// with its run and the linked order's team name. Keep this in sync with the
// query handler in convex/jerseyRuns.ts; if either grows fields, add them
// here too.
type MyJerseyRunResponse = {
  response: Doc<"jerseyRunResponses">;
  run: Doc<"jerseyRuns">;
  teamName: string;
};

const OVERVIEW_PREVIEW_CHARS = 140;

export default function PortalDashboardPage() {
  const { user, isLoaded: isUserLoaded } = useUser();
  const orders = useQuery(api.orders.listMyOrders);
  const designs = useQuery(api.designs.listMyDesigns);
  const jerseyRunResponses = useQuery(api.jerseyRuns.listMyResponses);

  const greetingName = user?.firstName ?? "Captain";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {isUserLoaded ? `Welcome back, ${greetingName}.` : "Welcome back."}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Your orders and designs at a glance. Everything here updates in
          real-time as Sidestep moves your work forward.
        </p>
      </header>

      <section aria-labelledby="orders-heading" className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2
              id="orders-heading"
              className="text-xl font-semibold text-foreground"
            >
              My Orders
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Track every order you&apos;ve placed.
            </p>
          </div>
          {orders && orders.length > 0 && (
            <Link
              href="/portal/orders/new"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-teal-600 font-semibold text-white shadow-sm hover:bg-teal-700",
              )}
            >
              New order <span aria-hidden>→</span>
            </Link>
          )}
        </div>
        <div className="mt-4">
          {orders === undefined ? (
            <SectionSkeleton />
          ) : orders.length === 0 ? (
            <EmptyOrders />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {orders.map((order) => (
                <li key={order._id}>
                  <OrderCard order={order} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="designs-heading" className="mt-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2
              id="designs-heading"
              className="text-xl font-semibold text-foreground"
            >
              My Designs
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Briefs, mood boards, and reference files.
            </p>
          </div>
          {designs && designs.length > 0 && (
            <Link
              href="/portal/designs/new"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-teal-600 font-semibold text-white shadow-sm hover:bg-teal-700",
              )}
            >
              New design <span aria-hidden>→</span>
            </Link>
          )}
        </div>
        <div className="mt-4">
          {designs === undefined ? (
            <SectionSkeleton />
          ) : designs.length === 0 ? (
            <EmptyDesigns />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {designs.map((design) => (
                <li key={design._id}>
                  <DesignCard design={design} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="jersey-responses-heading" className="mt-12">
        <div>
          <h2
            id="jersey-responses-heading"
            className="text-xl font-semibold text-foreground"
          >
            Your jersey run responses
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Submissions you&apos;ve made to other captains&apos; jersey runs.
          </p>
        </div>
        <div className="mt-4">
          {jerseyRunResponses === undefined ? (
            <SectionSkeleton />
          ) : jerseyRunResponses.length === 0 ? (
            <EmptyJerseyRunResponses />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {jerseyRunResponses.map((entry) => (
                <li key={entry.response._id}>
                  <JerseyResponseCard entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function OrderCard({ order }: { order: Doc<"orders"> }) {
  const stage = deriveCustomerStage(order.internalStages);
  const tone = chipToneForStage(stage);

  return (
    <Link
      href={`/portal/orders/${order._id}`}
      className="flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">
          {order.teamName}
        </h3>
        <StageChip stage={stage} tone={tone} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Sport</dt>
        <dd className="text-foreground">{order.sport}</dd>
        <dt className="text-muted-foreground">Quantity</dt>
        <dd className="text-foreground">{order.estimatedQuantity} jerseys</dd>
      </dl>
    </Link>
  );
}

function DesignCard({
  design,
}: {
  design: Doc<"designs"> & { fileCount: number };
}) {
  const fileCount = design.fileCount;
  const summary = truncate(overviewOf(design.blocks), OVERVIEW_PREVIEW_CHARS);

  return (
    <Link
      href={`/portal/designs/${design._id}`}
      className="flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
    >
      <h3 className="text-lg font-semibold text-foreground">{design.title}</h3>
      {summary && (
        <p className="mt-2 text-sm text-muted-foreground">{summary}</p>
      )}
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {fileCount === 0
          ? "No files yet"
          : `${fileCount} file${fileCount === 1 ? "" : "s"}`}
      </p>
    </Link>
  );
}

function JerseyResponseCard({ entry }: { entry: MyJerseyRunResponse }) {
  const { response, run, teamName } = entry;
  const jerseyLabel =
    [response.jerseyName, response.jerseyNumber ? `#${response.jerseyNumber}` : null]
      .filter(Boolean)
      .join(" ") || "No name or number";

  return (
    <Link
      href={`/run/${run._id}`}
      className="flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">
          {teamName || "Jersey run"}
        </h3>
        {run.status === "closed" && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Closed
          </span>
        )}
      </div>
      <p className="mt-1 text-sm font-medium text-foreground">{jerseyLabel}</p>
      <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Size</dt>
        <dd className="text-foreground">{response.size}</dd>
        <dt className="text-muted-foreground">Submitted</dt>
        <dd className="text-foreground">
          {formatResponseDate(response.submittedAt)}
        </dd>
      </dl>
    </Link>
  );
}

function EmptyJerseyRunResponses() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
      <svg
        className="mx-auto h-10 w-10 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M5 13l4 4L19 7"
        />
      </svg>
      <h3 className="mt-4 text-base font-semibold text-foreground">
        You haven&apos;t submitted any jersey run responses yet
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        When a captain shares a jersey run link, your submissions will show up
        here.
      </p>
    </div>
  );
}

function formatResponseDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StageChip({
  stage,
  tone,
}: {
  stage: string | null;
  tone: ChipTone;
}) {
  const label = stage ?? "Pending";
  const palette: Record<ChipTone, string> = {
    pending: "bg-muted text-muted-foreground",
    "in-progress": "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${palette[tone]}`}
    >
      {label}
    </span>
  );
}

function EmptyOrders() {
  return (
    <EmptyState
      iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      title="You don't have any orders yet"
      body="Once you create an order, you'll see its progress through every stage right here."
      ctaLabel="Start your first order"
      ctaHref="/portal/orders/new"
    />
  );
}

function EmptyDesigns() {
  return (
    <EmptyState
      iconPath="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      title="No designs yet"
      body="Upload your team logo, mood board, or reference photos so Sidestep can get started."
      ctaLabel="Upload a design"
      ctaHref="/portal/designs/new"
    />
  );
}

function EmptyState({
  iconPath,
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  iconPath: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
      <svg
        className="mx-auto h-10 w-10 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d={iconPath}
        />
      </svg>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
      <Link
        href={ctaHref}
        className={cn(
          buttonVariants({ size: "lg" }),
          "mt-5 bg-teal-600 font-semibold text-white shadow-sm hover:bg-teal-700",
        )}
      >
        {ctaLabel} <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2" aria-label="Loading">
      {[0, 1].map((i) => (
        <li
          key={i}
          className="h-32 animate-pulse rounded-lg border border-border bg-muted"
        />
      ))}
    </ul>
  );
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}…`;
}
