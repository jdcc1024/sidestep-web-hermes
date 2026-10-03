"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { parseDeadline } from "@/lib/jerseyRun";
import { userMessage } from "@/lib/userMessage";
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

// Making the order form (a "run" in code), from the order page's order form
// card (M-05, L-05). A deadline is the only decision, and this dialog is the
// only place it's asked on the order page: the form is created open, with the
// full size catalog, and the captain changes names mode, questions and the
// date afterwards in Form settings. Nothing creates a form implicitly — this
// button is the only path.
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
      // Convex is reactive — the order form card swaps to the form's status
      // on its own once the row lands.
      setOpen(false);
      setDeadline("");
      toast.success("Your order form is ready", {
        description: "Copy the link and share it with your team.",
      });
    } catch (err) {
      setError(
        userMessage(err, "Could not make the order form. Please try again."),
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
            className="h-10 bg-teal-600 px-3.5 font-semibold text-white hover:bg-teal-700"
          />
        }
      >
        Make an order form
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make an order form</DialogTitle>
          <DialogDescription>
            Pick the last day players can send their name, number and size.
            We&apos;ll give you a link to share with your team. You can change
            the date later in Form settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="order-form-deadline">Deadline</Label>
          <Input
            id="order-form-deadline"
            type="date"
            value={deadline}
            className="h-10"
            onChange={(e) => {
              setDeadline(e.target.value);
              setError(null);
            }}
          />
          <p className="text-sm text-muted-foreground">
            The form closes at the end of this day.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" className="h-10" />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            className="h-10"
            disabled={busy}
            onClick={() => void onStart()}
          >
            {busy ? "Making the form…" : "Make the form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
