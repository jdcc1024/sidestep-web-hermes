"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowLeft } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { describeDeadline } from "@/lib/orderFormDashboard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function AdminOrderFormDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const orderFormId = id as Id<"orderForms">;

  const data = useQuery(api.orderForms.listOrderEntries, { orderFormId });
  const closeRun = useMutation(api.orderForms.closeFormByAdmin);

  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  if (data === undefined) return <Loading />;
  if (data === null) return <NotFound />;

  const { run, order, entries } = data;
  const deadlineStatus = describeDeadline(run.deadline);
  const isClosed = run.status === "closed";
  const totalJerseys = entries.reduce((sum, e) => sum + e.qty, 0);

  const handleClose = async () => {
    if (closing || isClosed) return;
    const confirmed = window.confirm(
      `Close the jersey run for ${order.teamName}? This sends closure emails to the captain and Sidestep ops.`,
    );
    if (!confirmed) return;
    setClosing(true);
    setCloseError(null);
    try {
      await closeRun({ orderFormId });
    } catch (err) {
      const message =
        err instanceof ConvexError
          ? String(err.data)
          : err instanceof Error
            ? err.message
            : "Failed to close run.";
      setCloseError(message);
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/admin/jersey-runs"
        className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline dark:text-teal-300"
      >
        <ArrowLeft className="size-4" aria-hidden /> All jersey runs
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge
            variant="secondary"
            className="bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
          >
            Admin · Jersey run
          </Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {order.teamName}
          </h1>
          <p className="mt-2 text-muted-foreground">
            <Link
              href={`/admin/orders/${order._id}`}
              className="text-teal-700 hover:underline dark:text-teal-300"
            >
              Open order →
            </Link>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <RunStatusBadge status={run.status} />
          {isClosed ? (
            <span className="text-xs text-muted-foreground">
              Close emails sent
            </span>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={handleClose}
              disabled={closing}
            >
              {closing ? "Closing…" : "Close run"}
            </Button>
          )}
          {closeError && (
            <Alert variant="destructive" className="max-w-xs">
              <AlertDescription>{closeError}</AlertDescription>
            </Alert>
          )}
        </div>
      </header>

      <section aria-label="Summary" className="mt-8 grid gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Jerseys"
          value={String(totalJerseys)}
          caption={
            entries.length === 1
              ? "1 order line"
              : `${entries.length} order lines`
          }
        />
        <SummaryCard
          label="Deadline"
          value={formatDate(run.deadline)}
          caption={deadlineStatus.label}
          tone={deadlineStatus.kind === "closed" ? "muted" : "active"}
        />
        <SummaryCard
          label="Names mode"
          value={run.namesMode === "fixed" ? "Fixed roster" : "Open"}
          caption={
            run.namesMode === "fixed"
              ? "Pick from seeded slots"
              : "Anyone can submit"
          }
        />
        <SummaryCard
          label="Sizes offered"
          value={run.sizeOptions.join(", ") || "—"}
          caption="Pickable on the public form"
        />
      </section>

      <Card className="mt-8 gap-0 p-0">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle>Order entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <EmptyResponses />
          ) : (
            <EntryTable
              entries={entries}
              customQuestions={run.customQuestions}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type EntryRow = {
  _id: Id<"orderItems">;
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
          {entries.map((e) => (
            <tr key={e._id} className="hover:bg-muted/40">
              <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                {e.submitterName}
              </td>
              <td className="px-4 py-3">
                <a
                  href={`mailto:${e.submitterEmail}`}
                  className="text-teal-700 hover:underline dark:text-teal-300"
                >
                  {e.submitterEmail}
                </a>
              </td>
              <td className="px-4 py-3 text-foreground">{e.designTitle}</td>
              <td className="px-4 py-3 text-foreground">
                <JerseyCell name={e.name} number={e.number} />
              </td>
              <td className="px-4 py-3 text-foreground">{e.size}</td>
              <td className="px-4 py-3 text-foreground">{e.qty}</td>
              {customQuestions.map((q) => (
                <td key={q.id} className="px-4 py-3 text-foreground">
                  {e.customAnswers[q.id]?.trim() ? (
                    e.customAnswers[q.id]
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
              ))}
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                {formatTimestamp(e.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A named slot renders "Name #number"; a blank/bulk line (no roster slot)
// reads as "Blank" so a spare jersey isn't mistaken for missing data.
function JerseyCell({ name, number }: { name?: string; number?: string }) {
  const label = [name, number ? `#${number}` : null].filter(Boolean).join(" ");
  if (!label)
    return <span className="text-muted-foreground/60">Blank</span>;
  return <>{label}</>;
}

function RunStatusBadge({
  status,
}: {
  status: "open" | "closed";
}) {
  if (status === "open") {
    return (
      <Badge
        variant="secondary"
        className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
      >
        Open
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-muted text-muted-foreground">
      Closed
    </Badge>
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
    <Card>
      <CardContent>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={`mt-2 text-xl font-bold ${
            tone === "muted" ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {value}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}

function EmptyResponses() {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-base font-semibold text-foreground">
        No responses yet
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Submissions show up here as fans fill out the public form.
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="mt-4 h-10 w-72" />
      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="mt-8 h-64 w-full" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <p className="text-2xl font-semibold text-foreground">
        Jersey run not found
      </p>
      <p className="mt-2 text-muted-foreground">
        The run you&apos;re looking for doesn&apos;t exist or has been deleted.
      </p>
      <Link
        href="/admin/jersey-runs"
        className="mt-6 inline-block text-sm text-teal-700 hover:underline dark:text-teal-300"
      >
        ← Back to all jersey runs
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

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
