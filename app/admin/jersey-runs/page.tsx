"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { describeDeadline } from "@/lib/jerseyRunDashboard";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey =
  | "teamName"
  | "captainName"
  | "responseCount"
  | "deadline"
  | "status"
  | "createdAt";

type SortDirection = "asc" | "desc";

type ColumnDef = {
  key: SortKey;
  label: string;
  numeric?: boolean;
};

const COLUMNS: ReadonlyArray<ColumnDef> = [
  { key: "teamName", label: "Team" },
  { key: "captainName", label: "Captain" },
  { key: "responseCount", label: "Responses", numeric: true },
  { key: "deadline", label: "Deadline", numeric: true },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Created", numeric: true },
];

export default function AdminJerseyRunsPage() {
  const runs = useQuery(api.admin.listJerseyRuns);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [direction, setDirection] = useState<SortDirection>("desc");

  const rows = useMemo(() => {
    if (!runs) return [];
    return [...runs].sort((a, b) => compareBy(a, b, sortKey, direction));
  }, [runs, sortKey, direction]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection(direction === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setDirection(
        key === "createdAt" || key === "deadline" || key === "responseCount"
          ? "desc"
          : "asc",
      );
    }
  };

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
          All jersey runs
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Every jersey run across every customer. Open one to see all responses
          and close it manually if needed.
        </p>
      </header>

      <Card className="mt-8 gap-0 p-0">
        {runs === undefined ? (
          <TableSkeleton label="Loading jersey runs" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No jersey runs yet"
            body="Runs appear here as captains create them on their orders."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  {COLUMNS.map((col) => (
                    <SortableHeader
                      key={col.key}
                      label={col.label}
                      active={sortKey === col.key}
                      direction={direction}
                      onClick={() => toggleSort(col.key)}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const deadlineStatus = describeDeadline(row.deadline);
                  return (
                    <tr
                      key={row._id}
                      className="transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 text-sm font-medium">
                        <Link
                          href={`/admin/jersey-runs/${row._id}`}
                          className="text-teal-700 hover:underline dark:text-teal-300"
                        >
                          {row.teamName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-foreground">
                          {row.captainName || "Unnamed captain"}
                        </div>
                        {row.captainEmail && (
                          <div className="text-xs text-muted-foreground">
                            {row.captainEmail}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {row.responseCount}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-foreground">
                          {formatDate(row.deadline)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {deadlineStatus.label}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <RunStatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </td>
                    </tr>
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

function RunStatusBadge({
  status,
}: {
  status: "open" | "closed" | "locked";
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

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
      >
        {label}
        <Icon
          aria-hidden
          className={`size-3 ${active ? "text-foreground" : "text-muted-foreground/60"}`}
        />
      </button>
    </th>
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

function compareBy<T extends Record<SortKey, unknown>>(
  a: T,
  b: T,
  key: SortKey,
  direction: SortDirection,
): number {
  const left = a[key];
  const right = b[key];
  const result =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), undefined, {
          sensitivity: "base",
        });
  return direction === "asc" ? result : -result;
}
