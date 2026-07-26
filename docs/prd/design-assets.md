# PRD: Design Assets — Categorized & Visual Asset Display

**Author:** Sidestep / Claude
**Created:** 2026-06-02
**Status:** Superseded (2026-07-25) — see [`docs/prd/design-page-blocks.md`](./design-page-blocks.md)
**Last Updated:** 2026-07-25

> **⚠️ Superseded — do not build from this document.** [`docs/prd/design-page-blocks.md`](./design-page-blocks.md) replaces it. That PRD **keeps** this document's per-file **metadata table** (`designAssets` with `filename`/`contentType`/uploader provenance), its **content-type-drives-inline-render** rule, its **main-image resolver**, and its **admin upload/delete permission model** — but **replaces tag-based auto-grouping** with hand-picked, reorderable **gallery blocks**, and adds **structured text sections** and a **color palette**. Retained here for the decision history behind the asset layer.

> Derived from the `/grill-me` session on design assets (2026-06-02). **Sequenced after the roster work** — see [`docs/prd/roster-manager-and-lock.md`](./roster-manager-and-lock.md), which reshapes `order → design → rosterEntry → orderEntry`. This PRD owns how a design's *files* are modeled, categorized, and displayed on the design and order pages. It assumes the post-roster world where an order fans out to one-to-many designs.

---

## 1. Problem Statement

The design and order UIs can't actually *show* a design. A design's files are stored as `designs.fileIds: v.array(v.id("_storage"))` — a bare array of storage IDs with **zero per-file metadata**: no filename, content type, category, or ordering. So the design page can only render "File 1 / File 2 / Download," and the order page shows a file *count* instead of a picture.

Captains upload mockups, logos, inspiration, print templates, and fonts, but then can't see their own design rendered, can't tell one file's purpose from another, and can't designate a representative image. The order page — the captain's at-a-glance hub — is text where it should be visual. The cost of not solving it: the product looks like a file locker, not a design tool, and the most motivating artifact (the mockup) is invisible exactly where it matters most.

---

## 2. Proposed Solution

Replace the flat `fileIds` array with a dedicated **`designAssets`** table — one row per file, carrying type, categorization, ordering, a note, and provenance. On top of that metadata:

- The **design page** becomes a gallery: web-safe images render inline; everything else (fonts, print templates, non-web "mockups") shows as a typed file card. Assets group by tag, and the captain can retag, caption, reorder (drag), set a main image, and delete.
- The **order page** shows, for each design, its resolved **main image alongside the file count** — picture *and* number, not either/or.
- A shared **main-image resolver** picks the representative image consistently everywhere.

Categorization is by **multi-value tags** (a logo can also be inspiration). What renders inline is decided by **content type, not tag**. Visibility (`admin`/`captain`/`public`) is **stored but not enforced** in v1 — it reserves the field for the eventual fan-facing surfacing without committing to rules now.

---

## 3. Target Users

| User Type | Description | Primary Need |
|-----------|-------------|--------------|
| Captain (design owner) | Creates and owns designs | See their design rendered; organize, tag, caption, order, and curate the main image |
| Sidestep staff (admin) | Internal team | Upload staff-produced assets (print templates, final mocks); manage their own uploads |
| Fan (future) | Orders a jersey via the run form | See the main mockup of what they're buying — *deferred* with visibility enforcement |
| Teammate (future) | Shared-design collaborator | Upload assets to a shared design — *deferred*; model supports it now |

---

## 4. User Stories

### Must Have (P0)
- As a **captain**, I want to assign one or more category tags to each file as I upload it, so each asset's purpose is clear.
- As a **captain**, I want web-safe images to render inline on the design page, so I can see my design instead of a filename.
- As a **captain**, I want non-image files (fonts, print templates) shown as typed cards with download, so every asset is accounted for.
- As a **captain**, I want to mark one image as the main image, so the order page and previews show the right picture.
- As a **captain or admin**, I want to retag, caption, reorder, and delete assets after upload, so I can fix mistakes and curate.
- As a **captain**, I want the order page to show each design's main image next to its file count, so the hub is visual.
- As an **admin**, I want to upload assets to any design and have my uploads deletable only by admins, so staff files aren't removed by accident.

### Should Have (P1)
- As a **captain**, I want assets grouped by tag on the design page, so related files sit together.
- As a **captain**, I want a short caption/note on an asset, so I can record context ("front logo, away kit").

### Nice to Have (P2)
- As a **fan**, I want to see the main mockup on the run form (requires visibility enforcement) — *future*.
- As a **captain**, I want a font-face preview rendered for font files — *future*.
- As a **captain**, I want to filter the gallery by tag — *future*.

---

## 5. Scope

