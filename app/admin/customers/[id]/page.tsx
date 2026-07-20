"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { InlineEditField } from "@/components/admin/InlineEditField";
import {
  isNewCustomer,
  validateEmail,
  validateRequiredText,
} from "@/lib/adminRecords";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const userId = id as Id<"users">;
  const result = useQuery(api.admin.getCustomer, { userId });
  const updateUser = useMutation(api.admin.updateUser);
  // Pinned at mount so the "New" badge doesn't read the clock mid-render.
  const [now] = useState(() => Date.now());

  if (result === undefined) return <DetailSkeleton />;
  if (result === null) return <NotFound />;

  const { user, orders, designs } = result;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline dark:text-teal-300"
      >
        <ArrowLeft className="size-4" aria-hidden /> All customers
      </Link>

      <header className="mt-4">
        <Badge
          variant="secondary"
          className="bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
        >
          Admin · Customer
        </Badge>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {user.name || "Unnamed customer"}
          </h1>
          {isNewCustomer(user.createdAt, now) && (
            <Badge className="bg-teal-600 text-white dark:bg-teal-500">
              New
            </Badge>
          )}
        </div>
        <p className="mt-2 text-muted-foreground">
          Registered {formatDate(user.createdAt)} · {orders.length}{" "}
          {orders.length === 1 ? "order" : "orders"} · {designs.length}{" "}
          {designs.length === 1 ? "design" : "designs"}
        </p>
      </header>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="-mt-1 mb-4 text-xs text-muted-foreground">
            Corrections here update the Sidestep record. The customer&apos;s
            own Clerk profile is unchanged and may overwrite these on their
            next sign-in edit.
          </p>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <InlineEditField
              label="Name"
              value={user.name}
              validate={(v) => validateRequiredText(v, "Name")}
              onSave={(name) => updateUser({ userId, name })}
            />
            <InlineEditField
              label="Email"
              type="email"
              value={user.email}
              validate={validateEmail}
              onSave={(email) => updateUser({ userId, email })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No orders started yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((order) => (
                <li key={order._id} className="flex flex-wrap gap-x-3 py-2.5">
                  <Link
                    href={`/admin/orders/${order._id}`}
                    className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-300"
                  >
                    {order.teamName}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {order.sport} · {order.estimatedQuantity} jerseys ·{" "}
                    {formatDate(order.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Designs</CardTitle>
        </CardHeader>
        <CardContent>
          {designs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No designs uploaded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {designs.map((design) => (
                <li key={design._id} className="flex flex-wrap gap-x-3 py-2.5">
                  <Link
                    href={`/admin/designs/${design._id}`}
                    className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-300"
                  >
                    {design.title}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {design.fileIds.length}{" "}
                    {design.fileIds.length === 1 ? "file" : "files"} ·{" "}
                    {formatDate(design.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="mt-4 h-10 w-72" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="mt-6 h-40 w-full" />
      ))}
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <p className="text-2xl font-semibold text-foreground">
        Customer not found
      </p>
      <p className="mt-2 text-muted-foreground">
        This account doesn&apos;t exist or has been deleted.
      </p>
      <Link
        href="/admin/customers"
        className="mt-6 inline-block text-sm text-teal-700 hover:underline dark:text-teal-300"
      >
        ← Back to all customers
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
