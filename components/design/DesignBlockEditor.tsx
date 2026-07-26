"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { StoredDesignBlock } from "@/convex/_designBlocks";
import {
  TEXT_BODY_MAX_LENGTH,
  TEXT_FIELD_LABELS,
  availableTextFields,
  blockHeading,
  indexOfBlock,
  isRequiredBlock,
  newTextBlock,
  validateBlocks,
  type TextField,
} from "@/lib/designBlock";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DesignBlockBody,
  EmptyBrief,
  type BlockAsset,
} from "./DesignBlocks";

// The shared block editor (D-03) — the one editing surface for a design's
// brief, mounted by the portal design page now and the admin page in D-06.
//
// It writes through the four narrow mutations in convex/designs.ts rather than
// holding a draft of the whole brief: each change is sent on its own, so the
// list you see is always the stored list (Convex pushes it back), and two
// people editing the same design can't clobber each other's blocks.
//
// The only local state is what isn't committed yet — the section being typed,
// the body being edited, and which block the pointer is dragging.
//
// This slice ships the text sections and reorder. Gallery and palette blocks
// render read-only here through the same `DesignBlockBody` the read page uses;
// their editors (and their entries in the add menu) arrive with D-04 and D-05.

export function DesignBlockEditor({
  designId,
  blocks,
  assets,
}: {
  designId: Id<"designs">;
  blocks: readonly StoredDesignBlock[];
  assets: readonly BlockAsset[];
}) {
  const addBlock = useMutation(api.designs.addBlock);
  const updateBlock = useMutation(api.designs.updateBlock);
  const removeBlock = useMutation(api.designs.removeBlock);
  const moveBlock = useMutation(api.designs.moveBlock);

  // An unsaved new section: chosen from the menu, not stored until it has a
  // body. Adding an empty text block would fail the D-02 validator, and
  // relaxing that rule would let a design carry blank headings.
  const [draft, setDraft] = useState<{ field: TextField; body: string } | null>(
    null,
  );
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const available = availableTextFields(blocks);

  // Every write goes through here: one busy flag, one place errors become a
  // toast. `onDone` runs only on success, so a rejected save leaves the
  // textarea open with what the user typed still in it.
  async function run(
    label: string,
    call: () => Promise<unknown>,
    onDone?: () => void,
  ) {
    setBusy(true);
    try {
      await call();
      onDone?.();
    } catch (err) {
      toast.error(label, {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  // Client-side check against the very validator the mutation will re-run, so
  // the message the user reads is the message the server would have sent.
  function firstProblem(next: readonly StoredDesignBlock[]): string | null {
    return validateBlocks(next);
  }

  function onSaveDraft() {
    if (!draft) return;
    const block = newTextBlock(draft.field, draft.body);
    const problem = firstProblem([...blocks, block]);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    void run("Could not add that section", () => addBlock({ designId, block }), () =>
      setDraft(null),
    );
  }

  function onSaveEdit() {
    if (!editing) return;
    const index = indexOfBlock(blocks, editing.id);
    const current = blocks[index];
    if (!current || current.kind !== "text") return;

    const block: StoredDesignBlock = { ...current, body: editing.body };
    const next = [...blocks];
    next[index] = block;
    const problem = firstProblem(next);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    void run(
      "Could not save that section",
      () => updateBlock({ designId, block }),
      () => setEditing(null),
    );
  }

  function onRemove(block: StoredDesignBlock) {
    void run("Could not remove that block", () =>
      removeBlock({ designId, blockId: block.id }),
    );
  }

  function onMove(blockId: string, toIndex: number) {
    void run("Could not reorder the brief", () =>
      moveBlock({ designId, blockId, toIndex }),
    );
  }

  function onDrop(toIndex: number) {
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const from = indexOfBlock(blocks, id);
    // A drop on the block you picked up, or on a block that vanished
    // mid-drag, is a no-op rather than a pointless round-trip.
    if (from < 0 || from === toIndex) return;
    onMove(id, toIndex);
  }

  return (
    <section aria-labelledby="design-brief-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="design-brief-heading"
          className="text-base font-semibold text-foreground"
        >
          Brief
        </h2>
        <AddSectionMenu
          available={available}
          disabled={busy || draft !== null}
          onPick={(field) => {
            setError(null);
            setEditing(null);
            setDraft({ field, body: "" });
          }}
        />
      </div>

      {blocks.length === 0 && !draft ? (
        <div className="mt-4">
          <EmptyBrief />
        </div>
      ) : (
        <ol aria-label="Brief blocks" className="mt-4 space-y-4">
          {blocks.map((block, index) => (
            <li
              key={block.id}
              data-testid="block-card"
              className={`rounded-lg border bg-card transition-colors ${
                dragId === block.id
                  ? "border-teal-500 opacity-60"
                  : "border-border"
              }`}
              onDragOver={(e) => {
                if (dragId) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(index);
              }}
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                {blocks.length > 1 && (
                  // Mouse-only affordance: the move buttons beside it are the
                  // keyboard and touch path, so the grip stays out of the
                  // accessibility tree rather than announcing a control that
                  // needs a pointer to work.
                  <span
                    data-testid="block-drag-handle"
                    aria-hidden
                    draggable
                    onDragStart={(e) => {
                      setDragId(block.id);
                      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDragId(null)}
                    className="cursor-grab text-muted-foreground active:cursor-grabbing"
                  >
                    <GripVerticalIcon className="size-4" />
                  </span>
                )}

                <h3 className="flex-1 truncate text-sm font-semibold text-foreground">
                  {blockHeading(block)}
                </h3>

                <span className="flex items-center gap-0.5">
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={`Move ${blockHeading(block)} up`}
                      onClick={() => onMove(block.id, index - 1)}
                    >
                      <ChevronUpIcon />
                    </Button>
                  )}
                  {index < blocks.length - 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={`Move ${blockHeading(block)} down`}
                      onClick={() => onMove(block.id, index + 1)}
                    >
                      <ChevronDownIcon />
                    </Button>
                  )}
                  {block.kind === "text" && editing?.id !== block.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={`Edit ${blockHeading(block)}`}
                      onClick={() => {
                        setError(null);
                        setDraft(null);
                        setEditing({ id: block.id, body: block.body });
                      }}
                    >
                      <PencilIcon />
                    </Button>
                  )}
                  {/* The Overview is the design's description — the server
                      refuses to drop it, so we don't offer a button that
                      always fails. */}
                  {!isRequiredBlock(block) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label={`Remove ${blockHeading(block)}`}
                      onClick={() => onRemove(block)}
                    >
                      <XIcon />
                    </Button>
                  )}
                </span>
              </div>

              <div className="px-4 py-4">
                {editing?.id === block.id ? (
                  <BodyEditor
                    label={blockHeading(block)}
                    value={editing.body}
                    error={error}
                    busy={busy}
                    saveLabel="Save"
                    onChange={(body) => setEditing({ id: block.id, body })}
                    onSave={onSaveEdit}
                    onCancel={() => {
                      setEditing(null);
                      setError(null);
                    }}
                  />
                ) : (
                  <DesignBlockBody block={block} assets={assets} />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {draft && (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-card px-4 py-4">
          <h3 className="text-sm font-semibold text-foreground">
            {TEXT_FIELD_LABELS[draft.field]}
          </h3>
          <div className="mt-3">
            <BodyEditor
              label={TEXT_FIELD_LABELS[draft.field]}
              value={draft.body}
              error={error}
              busy={busy}
              saveLabel="Add section"
              onChange={(body) => setDraft({ field: draft.field, body })}
              onSave={onSaveDraft}
              onCancel={() => {
                setDraft(null);
                setError(null);
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

// The add menu is a row of buttons rather than a dropdown: there are at most
// four sections, and showing which ones are still open is more useful than
// hiding them behind a click.
function AddSectionMenu({
  available,
  disabled,
  onPick,
}: {
  available: readonly TextField[];
  disabled: boolean;
  onPick: (field: TextField) => void;
}) {
  if (available.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        All four sections are in use.
      </p>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {available.map((field) => (
        <Button
          key={field}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onPick(field)}
        >
          <PlusIcon />
          Add {TEXT_FIELD_LABELS[field]}
        </Button>
      ))}
    </div>
  );
}

// Shared by the "new section" draft and the in-place edit — same textarea,
// same character counter, same save/cancel pair, so writing a section feels
// identical whether it's the first time or the fifth.
function BodyEditor({
  label,
  value,
  error,
  busy,
  saveLabel,
  onChange,
  onSave,
  onCancel,
}: {
  label: string;
  value: string;
  error: string | null;
  busy: boolean;
  saveLabel: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <Textarea
        aria-label={label}
        autoFocus
        rows={5}
        value={value}
        maxLength={TEXT_BODY_MAX_LENGTH}
        placeholder="Theme, colors, references, anything we should know."
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {TEXT_BODY_MAX_LENGTH - value.length} characters left
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
