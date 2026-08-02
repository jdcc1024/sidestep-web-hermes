"use client";

import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOwnedResource } from "@/lib/ownedResource";
import {
  CANVA_LINK_MAX_LENGTH,
  JERSEY_STYLE_MAX_LENGTH,
  NECKLINES,
  SLEEVE_STYLES,
  TITLE_MAX_LENGTH,
  isHttpUrl,
} from "@/lib/design";
import { InlineEditField } from "@/components/InlineEditField";
import { DesignBlockEditor } from "@/components/design/DesignBlockEditor";
import { DesignSpecPicker } from "@/components/design/DesignSpecPicker";

type PageProps = {
  params: Promise<{ id: string }>;
};

// The captain's design page. Since D-10 it has one mode: the brief is written
// through the block editor, the files through the asset pool, and the title,
// the cut and the Canva link are edited where they're shown. There is no edit
// form to open — `designs.updateDesign` takes one field at a time, so each
// save is exactly the change that was made and can't clobber anything else on
// the design.
export default function DesignDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const designId = id as Id<"designs">;
  // A `null` here means "not yours" only once Convex knows who's asking —
  // before that it's just the token still attaching (B-03).
  const result = useOwnedResource(
    useQuery(api.designs.getMyDesign, { designId }),
  );
  const updateDesign = useMutation(api.designs.updateDesign);

  if (result.status === "loading") {
    return <Loading />;
  }

  if (result.status === "not-found") {
    return <NotFound />;
  }

  const design = result.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/portal"
        className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
      >
        ← Back to dashboard
      </Link>

      <header className="mt-3">
        <p className="text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          Design
        </p>
        <div className="mt-2">
          <InlineEditField
            label="Title"
            variant="heading"
            headingLevel={1}
            value={design.title}
            validate={validateTitle}
            onSave={(title) => updateDesign({ designId, title })}
          />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Created {formatDate(design.createdAt)}
          {design.updatedAt !== design.createdAt && (
            <span> · Updated {formatDate(design.updatedAt)}</span>
          )}
        </p>
      </header>

      <div className="mt-10">
        <DesignBlockEditor
          designId={design._id}
          blocks={design.blocks}
          assets={design.assets}
          viewer={design.viewer}
        />
      </div>

      {/* Specs and the Canva link stay fixed sections rather than blocks
          (PRD §5) — they're the same three questions on every design, so
          there's nothing to add or reorder. Blank is a legitimate answer:
          Sidestep helps decide the cut when the captain hasn't. */}
      <section className="mt-10" aria-labelledby="design-cut-heading">
        <h2
          id="design-cut-heading"
          className="text-base font-semibold text-foreground"
        >
          The cut
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The silhouette this artwork lives on. Leave anything undecided and
          Sidestep will help you choose.
        </p>
        <div className="mt-4 grid gap-5 rounded-lg border border-border bg-card px-4 py-4 sm:grid-cols-3">
          <InlineEditField
            label="Jersey style"
            value={design.jerseyStyle ?? ""}
            placeholder="Not decided"
            validate={validateJerseyStyle}
            onSave={(jerseyStyle) => updateDesign({ designId, jerseyStyle })}
          />
          <DesignSpecPicker
            label="Neckline"
            value={design.neckline ?? ""}
            options={NECKLINES}
            onSave={(neckline) => updateDesign({ designId, neckline })}
          />
          <DesignSpecPicker
            label="Sleeve style"
            value={design.sleeveStyle ?? ""}
            options={SLEEVE_STYLES}
            onSave={(sleeveStyle) => updateDesign({ designId, sleeveStyle })}
          />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="design-canva-heading">
        <h2
          id="design-canva-heading"
          className="text-base font-semibold text-foreground"
        >
          Canva
        </h2>
        <div className="mt-3 rounded-lg border border-border bg-card px-4 py-4">
          <InlineEditField
            label="Canva link"
            type="text"
            value={design.canvaLink ?? ""}
            placeholder="No link yet"
            validate={validateCanvaLink}
            onSave={(canvaLink) => updateDesign({ designId, canvaLink })}
          />
          {design.canvaLink && (
            <a
              href={design.canvaLink}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
            >
              Open in Canva
              <span aria-hidden>↗</span>
            </a>
          )}
        </div>
      </section>
    </div>
  );
}

// Client-side copies of what `designs.updateDesign` will re-run, so a
// rejected value is caught under the field rather than in a toast.
function validateTitle(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Give your design a title.";
  if (trimmed.length > TITLE_MAX_LENGTH)
    return `Please keep the title under ${TITLE_MAX_LENGTH} characters.`;
  return null;
}

function validateJerseyStyle(value: string): string | null {
  if (value.trim().length > JERSEY_STYLE_MAX_LENGTH)
    return `Please keep the jersey style under ${JERSEY_STYLE_MAX_LENGTH} characters.`;
  return null;
}

function validateCanvaLink(value: string): string | null {
  const trimmed = value.trim();
  // Blank clears the link — a design doesn't have to have one.
  if (!trimmed) return null;
  if (trimmed.length > CANVA_LINK_MAX_LENGTH) return "That link is too long.";
  if (!isHttpUrl(trimmed)) return "Paste a full link starting with https://";
  return null;
}

function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading design"
      className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
    >
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
