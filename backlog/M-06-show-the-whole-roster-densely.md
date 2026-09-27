# Issue: Show The Whole Roster, Densely

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [x] Database: none
- [x] API: none — both surfaces already read `rosterEntries.listForRun`
- [x] Frontend: `components/portal/DesignRosterPreview.tsx` (drop the cap, lay out in columns), `components/portal/RosterSheet.tsx` (one-line rows, hover-revealed actions)
- [x] Tests: `DesignRosterPreview.test.tsx` rewritten around "every entry shows"; `RosterSheet.test.tsx` stays green

## Description
M-01 capped the design card's roster at six entries and closed it with "+ 9 more", which is exactly the wrong six for the captain whose fifteenth player is the one they're checking. And M-02's editor gives each player two stacked lines and a badge, so a fifteen-player roster is a scroll inside a sheet that is itself a scroll.

Both are density problems, not information problems. This slice shows **every** entry on the order page by wrapping the list into responsive columns — fifteen players read as five rows, not fifteen — and rebuilds the sheet's rows as single dense lines whose edit/remove controls surface on hover or focus.

## Acceptance Criteria
- [x] The order page card lists **every** roster entry; the "+ N more" line is gone
- [x] Entries flow into 2 columns from `sm` and 3 from `lg`; one column on a phone
- [x] A roster long enough to still overflow caps its height and scrolls **inside its own block**, so the card and the page below it stay put
- [x] Sheet rows are one line each — name, ordered sizes, actions — at roughly half their previous height
- [x] Edit and remove fade in on hover or keyboard focus on pointer devices, and stay permanently visible where hover doesn't exist (touch)
- [x] "Not yet filled" and the collision flag stay in the accessibility tree even where they render as a glyph
- [x] Row add/remove animation (N-07) still works: `layout`, `popLayout`, `layoutScroll` intact
- [x] All tests pass; no regressions

## Dependencies
- Blocked by: M-05
- Blocks: none

## PRD Reference
See: docs/prd/roster-on-design-cards.md — §5 In Scope (card preview, roster sheet)

## Implementation Notes
- **Human decisions already made** (asked and answered before implementation):
  - Order page: multi-column, then scroll — not a "show all" toggle, not unbounded growth.
  - Sheet: one line per player with the actions on hover/focus — not a wider two-column sheet.
- **Grid lines without nth-child arithmetic:** a `gap-px` grid over a `bg-border` container with `bg-card` cells draws both the row and column rules for free, and stays correct at 1, 2, or 3 columns. Per-cell `border-r` would need a different rule per breakpoint.
- **The height cap is one `max-h`, not a count.** The same value self-adjusts: three columns swallow 24 entries before it ever binds, while a phone's single column starts scrolling around thirteen. A count-based cap would have to be a different count per breakpoint, which CSS can express and JS cannot see.
- **Hide the row actions only where hover exists.** `[@media(hover:hover)]:opacity-0` plus `group-hover`/`group-focus-within` back to full: on touch no rule matches and the buttons simply stay visible. Opacity leaves them focusable and hit-testable throughout, so nothing is lost to the keyboard.
- Keep `Not yet filled` and the collision text as `sr-only` where the visual is a dash or an icon — the existing tests assert on that text, and they are asserting the right thing.

## TDD Approach
1. Write test: a 20-entry roster renders 20 list items and no "more" line; an unfilled slot still exposes "not yet filled"; the sheet's edit/remove buttons remain reachable by accessible name; a collision is still announced.
2. Implement: rewrite `DesignRosterPreview`'s container as a responsive grid with a max height; collapse `SlotRow` to a single line with hover-revealed actions.
3. Verify: `node scripts/verify.mjs` green; `node scripts/snap.mjs M-06 /portal/orders/<id>` for the card, plus the sheet open.
