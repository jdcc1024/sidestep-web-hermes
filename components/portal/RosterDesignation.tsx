import {
  ROSTER_DESIGNATIONS,
  ROSTER_DESIGNATION_LABEL,
  type RosterDesignation,
} from "@/lib/rosterEntry";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { cn } from "@/lib/utils";

// The captain's letter, everywhere it appears (M-09) — the badge the list rows
// and breakdowns render and the picker the item sheet edits it with, together
// in one module so the C on a row, the C in the sheet, and the C on a
// production line can't come to look like three different things.
//
// UI only: no query, no mutation. The badge takes a designation, the picker
// takes one and hands one back; where it comes from and what saves it belong
// to the surface using them.

// The letter as it sits on a roster row. One character, because the rows are
// dense one-liners — the word is there for a screen reader and for a hover.
export function DesignationBadge({
  designation,
  className,
}: {
  designation: RosterDesignation | undefined;
  className?: string;
}) {
  if (!designation) return null;

  const label = ROSTER_DESIGNATION_LABEL[designation];
  return (
    <span
      title={label}
      className={cn(
        // Sized off the surrounding text rather than fixed, so it stays a
        // letter beside a name instead of a chip competing with the size
        // chips at the other end of the row.
        "inline-flex size-4.5 shrink-0 items-center justify-center rounded-sm border border-primary/40 bg-primary/10 text-[0.625rem] font-bold leading-none text-primary",
        className,
      )}
    >
      {designation}
      <span className="sr-only">{label}</span>
    </span>
  );
}

// "No letter" is a real option rather than an empty state, because taking the
// C off someone has to be as reachable as putting it on. A segmented radio
// group rather than a select: three choices, all of them one or two
// characters wide, and a select would hide two of the three behind a popup.
// The segments are the letters themselves (UX §4, "None / C / A") — the group
// is named "Captain letter" and each letter's word is its hover title. "No
// letter" rather than "None": a player's custom answer can be "None", and the
// edit sheet shows those answers right above this control.
export function DesignationPicker({
  value,
  onChange,
  disabled,
  label,
  className,
}: {
  value: RosterDesignation | undefined;
  onChange: (next: RosterDesignation | undefined) => void;
  disabled?: boolean;
  // The group's accessible name.
  label: string;
  className?: string;
}) {
  return (
    <RadioGroupPrimitive
      value={value ?? NONE}
      disabled={disabled}
      aria-label={label}
      onValueChange={(next) =>
        onChange(next === NONE ? undefined : (next as RosterDesignation))
      }
      className={cn(
        "inline-flex w-fit overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <Segment value={NONE}>No letter</Segment>
      {ROSTER_DESIGNATIONS.map((designation) => (
        <Segment
          key={designation}
          value={designation}
          title={ROSTER_DESIGNATION_LABEL[designation]}
        >
          {designation}
        </Segment>
      ))}
    </RadioGroupPrimitive>
  );
}

// The radio group's value for "wears nothing". A sentinel rather than "",
// which Base UI reads as "no selection at all" and would leave the group
// showing none of the three as chosen.
const NONE = "none";

function Segment({
  value,
  title,
  children,
}: {
  value: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <RadioPrimitive.Root
      value={value}
      title={title}
      className={cn(
        // 40px tall, ≥ 44px wide: a tap target, not a dot (UX §8.11).
        "inline-flex h-10 min-w-11 cursor-pointer items-center justify-center border-r border-border px-3 text-sm text-foreground outline-none transition-colors last:border-r-0",
        "hover:bg-muted focus-visible:relative focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-checked:bg-teal-50 data-checked:font-semibold data-checked:text-teal-700 dark:data-checked:bg-teal-500/15 dark:data-checked:text-teal-200",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      )}
    >
      {children}
    </RadioPrimitive.Root>
  );
}
