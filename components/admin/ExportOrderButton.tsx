"use client";

import { useState } from "react";
import { useConvex } from "convex/react";
import { ConvexError } from "convex/values";
import { Download } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { downloadCsv } from "@/lib/csv";
import { buildOrderCsv, exportFilename } from "@/lib/orderExport";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = { orderId: Id<"orders"> };

// "Export CSV" on the admin order detail page (3-03). Fetched on click
// rather than subscribed, because an export is a point-in-time snapshot —
// there is nothing to keep live, and a standing subscription would pull the
// whole entry list into every page view. The BOM-and-Blob download itself
// lives in `lib/csv.ts`, shared with the roster export (M-08).
export function ExportOrderButton({ orderId }: Props) {
  const convex = useConvex();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const data = await convex.query(api.admin.exportOrder, { orderId });
      if (!data) {
        setError("This order no longer exists.");
        return;
      }

      downloadCsv(
        exportFilename(data.teamName, Date.now()),
        buildOrderCsv(data),
      );
    } catch (err) {
      const message =
        err instanceof ConvexError
          ? String(err.data)
          : err instanceof Error
            ? err.message
            : "Export failed.";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <Button
        variant="outline"
        onClick={handleExport}
        disabled={pending}
        aria-busy={pending}
      >
        <Download aria-hidden />
        {pending ? "Preparing…" : "Export CSV"}
      </Button>
      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