### In Scope
- New **`designAssets`** table (one row per file), indexed `by_design`. Remove `designs.fileIds` — **no migration**; existing dummy designs are wiped once.
- Per-asset fields: `storageId`, `filename`, `contentType`, `tags[]` (`print_template` | `mockup` | `inspiration` | `logo` | `font`), `isMain`, `visibility` (default `captain`, **stored, unenforced**), `caption`, `sortOrder`, `uploadedByUserId`, `uploadedByAdmin` (snapshot), `createdAt`.
- Asset mutations: create-with-tags, retag, set/clear caption, set/clear main, reorder, delete — under the permission rules below.
- Shared **main-image resolver**: explicit `isMain` → else newest `mockup`-tagged → else first web-safe image → else none.
- `DesignForm` upload UI with per-file tag assignment.
- Design-page **gallery**: inline render for web-safe images (png/jpg/webp/gif/svg), typed cards otherwise, tag grouping, set-main, retag, caption, drag-reorder, delete.
- Order page: **per-design main image + file count**.

### Out of Scope
- Visibility **enforcement** and any public / fan-facing surfacing (field is stored only).
- Tag **filtering** controls (group only).
- Font-face preview rendering.
- Teammate / shared-design upload UI.
- Manufacturing / print-file handoff.
- File count and size limits (decide later).

### Future Considerations
- Enforce `visibility` and surface `public` main mockups on the jersey run response form.
- Shared designs with teammate upload (the `uploadedByUserId` field already supports attribution).
- Tag filters, font previews, thumbnail generation for large/non-web images.

---

## 6. Implementation Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Asset storage shape | Separate `designAssets` table over inline array on `designs` | Deeper module; per-asset queries (e.g. main image) without loading the whole design; aligns with the roster entity model |
| Categorization | **Multiple** tags per asset | A file can serve multiple roles (logo that's also inspiration) |
| Inline rendering trigger | **Content type**, not tag | A "mockup" can be an Illustrator/PSD file; only web-safe types render in a browser |
| Main image selection | Explicit `isMain` flag with **auto-fallback** (newest `mockup` → first web image) | Captain control when wanted, sane default when not |
| Visibility | Stored, default `captain`, **not enforced** in v1 | Reserves the field for fan-facing use without committing to rules now; safe default leaks nothing when enforcement ships |
| Migration | None — wipe dummy data once | Avoids a migration slice; data is throwaway |
| Delete permission | Admin-uploaded assets are **admin-delete-only**; captain assets deletable by owner or admin | Protects staff files; needs `uploadedByAdmin` **snapshot** because admin status can change |
| Upload permission | Owner **or** admin | Staff produce print templates / final mocks |
| Asset ownership | Asset belongs to the **design**, never the order | Designs are reusable; assets travel with the design |
| Order page (multi-design) | **One main image per design** | Composes with roster fan-out; avoids inventing an order-level main |
| `sortOrder` | Persisted; drag-reorder UI in v1 | Captain + admin can rearrange; stable order without a later migration |

---

## 7. Technical Constraints
- Convex backend; files via `ctx.storage` two-phase upload (signed URL → store storage IDs). Extend the existing flow rather than replacing it.
- Convex storage URLs are resolved server-side per file (as `getMyDesign` already does); the gallery must handle a `null` URL gracefully ("Unavailable").
- Must land **after** the roster work; `designAssets.designId` and the order-page integration assume the post-roster `order → design` relationship.
- shadcn / Base UI primitives; follow the `render`-prop and `buttonVariants` conventions in `CLAUDE.md`.
- Web-safe render allowlist: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`.

---

## 8. Success Metrics
- A captain opening a design with image assets sees them **rendered inline**, not as filenames.
- The order page shows a **real main image per design** plus the count.
- A mis-tagged or wrong asset can be **retagged or deleted** without recreating the design.
- An admin-uploaded asset **cannot** be deleted by a non-admin.
- The main image resolves correctly across all fallback cases (explicit, mockup-only, image-only, none).

---

## 9. Testing Strategy
- **Unit tests:** main-image resolver across every fallback branch; web-safe content-type predicate; permission helpers (who can upload / delete which asset).
- **Integration tests (Convex):** create/retag/caption/reorder/delete mutations including the admin-delete rule and owner-or-admin upload rule; `getMyDesign` returning resolved asset URLs; order query returning per-design main image + count.
- **Manual QA:** gallery rendering for mixed asset types (image vs font vs print template); drag-reorder persistence; set-main reflected on the order page; graceful handling of an unavailable URL and a design with no visual asset.

---

## 10. Open Questions
- [ ] File count / size limits — deferred; revisit before public launch.
- [ ] Exact `public` surfacing on the run form — deferred with visibility enforcement.
- [ ] Thumbnail generation for large web-safe images (perf) — monitor; not needed for v1.
