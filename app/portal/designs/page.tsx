"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { overviewOf } from "@/lib/designBlock";

const OVERVIEW_PREVIEW_CHARS = 160;

export default function MyDesignsPage() {
  const designs = useQuery(api.designs.listMyDesigns);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            Designs
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            My Designs
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Briefs, mood boards, and reference files you&apos;ve shared with Sidestep.
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
      </header>

      <div className="mt-8">
        {designs === undefined ? (
          <GridSkeleton />
        ) : designs.length === 0 ? (
          <EmptyDesigns />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {designs.map((design) => (
              <li key={design._id}>
                <DesignCard design={design} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
      <p className="mt-auto pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {fileCount === 0
          ? "No files yet"
          : `${fileCount} file${fileCount === 1 ? "" : "s"}`}
      </p>
    </Link>
  );
}

function EmptyDesigns() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
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
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <h2 className="mt-4 text-base font-semibold text-foreground">
        No designs yet
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Upload your team logo, mood board, or reference photos so Sidestep can
        get started.
      </p>
      <Link
        href="/portal/designs/new"
        className={cn(
          buttonVariants({ size: "lg" }),
          "mt-5 bg-teal-600 font-semibold text-white shadow-sm hover:bg-teal-700",
        )}
      >
        Upload a design <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function GridSkeleton() {
  return (
    <ul
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Loading"
    >
      {[0, 1, 2].map((i) => (
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
