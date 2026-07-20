"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { CopyInviteLinkButton } from "@/components/admin/CopyInviteLinkButton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const DESIGN_PREFERENCE_LABELS: Record<string, string> = {
  "own-design": "Has own design",
  "needs-help": "Needs design help",
  undecided: "Undecided",
};

export default function AdminLeadsPage() {
  const leads = useQuery(api.intakes.listIntakes);
  // Which lead's full brief is expanded. One at a time — the detail block is
  // tall, and comparing two briefs side by side isn't a real workflow.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header>
        <Badge
          variant="secondary"
          className="bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
        >
          Admin
        </Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Leads
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Every submission from the public intake form, newest first. Open a
          row for the full brief, then send the customer a portal invite link.
        </p>
      </header>

      <Card className="mt-8 gap-0 p-0">
        {leads === undefined ? (
          <TableSkeleton label="Loading leads" />
        ) : leads.length === 0 ? (
          <EmptyState
            title="No leads yet"
            body="Submissions from /intake will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  {["Name", "Team", "Sport", "Qty", "Brief", "Submitted"].map(
                    (label) => (
                      <th
                        key={label}
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((lead) => {
                  const open = openId === lead._id;
                  return (
                    <LeadRows
                      key={lead._id}
                      lead={lead}
                      open={open}
                      onToggle={() => setOpenId(open ? null : lead._id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function LeadRows({
  lead,
  open,
  onToggle,
}: {
  lead: Doc<"intakes">;
  open: boolean;
  onToggle: () => void;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <>
      <tr className="transition-colors hover:bg-muted/40">
        <td className="px-4 py-3 text-sm font-medium">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 text-teal-700 hover:underline dark:text-teal-300"
          >
            <Chevron className="size-4 shrink-0" aria-hidden />
            {lead.name}
          </button>
        </td>
        <td className="px-4 py-3 text-sm text-foreground">{lead.teamName}</td>
        <td className="px-4 py-3 text-sm text-foreground">{lead.sport}</td>
        <td className="px-4 py-3 text-sm text-foreground">
          {lead.estimatedQuantity}
        </td>
        <td className="max-w-xs truncate px-4 py-3 text-sm text-muted-foreground">
          {lead.brief}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {formatDate(lead.submittedAt)}
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/30">
          <td colSpan={6} className="px-4 py-5">
            <LeadDetail lead={lead} />
          </td>
        </tr>
      )}
    </>
  );
}

function LeadDetail({ lead }: { lead: Doc<"intakes"> }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Email"
          value={
            lead.email ? (
              <a
                href={`mailto:${lead.email}`}
                className="text-teal-700 hover:underline dark:text-teal-300"
              >
                {lead.email}
              </a>
            ) : (
              "—"
            )
          }
        />
        <Field label="Phone" value={lead.phone || "—"} />
        <Field
          label="Design preference"
          value={
            lead.designPreference
              ? (DESIGN_PREFERENCE_LABELS[lead.designPreference] ??
                lead.designPreference)
              : "—"
          }
        />
        <Field
          label="Usage"
          value={lead.usageContext?.join(", ") || "—"}
        />
        <Field
          label="Deadline"
          value={lead.deadline ? formatDate(lead.deadline) : "—"}
        />
        <Field
          label="Newsletter"
          value={lead.newsletterOptIn ? "Opted in" : "No"}
        />
      </dl>

      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Brief
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
          {lead.brief}
        </p>
      </div>

      {lead.questions && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Questions
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {lead.questions}
          </p>
        </div>
      )}

      {lead.inspirationLinks && lead.inspirationLinks.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Inspiration links
          </p>
          {/* Raw URLs the customer typed — rendered as links, never fetched
              or previewed. We don't host or touch their files. */}
          <ul className="mt-1 space-y-1">
            {lead.inspirationLinks.map((link) => (
              <li key={link} className="text-sm">
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-teal-700 hover:underline dark:text-teal-300"
                >
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CopyInviteLinkButton intakeId={lead._id} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-foreground">{value}</dd>
    </div>
  );
}

function TableSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2 p-4" aria-label={label}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
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
