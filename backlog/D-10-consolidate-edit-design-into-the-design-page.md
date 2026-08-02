# Issue: Consolidate Edit Design Into The Design Page

## Status: done

## Phase: 2

## Type: improvement

## Description

The design page has two ways to change a design. Most of it is edited in
place — the brief through the block editor (D-03/D-04/D-05), the files
through the asset pool — but the title, the cut and the Canva link still
require pressing "Edit design", which replaces the whole page with a form.
The form then duplicates what the page already does: a Files step that
uploads alongside the pool, a Canva field the page also renders, headings
that repeat "The cut".

So the captain has to learn two mental models for one screen, and leaves
the page to make a one-word change to a title.

Delete the edit surface. Make the remaining fields editable where they are
displayed, the same way the admin design page already does it, and reduce
`DesignForm` to the create form it has effectively become.

## Acceptance Criteria

- [x] The design page has no edit mode — every field is editable where it is displayed
- [x] Title, jersey style, neckline, sleeve style and Canva link save one field at a time
- [x] Neckline and sleeve style stay allowlisted pickers, and a spec can be cleared back to undecided
- [x] `DesignForm` is create-only and no longer carries an edit mode
- [x] Tests pass

## Dependencies

- Blocked by: none (D-03 through D-07 have landed)

## Notes

- `designs.updateDesign` was shaped for a whole-form submit: required
  `title`, required `addFiles`, optional `blocks`. Per-field saving wants
  the shape `admin.updateDesign` already has — every field optional,
  supplied-but-blank means clear. Files and blocks have owned their own
  mutations since D-05, so `updateDesign` should stop carrying them.
- `InlineEditField` is the primitive for this and is already used by three
  admin pages. It moves out of `components/admin/` now that the captain
  portal mounts it too, and grows an `options` prop so an allowlisted spec
  can be a picker rather than free text.
- PRD `docs/prd/design-page-blocks.md#5-scope`: silhouette specs and the
  Canva link "stay as their existing fixed sections" — this issue makes
  those sections editable, it does not turn them into blocks.
