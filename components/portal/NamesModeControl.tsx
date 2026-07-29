"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { NamesMode } from "@/lib/jerseyRun";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// The names-mode switch (M-05), moved off Run Setup and up beside the designs
// whose rosters it governs — in fixed mode the seeded roster *is* the
// fan-facing picker list, so the consequence of the choice is only legible
// next to the design cards.
//
// Switches freely in both directions, at any time, with no confirmation: fan-
// typed names are already `rosterEntries`, so open → fixed promotes them into
// the picker and fixed → open only loosens a constraint. Neither loses data
// (PRD §6). A locked run has no control at all — every write would reject.
export function NamesModeControl({
  runId,
  namesMode,
  locked,
}: {
  runId: Id<"jerseyRuns">;
  namesMode: NamesMode;
  locked: boolean;
}) {
  const setNamesMode = useMutation(api.jerseyRuns.setNamesMode);
  const [busy, setBusy] = useState(false);

  async function onChange(next: string) {
    if (next === namesMode) return;
    setBusy(true);
    try {
      await setNamesMode({ jerseyRunId: runId, namesMode: next as NamesMode });
    } catch (err) {
      toast.error("Could not change how names are collected", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="names-mode-heading"
      className="mt-4 rounded-lg border border-border bg-card p-4"
    >
      <h3
        id="names-mode-heading"
        className="text-sm font-semibold text-foreground"
      >
        Names &amp; numbers
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {locked
          ? "This run is locked, so how names are collected can no longer change."
          : "How each person picks their name on the form. Switch any time — nothing is lost either way."}
      </p>

      {locked ? (
        <p className="mt-3 text-sm font-medium text-foreground">
          {namesMode === "fixed"
            ? "Fixed roster — fans picked from your list."
            : "Open — fans typed their own names."}
        </p>
      ) : (
        <RadioGroup
          value={namesMode}
          onValueChange={(value) => void onChange(value)}
          aria-label="How names are collected"
          className="mt-3 grid gap-2 sm:grid-cols-2"
          disabled={busy}
        >
          <ModeOption
            value="open"
            title="Open"
            description="Each person types their own name and number."
          />
          <ModeOption
            value="fixed"
            title="Fixed roster"
            description="Fans pick from the roster you seed on each design."
          />
        </RadioGroup>
      )}
    </section>
  );
}

function ModeOption({
  value,
  title,
  description,
}: {
  value: NamesMode;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-background p-4 transition hover:border-ring has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
