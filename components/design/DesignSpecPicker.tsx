"use client";

import { useId, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

// A silhouette spec that comes from an allowlist — neckline, sleeve style
// (D-10). Two or three legal answers is too few to hide behind a pencil and a
// Save button, so the options are always on screen and picking one *is* the
// edit: one click, one write.
//
// "Not decided" is a real option rather than an empty state, because a design
// is allowed to not have decided yet (PRD §6) and going back to undecided has
// to be as easy as choosing. It saves the empty string, which is what
// `designs.updateDesign` reads as "clear this spec".
//
// Free-text specs (jersey style) keep the InlineEditField treatment — there's
// no list to render.
export function DesignSpecPicker({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onSave: (next: string) => Promise<unknown> | unknown;
}) {
  const labelId = useId();
  const [saving, setSaving] = useState(false);

  async function pick(next: string) {
    // Clicking what's already stored is a no-op, not a round-trip.
    if (next === value) return;
    setSaving(true);
    try {
      await onSave(next);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : `Couldn't update ${label.toLowerCase()}.`,
      );
    } finally {
      setSaving(false);
    }
  }

  // A design stored before the allowlist settled can hold a value that isn't
  // on it. Carry it as an extra option rather than dropping it: the row would
  // otherwise read "nothing chosen" for a design that has chosen, and the next
  // click would overwrite an answer the captain never saw.
  const choices =
    value && !options.includes(value)
      ? ["", ...options, value]
      : ["", ...options];

  return (
    <div>
      <p
        id={labelId}
        className="text-xs uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="mt-1.5 flex flex-wrap gap-1.5"
      >
        {choices.map((option) => {
          const checked = option === value;
          return (
            <button
              key={option || "undecided"}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={saving}
              onClick={() => void pick(option)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-60",
                checked
                  ? "border-teal-600 bg-teal-600 font-medium text-white"
                  : "border-input text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {option || "Not decided"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
