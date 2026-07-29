"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { parseDeadline } from "@/lib/jerseyRun";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Run creation, moved onto the order page (M-05). With sizes gone and names
// mode relocated, the old setup form was one field — sending a captain to a
// separate page to fill it in was the disjointedness this slice removes.
//
// A deadline is the only decision: the run is created open, with the full
// size catalog, and the captain switches names mode and edits questions
// afterwards. Nothing creates a run implicitly — this button is the only path.
export function StartCollecting({ orderId }: { orderId: Id<"orders"> }) {
  const createRun = useMutation(api.jerseyRuns.create);
  const [open, setOpen] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onStart() {
    const ms = parseDeadline(deadline);
    if (ms === null) {
      setError("Pick a deadline date.");
      return;
    }
    if (ms < Date.now()) {
      setError("Deadline must be in the future.");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await createRun({ orderId, deadline: ms });
      // Convex is reactive — the collect card swaps to the run status on its
      // own once the row lands.
      setOpen(false);
      setDeadline("");
      toast.success("You're collecting", {
        description: "Share the link with your team to gather sizes.",
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Please try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            size="lg"
            className="bg-teal-600 font-semibold text-white hover:bg-teal-700"
          />
        }
      >
        Start collecting
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start collecting</DialogTitle>
          <DialogDescription>
            Pick the day submissions close. We&apos;ll give you a link to share
            with your team — you can change the date later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="start-collecting-deadline">Deadline</Label>
          <Input
            id="start-collecting-deadline"
            type="date"
            value={deadline}
            onChange={(e) => {
              setDeadline(e.target.value);
              setError(null);
            }}
          />
          <p className="text-sm text-muted-foreground">
            Submissions close at the end of this day.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button type="button" disabled={busy} onClick={() => void onStart()}>
            {busy ? "Starting…" : "Start collecting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
