"use client";

import { useState } from "react";
import { useConvex } from "convex/react";
import { ConvexError } from "convex/values";
import { Download } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildOrderCsv, exportFilename } from "@/lib/orderExport";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = { orderId: Id<"orders"> };

// U+FEFF. Excel assumes the system codepage for a bare CSV, which mangles
// accented names in a file meant for a supplier; a BOM pins it to UTF-8.
const BOM = "﻿";

// "Export CSV" on the admin order detail page (3-03). Fetched on click
// rather than subscribed, because an export is a point-in-time snapshot —
// there is nothing to keep live, and a standing subscription would pull the
// whole entry list into every page view.
//
// The download is assembled client-side from a Blob rather than served by a
// route handler: admin authorization already lives in Convex
// (`requireAdmin`, keyed off `users.isAdmin`), so routing the bytes through
// Next would mean a second, weaker gate over the same data.
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

      const blob = new Blob([BOM, buildOrderCsv(data)], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFilename(data.teamName, Date.now());
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
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
