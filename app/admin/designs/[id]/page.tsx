"use client";

import Link from "next/link";
import { use } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { InlineEditField } from "@/components/InlineEditField";
import { DesignBlockEditor } from "@/components/design/DesignBlockEditor";
import {
  validateOptionalText,
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

export default function AdminDesignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const designId = id as Id<"designs">;
  const result = useQuery(api.admin.getDesign, { designId });
  const updateDesign = useMutation(api.admin.updateDesign);

  if (result === undefined) return <DetailSkeleton />;
  if (result === null) return <NotFound />;

  const { design, owner, assets, orders, viewer } = result;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/admin/designs"
        className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline dark:text-teal-300"
      >
        <ArrowLeft className="size-4" aria-hidden /> All designs
      </Link>

      <header className="mt-4">
        <Badge
          variant="secondary"
          className="bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
        >
          Admin · Design
        </Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {design.title}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {owner ? `${owner.name} · ${owner.email} · ` : "Owner missing · "}
          created {formatDate(design.createdAt)}
        </p>
      </header>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Design</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InlineEditField
            label="Title"
            value={design.title}
            validate={(v) => validateRequiredText(v, "Title")}
            onSave={(title) => updateDesign({ designId, title })}
          />
          {design.canvaLink && (
            <p className="text-xs">
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
        </CardContent>
      </Card>

      {/* The captain's own editing surface, mounted unchanged (D-06): staff
          write the brief and manage the files through the very mutations the
          portal calls, so an edit made here and an edit made there can't
          diverge. It sits on the page rather than inside a Card because the
          editor cards each block itself. */}
      <div className="mt-8">
        <DesignBlockEditor
          designId={design._id}
          blocks={design.blocks}
          assets={assets}
          viewer={viewer}
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Silhouette specs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="-mt-1 mb-4 text-xs text-muted-foreground">
            Specs live on the design, so every order that links it inherits
            this cut. Clear a field to leave it undecided.
          </p>
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <InlineEditField
              label="Jersey style"
              value={design.jerseyStyle ?? ""}
              validate={(v) => validateOptionalText(v, "Jersey style")}
              onSave={(jerseyStyle) => updateDesign({ designId, jerseyStyle })}
            />
            <InlineEditField
              label="Neckline"
              value={design.neckline ?? ""}
              validate={(v) => validateOptionalText(v, "Neckline")}
              onSave={(neckline) => updateDesign({ designId, neckline })}
            />
            <InlineEditField
              label="Sleeve style"
              value={design.sleeveStyle ?? ""}
              validate={(v) => validateOptionalText(v, "Sleeve style")}
              onSave={(sleeveStyle) => updateDesign({ designId, sleeveStyle })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Used by orders</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not linked to any order yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((order) => (
                <li key={order._id} className="py-2.5">
                  <Link
                    href={`/admin/orders/${order._id}`}
                    className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-300"
                  >
                    {order.teamName}
                  </Link>
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
      <p className="text-2xl font-semibold text-foreground">Design not found</p>
      <p className="mt-2 text-muted-foreground">
        This design doesn&apos;t exist or has been deleted.
      </p>
      <Link
        href="/admin/designs"
        className="mt-6 inline-block text-sm text-teal-700 hover:underline dark:text-teal-300"
      >
        ← Back to all designs
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
