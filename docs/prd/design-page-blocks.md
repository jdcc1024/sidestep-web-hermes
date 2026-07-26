# PRD: Design Page — Structured Brief Blocks

**Author:** Sidestep / Claude
**Created:** 2026-07-25
**Status:** Draft
**Last Updated:** 2026-07-25

> Derived from the `/grill-me` session on the design page (2026-07-20 → 2026-07-25). **Supersedes** [`docs/prd/design-assets.md`](./design-assets.md) (unbuilt draft): this PRD keeps that document's per-file **metadata table** and its **admin upload/delete permission model**, but replaces **tag-based auto-grouping** of images with a **hand-picked, reorderable block** model, and adds **structured text sections** and a **color palette**. It owns the whole design detail page — portal (owner) and admin — plus the file/asset layer beneath it.

---

## 1. Problem Statement

The design detail page is a flat dump. A design carries a single `brief` string, three silhouette specs, an optional Canva link, and `fileIds: v.array(v.id("_storage"))` — a **bare array of storage IDs with zero per-file metadata** (no filename, no content type). So the page can only render "File 1 / File 2 → Download": images are invisible where they matter most, there's nowhere to articulate the concept or inspiration behind a design, and the color palette — the single most important thing production needs — has no home at all.

The result is that the design page reads like a file locker, not a design tool. Captains and Sidestep staff can't build a shared, structured brief; the artifact that should anchor a jersey's identity is text and download links. The cost of not solving it: the concept lives in scattered emails and Canva tabs, and production reverse-engineers colors from a JPEG.

---

## 2. Proposed Solution

Turn the design page into a **structured internal brief** built from **reorderable blocks**. A design owns an ordered list of blocks drawn from a fixed menu; the owner (and admin) drag to reorder and fill in what's relevant. Block kinds in v1:

- **Text** — a fixed set of named sections: **Overview · Concept · Inspiration · Notes**. **Overview replaces the old `brief` field** and is the design's primary description (shown in list/card/admin summaries). The section name is the heading (structure by design; no free-form titles).
- **Gallery** — a captioned grid of **hand-picked** images chosen from the design's uploaded files. Multiple galleries per design ("Mood board", "Logo refs"). Web-safe images render inline; other file types show as typed download cards.
- **Palette** — **one per design**, holding an unlimited, ordered set of **swatches**. Each swatch is a hex color picked on-screen, with a **role** (primary / secondary / accent defaults) and an optional free-text **Pantone code** label. Pantone is a *label only* — no API, no lookup dataset; production treats the code as the source of truth and the hex as a screen approximation.

Beneath the blocks, the flat `fileIds` array is replaced by a **`designAssets`** table — one row per file with `filename`, `contentType`, uploader provenance, and a main-image flag — so galleries can render real thumbnails and tell an image from a PDF/AI file.

Both the portal (owner) and the admin page edit the blocks through **one shared block editor**. v1 delivers a clean, static UI skeleton; motion and polish are a deliberately separate later task.

---

## 3. Target Users

| User Type | Description | Primary Need |
|-----------|-------------|--------------|
| Captain (design owner) | Creates and owns designs | Build a structured brief — write concept/inspiration, show images as galleries, capture the color palette — and arrange it as they wish |
| Sidestep staff (admin) | Internal team | Edit the same brief through the same editor; upload staff-produced assets; read the palette as a production spec |
| Teammate (future) | Owner-granted collaborator | Edit a shared design — *deferred*; the asset/permission model reserves attribution for it |

---

## 4. User Stories

### Must Have (P0)
- As an **owner**, I want a fixed set of named text sections (Overview/Concept/Inspiration/Notes) I can fill in, so the brief has consistent structure.
- As an **owner**, I want to **drag blocks to reorder** them, so the page reads the way I want to tell the story.
- As an **owner**, I want my uploaded **images to render as real thumbnails**, so I see my design instead of filenames.
- As an **owner**, I want to create **captioned galleries** from **hand-picked** images, so I can group "mood board" separately from "logo refs".
- As an **owner**, I want a **color palette** of swatches, each with a picked hex, a role (primary/secondary/accent), and an optional Pantone code, so production knows the exact colors.
- As an **admin**, I want to edit a design's blocks through **the same editor** the owner uses, so staff and captain stay in sync.
- As an **owner or admin**, I want non-image files (fonts, print templates, PDFs) shown as **typed download cards**, so every asset is accounted for.

### Should Have (P1)
- As an **owner or admin**, I want to **add, remove, and reorder swatches** within the palette, so the palette stays accurate.
- As an **owner**, I want to mark one image as the **main image**, so the order page and previews show the right picture.
- As an **owner**, I want the **order page** to show each design's main image next to its file count, so the hub is visual.
- As an **admin**, I want assets I upload to be **admin-delete-only**, so staff files aren't removed by accident.

