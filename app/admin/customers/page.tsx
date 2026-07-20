"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { isNewCustomer } from "@/lib/adminRecords";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey = "name" | "email" | "createdAt" | "orderCount";
type SortDirection = "asc" | "desc";

const COLUMNS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "createdAt", label: "Registered" },
  { key: "orderCount", label: "Orders" },
];

export default function AdminCustomersPage() {
  const customers = useQuery(api.admin.listCustomers);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [direction, setDirection] = useState<SortDirection>("desc");

  // "New" is relative to when the page opened. Pinned in state so every
  // badge agrees on "now" and re-renders don't reach for the clock mid-render.
  const [now] = useState(() => Date.now());

  const rows = useMemo(() => {
    if (!customers) return [];
    return [...customers].sort((a, b) => compareBy(a, b, sortKey, direction));
  }, [customers, sortKey, direction]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection(direction === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setDirection(key === "createdAt" || key === "orderCount" ? "desc" : "asc");
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
          Customers
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Everyone with a Sidestep account. Click a name to open their profile
          and correct their details.
        </p>
      </header>

      <Card className="mt-8 gap-0 p-0">
        {customers === undefined ? (
          <TableSkeleton label="Loading customers" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No customers yet"
            body="Registered users will appear here."
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
                {rows.map((row) => (
                  <tr
                    key={row._id}
                    className="transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 text-sm font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Clerk profiles can carry no name at all — never
                            render an empty, unclickable link. */}
                        <Link
                          href={`/admin/customers/${row._id}`}
                          className="text-teal-700 hover:underline dark:text-teal-300"
                        >
                          {row.name || "Unnamed customer"}
                        </Link>
                        {isNewCustomer(row.createdAt, now) && (
                          <Badge className="bg-teal-600 text-white dark:bg-teal-500">
                            New
                          </Badge>
                        )}
                        {row.isAdmin && (
                          <Badge
                            variant="secondary"
                            className="bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
                          >
                            Admin
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {row.email}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {row.orderCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
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
