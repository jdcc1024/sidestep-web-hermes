"use client";

import { ChevronDownIcon, ChevronUpIcon, PlusIcon, XIcon } from "lucide-react";

import {
  CAPTION_MAX_LENGTH,
  DEFAULT_SWATCH_HEX,
  PANTONE_CODE_MAX_LENGTH,
  SWATCH_LABEL_MAX_LENGTH,
  SWATCH_ROLES,
  SWATCH_ROLE_LABELS,
  addSwatch,
  moveSwatch,
  normalizeHex,
  patchSwatch,
  removeSwatchAt,
  type PaletteBlock,
  type Swatch,
  type SwatchRole,
} from "@/lib/designBlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The palette block's editing surface (D-04), mounted by DesignBlockEditor
// inside the palette's card. Self-contained and controlled: it renders the
// draft block it's handed and reports every edit back through `onChange`, so
// the owner of the draft (and of the save) stays the block editor — the same
// arrangement its text sections use.
//
// Every edit runs through lib/designBlock's pure swatch functions; this file
// is layout, labels and the color picker, nothing else.

// A design carries at most one palette, so the row index is the swatch's
// identity on screen ("Swatch 2") — stable enough to label controls with and
// far more readable than a uuid.
export function PaletteEditor<T extends PaletteBlock>({
  block,
  error,
  busy,
  saveLabel,
  onChange,
  onSave,
  onCancel,
}: {
  block: T;
  error: string | null;
  busy: boolean;
  saveLabel: string;
  onChange: (block: T) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <Input
        aria-label="Palette caption"
        placeholder="Caption (optional) — e.g. Home kit colors"
        value={block.caption ?? ""}
        maxLength={CAPTION_MAX_LENGTH}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
      />

      {block.swatches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No colors yet — add one and pick it on screen.
        </p>
      ) : (
        <ol aria-label="Swatches" className="space-y-3">
          {block.swatches.map((swatch, index) => (
            <li
              key={swatch.id}
              data-testid="swatch-row"
              className="rounded-lg border border-border bg-background"
            >
              <SwatchRow
                swatch={swatch}
                position={index + 1}
                count={block.swatches.length}
                busy={busy}
                onPatch={(patch) => onChange(patchSwatch(block, index, patch))}
                onMove={(to) => onChange(moveSwatch(block, index, to))}
                onRemove={() => onChange(removeSwatchAt(block, index))}
              />
            </li>
          ))}
        </ol>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => onChange(addSwatch(block))}
      >
        <PlusIcon />
        Add color
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Hex is what you see; the Pantone code is what production prints.
        </p>
        <span className="flex items-center gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={onSave}>
            {saveLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function SwatchRow({
  swatch,
  position,
  count,
  busy,
  onPatch,
  onMove,
  onRemove,
}: {
  swatch: Swatch;
  position: number;
  count: number;
  busy: boolean;
  onPatch: (patch: Partial<Swatch>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const index = position - 1;
  // The picker only speaks canonical lowercase `#rrggbb`. The text field keeps
  // whatever was typed — "102a44" mid-paste is not yet a color — so an
  // unparseable value parks the picker on the default rather than fighting it.
  const picked = normalizeHex(swatch.hex)?.toLowerCase() ?? DEFAULT_SWATCH_HEX;

  return (
    <>
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
        <span className="flex-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Swatch {position}
        </span>
        {index > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={`Move swatch ${position} up`}
            onClick={() => onMove(index - 1)}
          >
            <ChevronUpIcon />
          </Button>
        )}
        {index < count - 1 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={`Move swatch ${position} down`}
            onClick={() => onMove(index + 1)}
          >
            <ChevronDownIcon />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label={`Remove swatch ${position}`}
          onClick={onRemove}
        >
          <XIcon />
        </Button>
      </div>

      <div className="flex items-start gap-3 p-3">
        {/* Native picker per PRD §7 — no color library, and the OS one is
            already the control people know. */}
        <input
          type="color"
          aria-label={`Swatch ${position} color`}
          value={picked}
          disabled={busy}
          onChange={(e) =>
            onPatch({ hex: normalizeHex(e.target.value) ?? e.target.value })
          }
          className="h-16 w-14 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
        />

        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <Input
            aria-label={`Swatch ${position} hex`}
            value={swatch.hex}
            placeholder="#102A44"
            spellCheck={false}
            className="font-mono"
            onChange={(e) => onPatch({ hex: e.target.value })}
          />

          {/* Native select rather than the shadcn one: three short options in a
              dense row, and it stays operable with a keyboard on touch. */}
          <select
            aria-label={`Swatch ${position} role`}
            value={swatch.role ?? ""}
            onChange={(e) =>
              onPatch({
                role: e.target.value ? (e.target.value as SwatchRole) : undefined,
              })
            }
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">No role</option>
            {SWATCH_ROLES.map((role) => (
              <option key={role} value={role}>
                {SWATCH_ROLE_LABELS[role]}
              </option>
            ))}
          </select>

          <Input
            aria-label={`Swatch ${position} label`}
            value={swatch.label ?? ""}
            placeholder="Label (optional)"
            maxLength={SWATCH_LABEL_MAX_LENGTH}
            onChange={(e) => onPatch({ label: e.target.value })}
          />

          <Input
            aria-label={`Swatch ${position} Pantone code`}
            value={swatch.pantoneCode ?? ""}
            placeholder="Pantone code (optional)"
            maxLength={PANTONE_CODE_MAX_LENGTH}
            onChange={(e) => onPatch({ pantoneCode: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}
