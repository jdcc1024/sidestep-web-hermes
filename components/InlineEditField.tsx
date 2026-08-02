"use client";

import { useId, useState } from "react";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// The record-editing primitive (issue 2-13). A field reads as plain text with
// a pencil; clicking it swaps in an input with Save/Cancel. Every detail
// surface — admin customer, order and design pages, and the captain's own
// design page since D-10 — is built from these, so correcting a record never
// means a separate "edit mode" for a whole page.
//
// `onSave` receives the trimmed value and owns the mutation call. Validation
// is injected the same way, so this component knows nothing about which field
// it's editing — the rules live in lib/adminRecords next to the server's.
//
// The `heading` variant is the same control worn as a page title: the label
// becomes the accessible name of the pencil rather than a caption above it,
// so a page can edit its title in place instead of repeating it in a field
// underneath (D-10).
export function InlineEditField({
  label,
  value,
  onSave,
  validate,
  multiline = false,
  type = "text",
  placeholder = "Not set",
  variant = "field",
  headingLevel = 2,
}: {
  label: string;
  value: string;
  onSave: (next: string) => Promise<unknown> | unknown;
  validate?: (next: string) => string | null;
  multiline?: boolean;
  type?: "text" | "number" | "email";
  placeholder?: string;
  variant?: "field" | "heading";
  headingLevel?: 1 | 2 | 3;
}) {
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const message = validate?.(draft) ?? null;
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.trim());
      toast.success(`${label} updated.`);
      setEditing(false);
      setError(null);
    } catch (err) {
      // Stay in edit mode on failure so the admin's typing isn't lost.
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : `Couldn't update ${label.toLowerCase()}.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const isHeading = variant === "heading";
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";

  if (!editing) {
    return (
      <div>
        {!isHeading && (
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
        )}
        <div
          className={
            isHeading ? "flex items-start gap-2" : "mt-0.5 flex items-start gap-2"
          }
        >
          {isHeading ? (
            <Heading className="min-w-0 break-words text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {value || placeholder}
            </Heading>
          ) : (
            <p
              className={
                value
                  ? "min-w-0 break-words text-foreground"
                  : "min-w-0 break-words text-muted-foreground italic"
              }
            >
              {value || placeholder}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={isHeading ? "mt-1.5 size-8 shrink-0" : "size-6 shrink-0"}
            aria-label={`Edit ${label.toLowerCase()}`}
            onClick={startEditing}
          >
            <PencilIcon
              className={isHeading ? "size-4" : "size-3.5"}
              aria-hidden
            />
          </Button>
        </div>
      </div>
    );
  }

  const Field = multiline ? Textarea : Input;

  return (
    <div>
      <label
        htmlFor={fieldId}
        className={
          isHeading
            ? "sr-only"
            : "text-xs uppercase tracking-wide text-muted-foreground"
        }
      >
        {label}
      </label>
      <div className={isHeading ? "space-y-2" : "mt-1 space-y-2"}>
        <Field
          id={fieldId}
          className={
            isHeading
              ? "h-auto py-2 text-3xl font-bold tracking-tight sm:text-4xl"
              : undefined
          }
          value={draft}
          type={multiline ? undefined : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          disabled={saving}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
            // Enter commits a single-line field; a textarea keeps newlines.
            if (e.key === "Enter" && !multiline) {
              e.preventDefault();
              void save();
            }
          }}
        />
        {error && (
          <p
            id={`${fieldId}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={saving} onClick={save}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={cancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