### Nice to Have (P2)
- As an **owner**, I want to **grant a teammate edit access** — *future*.
- As an **owner**, I want tasteful **motion/hover polish** on the page — *separate later task*.
- As an **owner**, I want a searchable **Pantone swatch picker** (bundled dataset or Pantone Connect) — *future; hex + text label only in v1*.

---

## 5. Scope

### In Scope
- **`designAssets` table** (one row per file), indexed `by_design`, replacing `designs.fileIds`. Fields: `designId`, `storageId`, `filename`, `contentType`, `isMain`, `uploadedByUserId`, `uploadedByAdmin` (snapshot), `createdAt`. **No migration** — dummy designs wiped once (pre-launch, no real data).
- **`designs.blocks`**: an **ordered array** of discriminated-union blocks stored on the design doc (reorder = rewrite array order). Kinds:
  - `text`: `{ id, kind:"text", field }` where `field ∈ {overview, concept, inspiration, notes}` (each field usable at most once) + `body`. Heading = the field's display name. **Overview replaces `brief`** and is required on create so lists always have a summary; the rest are optional.
  - `gallery`: `{ id, kind:"gallery", caption?, assetIds[] }` — hand-picked images.
  - `palette`: `{ id, kind:"palette", caption?, swatches[] }`, **at most one per design**. Swatch: `{ id, hex, role?, label?, pantoneCode? }`, `role ∈ {primary, secondary, accent}`.
- **Shared block editor** component used by both portal and admin: add block from the fixed menu, edit contents, drag-to-reorder, remove; palette swatch add/remove/reorder with a hex picker; gallery image hand-pick + caption; upload pool management (upload, set main, delete under permission rules).
- **Read rendering** on portal + admin design pages: text sections, gallery grids (inline web-safe images via `contentType`, typed cards otherwise), palette swatches with role + hex + Pantone label.
- **Main-image resolver** (shared): explicit `isMain` → else first web-safe image asset by `createdAt` → else none.
- **Order page**: per-design **main image + file count**.
- **Permissions** (carried from the superseded PRD): upload/edit = owner **or** admin; asset delete = owner for own uploads, admin for any; admin-uploaded assets are **admin-delete-only** (needs `uploadedByAdmin` snapshot).

### Out of Scope
- **Free-form canvas** layout (drag/resize/position anywhere) — blocks reorder vertically only; the Canva link field covers freeform.
- **Motion / hover / transition polish** — its own later task after the skeleton lands.
- **Owner-grants-edit-to-teammates** — model reserves attribution; no granting UI.
- **Multiple palettes** per design; **swatch roles beyond** primary/secondary/accent.
- **Pantone lookup dataset / Pantone Connect API** — hex + free-text code only.
- **Tag-based grouping / tag filters** (from the superseded PRD) — replaced by hand-picked galleries.
- **Public / fan-facing** design page or visibility enforcement.
- Turning silhouette specs / Canva link into blocks — they stay as their existing fixed sections.
- File count / size limits; thumbnail generation; font-face previews.

### Future Considerations
- Teammate edit access (attribution already on assets).
- Motion/polish pass; a "presentation" skin of the same data.
- Bundled PMS→approx-hex swatch picker, or Pantone Connect integration.
- Order-page / run-form surfacing of the palette and main image for fans.

---

## 6. Implementation Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Relationship to `design-assets.md` | **Supersede**; adopt its file-metadata table + permission model, drop tag-grouping | One coherent plan; keeps the good foundation, avoids building tag-grouping we'd rework for blocks |
| Asset storage shape | Separate `designAssets` table over the bare `fileIds` array | Per-file metadata (filename/contentType) enables thumbnails; per-asset queries without loading the whole design |
| Inline render trigger | **Content type**, not any tag | A "mockup" may be a PSD/AI file; only web-safe types render in a browser |
| Block storage | `blocks` **array on the `designs` doc** (discriminated union) | Blocks are few, ordered, edited together; reorder = one patch; no join needed to render the page |
| Text sections | **Fixed named fields** (Overview/Concept/Inspiration/Notes), each ≤ once; **Overview required** on create, others optional | Structure over freedom (per grill); Overview replaces `brief` so lists always have a summary; heading = field name, so no separate caption on text blocks |
| Block captions | On **gallery** and **palette** blocks (tied to the block, not the image/asset) | Matches the grill decision; assets stay pure file metadata |
| Galleries | **Multiple**, hand-picked images per gallery | "Organize as they wish"; one image can appear in more than one gallery |
| Palette | **One per design**, unlimited swatches | Matches grill; a single canonical palette is the production spec |
| Swatch model | `hex` (required) + `role` (primary/secondary/accent) + optional `label` + optional `pantoneCode` text | Hex for screen, Pantone code as the manufacturing token; no proprietary Pantone data |
| Pantone | **Text label only** — no API, no dataset | Legally clean and honest; the code communicates intent, hex approximates on screen |
| Editor | **One shared block editor** for portal + admin | Consistency; avoids two content editors (per grill). Scoped to the blocks + asset pool |
| Existing fixed fields | `title`, silhouette specs, Canva link **stay as-is**; **`brief` is removed** | `brief` is replaced by the **Overview** text block, which becomes the design's primary description read by list/card/admin summaries |
| Main-image resolver | Explicit `isMain` → first web-safe image → none | Owner control with a sane default; feeds the order page |
| Migration | **None** — schema swap, wipe dummy data once | Matches repo precedent (design-assets, new/edit-order); no real data pre-launch |

