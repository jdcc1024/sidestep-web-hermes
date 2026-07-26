"use client";

import Link from "next/link";
import { use } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, FileDown } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ExportOrderButton } from "@/components/admin/ExportOrderButton";
import { InlineEditField } from "@/components/admin/InlineEditField";
import { OrderStageChecklist } from "@/components/admin/OrderStageChecklist";
import { validateQuantity, validateRequiredText } from "@/lib/adminRecords";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const orderId = id as Id<"orders">;
  const result = useQuery(api.admin.getOrder, { orderId });
  const updateOrder = useMutation(api.admin.updateOrder);

  if (result === undefined) {
    return <DetailSkeleton />;
  }
  if (result === null) {
    return <NotFound />;
  }

  const { order, captain, designs, jerseyRun, jerseyRunResponseCount } =
    result;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline dark:text-teal-300"
      >
        <ArrowLeft className="size-4" aria-hidden /> All orders
      </Link>

      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge
            variant="secondary"
            className="bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
          >
            Admin · Order
          </Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {order.teamName}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Created {formatDate(order.createdAt)} · {order.sport} ·{" "}
            {order.estimatedQuantity} jerseys
          </p>
        </div>
        <ExportOrderButton orderId={order._id} />
      </header>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Captain</CardTitle>
        </CardHeader>
        <CardContent>
          {captain ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Field
                label="Name"
                value={
                  <Link
                    href={`/admin/customers/${captain._id}`}
                    className="text-teal-700 hover:underline dark:text-teal-300"
                  >
                    {captain.name}
                  </Link>
                }
              />
              <Field
                label="Email"
                value={
                  <a
                    href={`mailto:${captain.email}`}
                    className="text-teal-700 hover:underline dark:text-teal-300"
                  >
                    {captain.email}
                  </a>
                }
              />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Captain record missing.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Order specs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="-mt-1 mb-4 text-xs text-muted-foreground">
            Edit any field to correct the record. Changes are visible to the
            customer immediately. Silhouette specs live on each design —
            open a linked design below to change its cut.
          </p>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <InlineEditField
              label="Team name"
              value={order.teamName}
              validate={(v) => validateRequiredText(v, "Team name")}
              onSave={(teamName) => updateOrder({ orderId, teamName })}
            />
            <InlineEditField
              label="Sport"
              value={order.sport}
              validate={(v) => validateRequiredText(v, "Sport")}
              onSave={(sport) => updateOrder({ orderId, sport })}
            />
            <InlineEditField
              label="Quantity"
              type="number"
              value={String(order.estimatedQuantity)}
              validate={validateQuantity}
              onSave={(qty) =>
                updateOrder({ orderId, estimatedQuantity: Number(qty) })
              }
            />
            <dl>
              <Field
                label="Customer has own design"
                value={order.hasOwnDesign ? "Yes" : "No"}
              />
            </dl>
            <dl>
              <Field label="Last updated" value={formatDate(order.updatedAt)} />
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Linked designs</CardTitle>
        </CardHeader>
        <CardContent>
          {designs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No designs linked yet.
            </p>
          ) : (
            <ul className="space-y-4">
              {designs.map((design) => (
                <li
                  key={design._id}
                  className="rounded-md border border-border p-4"
                >
                  <h3 className="text-sm font-semibold">
                    <Link
                      href={`/admin/designs/${design._id}`}
                      className="text-teal-700 hover:underline dark:text-teal-300"
                    >
                      {design.title}
                    </Link>
                  </h3>
                  {design.brief && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {design.brief}
                    </p>
                  )}
                  {design.canvaLink && (
                    <p className="mt-2 text-xs">
                      <a
                        href={design.canvaLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-700 hover:underline dark:text-teal-300"
                      >
                        Canva link ↗
                      </a>
                    </p>
                  )}
                  {design.assets.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {design.assets.map((asset) =>
                        asset.url ? (
                          <li key={asset._id}>
                            <Badge
                              variant="secondary"
                              render={
                                <a
                                  href={asset.url}
                                  target="_blank"
                                  rel="noreferrer"
                                />
                              }
                            >
                              <FileDown aria-hidden />
                              {asset.filename}
                            </Badge>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Internal stages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="-mt-1 mb-4 text-xs text-muted-foreground">
            Check a stage to mark it complete. Updates propagate to the
            customer&apos;s order timeline in real time.
          </p>
          <OrderStageChecklist
            orderId={order._id}
            internalStages={order.internalStages}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Jersey run</CardTitle>
        </CardHeader>
        <CardContent>
          {jerseyRun ? (
            <>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Field label="Status" value={jerseyRun.status} />
                <Field label="Names mode" value={jerseyRun.namesMode} />
                <Field
                  label="Deadline"
                  value={formatDate(jerseyRun.deadline)}
                />
                <Field
                  label="Responses"
                  value={String(jerseyRunResponseCount)}
                />
              </dl>
              <p className="mt-4 text-sm">
                <Link
                  href={`/admin/jersey-runs/${jerseyRun._id}`}
                  className="text-teal-700 hover:underline dark:text-teal-300"
                >
                  View responses and close run →
                </Link>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No jersey run created for this order.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="mt-4 h-10 w-72" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="mt-6 h-40 w-full" />
      ))}
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <p className="text-2xl font-semibold text-foreground">Order not found</p>
      <p className="mt-2 text-muted-foreground">
        The order you&apos;re looking for doesn&apos;t exist or has been
        deleted.
      </p>
      <Link
        href="/admin/orders"
        className="mt-6 inline-block text-sm text-teal-700 hover:underline dark:text-teal-300"
      >
        ← Back to all orders
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
