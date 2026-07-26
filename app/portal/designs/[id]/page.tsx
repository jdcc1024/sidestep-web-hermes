"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DesignForm } from "@/components/portal/DesignForm";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function DesignDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const designId = id as Id<"designs">;
  const design = useQuery(api.designs.getMyDesign, { designId });
  const [editing, setEditing] = useState(false);

  if (design === undefined) {
    return <Loading />;
  }

  if (design === null) {
    return <NotFound />;
  }

  if (editing) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <Link
          href={`/portal/designs/${design._id}`}
          onClick={(e) => {
            e.preventDefault();
            setEditing(false);
          }}
          className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
        >
          ← Cancel edit
        </Link>
        <header className="mt-3">
          <p className="text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            Edit design
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {design.title}
          </h1>
        </header>
        <div className="mt-10">
          <DesignForm
            mode={{
              kind: "edit",
              designId: design._id,
              initialTitle: design.title,
              initialBrief: design.brief,
              initialCanvaLink: design.canvaLink ?? "",
              initialJerseyStyle: design.jerseyStyle ?? "",
              initialNeckline: design.neckline ?? "",
              initialSleeveStyle: design.sleeveStyle ?? "",
              existingFileCount: design.assets.length,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/portal"
        className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
      >
        ← Back to dashboard
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            Design
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {design.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Created {formatDate(design.createdAt)}
            {design.updatedAt !== design.createdAt && (
              <span> · Updated {formatDate(design.updatedAt)}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded-md border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/40"
        >
          Edit design
        </button>
      </header>

      <section className="mt-10">
        <h2 className="text-base font-semibold text-foreground">Brief</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
          {design.brief}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-foreground">The cut</h2>
        {design.jerseyStyle || design.neckline || design.sleeveStyle ? (
          <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SpecItem label="Jersey style" value={design.jerseyStyle} />
            <SpecItem label="Neckline" value={design.neckline} />
            <SpecItem label="Sleeve style" value={design.sleeveStyle} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            The silhouette isn&apos;t decided yet — Sidestep will help you choose.
          </p>
        )}
      </section>

      {design.canvaLink && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-foreground">Canva</h2>
          <a
            href={design.canvaLink}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-1 break-all text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
          >
            {design.canvaLink}
            <span aria-hidden>↗</span>
          </a>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-base font-semibold text-foreground">
          Files ({design.assets.length})
        </h2>
        {design.assets.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No files attached.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {design.assets.map((asset) => (
              <li
                key={asset._id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="truncate text-sm text-foreground/90">
                  {asset.filename}
                </span>
                {asset.url ? (
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">Unavailable</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SpecItem({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground/90">
        {value || <span className="text-muted-foreground">Not set</span>}
      </dd>
    </div>
  );
}

function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-10 w-2/3 animate-pulse rounded bg-muted" />
      <div className="mt-8 h-32 animate-pulse rounded bg-muted" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-foreground">Design not found</h1>
      <p className="mt-2 text-muted-foreground">
        We couldn&apos;t find that design — it may have been removed.
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

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
