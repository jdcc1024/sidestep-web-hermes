"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  describeDeadline,
  estimateForResponses,
  participationLabel,
} from "@/lib/jerseyRunDashboard";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function JerseyRunResponsesPage({ params }: PageProps) {
  const { id } = use(params);
  const orderId = id as Id<"orders">;

  // Resolve the run from the order so the URL stays /orders/[id]/run/...
  // — captains link straight into this page from the order detail and
  // don't see jerseyRunIds anywhere in the UI.
  const order = useQuery(api.orders.getMyOrder, { orderId });
  const runStub = useQuery(
    api.jerseyRuns.getByOrder,
    order ? { orderId } : "skip",
  );
  const data = useQuery(
    api.jerseyRuns.listOrderEntries,
    runStub ? { jerseyRunId: runStub._id } : "skip",
  );

  if (order === undefined || runStub === undefined || data === undefined)
    return <Loading orderId={orderId} />;
  if (order === null) return <NotFound orderId={orderId} />;
  if (runStub === null) return <NoRunYet orderId={orderId} />;
  if (data === null) return <NotFound orderId={orderId} />;

  const { run, entries } = data;
  const deadlineStatus = describeDeadline(run.deadline);
  // Production total is Σ order-entry qty (R-04) — the estimate and the
  // participation count both read the real jersey count, not a row tally.
  const totalJerseys = entries.reduce((sum, e) => sum + e.qty, 0);
  const estimate = estimateForResponses(totalJerseys, order.order);
  const teamName = order.order.teamName;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href={`/portal/orders/${orderId}`}
        className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
      >
        ← Back to order
      </Link>

      <header className="mt-3">
        <p className="text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          Jersey run · {teamName}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Responses
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Updates live as your team submits — no need to refresh.
        </p>
      </header>

      <section
        aria-label="Summary"
        className="mt-8 grid gap-3 sm:grid-cols-3"
      >
        <SummaryCard
          label="Participation"
          value={String(totalJerseys)}
          caption={participationLabel(totalJerseys)}
        />
        <SummaryCard
          label="Deadline"
          value={deadlineStatus.kind === "closed" ? "Closed" : deadlineStatus.label.replace(/^Closes /, "")}
          caption={deadlineStatus.label}
          tone={deadlineStatus.kind === "closed" ? "muted" : "active"}
        />
        <SummaryCard
          label="Estimated total"
          value={formatPrice(estimate.total)}
          caption={
            estimate.quantity === 0
              ? "Waiting for the first response"
              : `${estimate.quantity} × ${formatPrice(estimate.perUnitPrice)}${
                  estimate.designFee > 0
                    ? ` + ${formatPrice(estimate.designFee)} design fee`
                    : ""
                }`
          }
        />
      </section>

      <section
        aria-label="Response table"
        className="mt-8 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      >
        {entries.length === 0 ? (
          <EmptyState jerseyRunId={run._id} />
        ) : (
          <EntryTable
            entries={entries}
            customQuestions={run.customQuestions}
          />
        )}
      </section>
    </div>
  );
}

type EntryRow = {
  _id: Id<"orderEntries">;
  submitterName: string;
  submitterEmail: string;
  designTitle: string;
  name?: string;
  number?: string;
  size: string;
  qty: number;
  customAnswers: Record<string, string>;
  createdAt: number;
};

function EntryTable({
  entries,
  customQuestions,
}: {
  entries: EntryRow[];
  customQuestions: { id: string; label: string }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">Submitter</th>
            <th scope="col" className="px-4 py-3">Email</th>
            <th scope="col" className="px-4 py-3">Design</th>
            <th scope="col" className="px-4 py-3">Jersey</th>
            <th scope="col" className="px-4 py-3">Size</th>
            <th scope="col" className="px-4 py-3">Qty</th>
            {customQuestions.map((q) => (
              <th key={q.id} scope="col" className="px-4 py-3">
                {q.label}
              </th>
            ))}
            <th scope="col" className="px-4 py-3">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((e) => {
            const jersey = [e.name, e.number ? `#${e.number}` : null]
              .filter(Boolean)
              .join(" ");
            return (
              <tr key={e._id}>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                  {e.submitterName}
                </td>
                <td className="px-4 py-3 text-foreground/90">
                  {e.submitterEmail}
                </td>
                <td className="px-4 py-3 text-foreground/90">{e.designTitle}</td>
                <td className="px-4 py-3 text-foreground/90">
                  {jersey || <span className="text-muted-foreground">Blank</span>}
                </td>
                <td className="px-4 py-3 text-foreground/90">{e.size}</td>
                <td className="px-4 py-3 text-foreground/90">{e.qty}</td>
                {customQuestions.map((q) => (
                  <td key={q.id} className="px-4 py-3 text-foreground/90">
                    {e.customAnswers[q.id]?.trim() ? (
                      e.customAnswers[q.id]
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                ))}
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatTimestamp(e.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  caption,
  tone = "active",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "active" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-bold ${
          tone === "muted" ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
    </div>
  );
}

function EmptyState({ jerseyRunId }: { jerseyRunId: Id<"jerseyRuns"> }) {
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/run/${jerseyRunId}`
      : `/run/${jerseyRunId}`;
  return (
    <div className="px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-foreground">
        No responses yet
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Share your link to get started — submissions show up here in
        real-time.
      </p>
      <p className="mt-4 inline-block break-all rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground/90">
        {shareUrl}
      </p>
    </div>
  );
}

function NoRunYet({ orderId }: { orderId: Id<"orders"> }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-foreground">No jersey run yet</h1>
      <p className="mt-2 text-muted-foreground">
        Set up a run to start collecting sizes and names from your team.
      </p>
      <Link
        href={`/portal/orders/${orderId}/run/setup`}
        className={cn(
          buttonVariants({ size: "lg" }),
          "mt-6 bg-teal-600 font-semibold text-white shadow-sm hover:bg-teal-700",
        )}
      >
        Set up your run
      </Link>
    </div>
  );
}

function NotFound({ orderId }: { orderId: Id<"orders"> }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-foreground">
        We couldn&apos;t find that jersey run
      </h1>
      <p className="mt-2 text-muted-foreground">
        It may have been removed, or you don&apos;t have access to it.
      </p>
      <Link
        href={`/portal/orders/${orderId}`}
        className={cn(
          buttonVariants({ size: "lg" }),
          "mt-6 bg-teal-600 font-semibold text-white shadow-sm hover:bg-teal-700",
        )}
      >
        Back to order
      </Link>
    </div>
  );
}

function Loading({ orderId }: { orderId: Id<"orders"> }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href={`/portal/orders/${orderId}`}
        className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
      >
        ← Back to order
      </Link>
      <div className="mt-6 h-10 w-2/3 animate-pulse rounded bg-muted" />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-8 h-60 animate-pulse rounded bg-muted" />
    </div>
  );
}

function formatPrice(amount: number): string {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
