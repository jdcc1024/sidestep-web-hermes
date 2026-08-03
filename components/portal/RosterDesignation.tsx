import {
  ROSTER_DESIGNATIONS,
  ROSTER_DESIGNATION_LABEL,
  type RosterDesignation,
} from "@/lib/rosterEntry";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

// The captain's letter, everywhere it appears (M-09) — the badge three roster
// surfaces render and the picker the roster sheet edits it with, together in
// one module so the C on a design card, the C in the sheet, and the C on a
// production line can't come to look like three different things.
//
// UI only: no query, no mutation. The badge takes a designation, the picker
// takes one and hands one back; where it comes from and what saves it belong
// to the surface using them.

// The letter as it sits on a roster row. One character, because the rows are
// dense one-liners — the word is there for a screen reader and for a hover,
// which is the same trade the collision flag beside it makes.
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
// C off someone has to be as reachable as putting it on. Radios rather than a
// select: three choices, all of them one or two characters wide, and a select
// would hide two of the three behind a popup on the surface where the captain
// is already deciding.
export function DesignationPicker({
  value,
  onChange,
  disabled,
  label,
}: {
  value: RosterDesignation | undefined;
  onChange: (next: RosterDesignation | undefined) => void;
  disabled?: boolean;
  // Names the group against the player it belongs to, so a fifteen-row roster
  // in edit mode doesn't announce fifteen identical "Letter" groups.
  label: string;
}) {
  return (
    <RadioGroup
      value={value ?? NONE}
      disabled={disabled}
      aria-label={label}
      onValueChange={(next) =>
        onChange(next === NONE ? undefined : (next as RosterDesignation))
      }
      className="flex flex-wrap items-center gap-x-4 gap-y-1"
    >
      <Option value={NONE} text="No letter" />
      {ROSTER_DESIGNATIONS.map((designation) => (
        <Option
          key={designation}
          value={designation}
          text={`${ROSTER_DESIGNATION_LABEL[designation]} (${designation})`}
        />
      ))}
    </RadioGroup>
  );
}

// The radio group's value for "wears nothing". A sentinel rather than "",
// which Base UI reads as "no selection at all" and would leave the group
// showing none of the three as chosen.
const NONE = "none";

function Option({ value, text }: { value: string; text: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground has-[[data-checked]]:font-medium has-[[data-checked]]:text-foreground">
      <RadioGroupItem value={value} className="size-3.5" />
      {text}
    </label>
  );
}