---

## 7. Technical Constraints
- **Stack:** Next.js (App Router) + React 19 + Convex + Clerk + shadcn/Base UI. Follow the existing grain; split Convex logic into **rules + form** modules with **mutation smoke tests**, reuse shared auth helpers (mirrors `lib/design/*` and recent refactors).
- **Convex storage:** two-phase upload (signed URL → store IDs) — extend the existing `generateUploadUrl` flow. Storage URLs resolve server-side per asset; rendering must handle a `null` URL gracefully ("Unavailable").
- **Web-safe render allowlist:** `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`.
- **CTAs/links:** `buttonVariants` on `<Link>` for navigation, not `<Button render={<Link/>}>`; `render`-prop composition per `CLAUDE.md`.
- **Color input:** native `<input type="color">` or a small shadcn-styled picker; hex is the stored source of truth. No external color/Pantone service.
- **Workflow:** TDD-first; vertical slices (DB → API → UI); update `dag.json` per task.

## 8. Success Metrics
- Opening a design with images shows them **rendered inline in galleries**, not as filenames.
- An owner can **reorder blocks** and the order **persists**.
- A design captures a **palette** with per-swatch hex, role, and optional Pantone code, readable as a production spec.
- The **same editor** edits a design from both the portal and the admin page.
- Non-image files still appear as **download cards**; an unavailable URL degrades gracefully.
- The **order page** shows a real main image per design plus the count.
- An admin-uploaded asset **cannot** be deleted by a non-admin.

## 9. Testing Strategy
- **Unit tests:** block-array validators (fixed-field uniqueness, single-palette rule, swatch hex/role validation); main-image resolver across every fallback branch; web-safe content-type predicate; asset permission helpers (who can upload/delete which asset).
- **Integration tests (Convex):** create/update design with blocks; add/reorder/remove blocks and swatches; create asset rows on upload with filename/contentType; admin-delete rule and owner-or-admin edit rule; `getMyDesign` + admin `getDesign` returning resolved asset URLs and blocks; order query returning per-design main image + count.
- **Manual QA:** mixed gallery rendering (image vs PDF/font); drag-reorder feels right and persists; palette picker + Pantone label reads cleanly light/dark; shared editor behaves identically in portal and admin; empty/undecided states are inviting, not punitive.

## 10. Open Questions
- [ ] Exact **drag-reorder** affordance (whole-block handle vs edge grip) and mobile behavior — resolve during the reorder slice.
- [ ] Where the **Overview** is authored on *create* (the create form vs later in the block editor), given it's now required — resolve in the asset/create slice.

---

## Appendix — Sequencing (vertical slices)

1. **Asset model + upload metadata** — `designAssets` table; `DesignForm` upload creates rows with `filename`/`contentType`; wipe dummy designs; queries return resolved assets; main-image resolver. *(Foundation.)*
2. **Block model + read rendering** — `designs.blocks` union in schema; render blocks read-only on portal + admin (text sections, gallery grids, palette swatches; inline images by content type, cards otherwise).
3. **Palette block editor** — hex picker; swatch add/remove/reorder; role + label + Pantone text; single-palette rule.
4. **Text blocks + reorder (shared editor)** — shared block editor component; fixed text sections add/edit/remove; drag-to-reorder all blocks; wired into portal.
5. **Gallery blocks + asset pool** — manage the uploaded asset pool; captioned galleries of hand-picked images; set main image. *(Heaviest slice.)*
6. **Admin wiring** — mount the shared editor on the admin design page (replaces `InlineEditField` for design content); admin upload + permission rules.
7. **Order-page main image** — render each design's resolved main image + file count on the order page (the resolver ships in slice 1).
8. **Later — motion & polish** pass (separate task per the grill).
