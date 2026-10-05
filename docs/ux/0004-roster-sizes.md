# 0004 Roster sizes: one player, several sizes (UX)

Card: `[0004] UX discovery: roster entry with several sizes` (t_aa3539d1)
Register: `~/sidestep/initiatives/0004-roster-collection/initiative.md`
Concept talk + JCC answers: `~/sidestep/docs/gates/0004-concept-roster-vs-items.md`
Builds on: `docs/ux/0004-order-items.md` (phase 1). Its §6 terms are superseded here.
Mockup: `docs/ux/0004-roster-sizes/mockup.html` (frames 1–8, rendered as `mockup-frame1..8.png` and `mockup-1280.png`)
Evidence: `docs/ux/0004-roster-sizes/today-three-rows-375.png`

## TL;DR

- Today, "Sidestep #72 in S, M×3 and XL" takes three trips through the add
  sheet. It costs 11 taps and 30 keystrokes, the name and number get typed
  three times, and the list shows three separate rows (measured, §2).
- Proposal: a player is the row, and that player's sizes are chips inside
  it. The add sheet swaps its one size picker and "How many" stepper for a
  per-size counter grid. The public form already uses that grid in "pick from
  list" mode. Same job: 7 taps, 10 keystrokes, one sheet, one row.
- What's printed per player comes from the design (JCC, 2026-10-05): name
  on back, number on back, number on front, captain letter. A player is one
  set of those values. The default field set is exactly what phase 1 stores,
  so the usual case still shows two boxes.
- Typing a name and number that's already on the design adds sizes to that
  player instead of making a duplicate. The same applies to paste and to the
  public form.
- The term JCC asked about: I recommend "player" on screen, and "roster entry"
  and "order item" in code and docs. Not SKU (Q1).

---

## 1. Problem and who it's for

A captain at 10pm has a group chat open: "I'll take a small for me, and my
brother wants three mediums and an XL, all #72 Sidestep." On today's list that's
three rows that look like three people. JCC, reading the list to build the
factory order, can't tell "one player in three sizes" from "three people with
the same name". Every edit to the name or number has to be repeated on each row.

JCC, 2026-10-05 (Discord, verbatim):

> Make it possible for a user to take Sidestep #72, and then add multiple order
> items for that roster entry, e.g. (1 small, 3 medium, 1 XL)

> A roster entry is A, a person on the team. Basically a jersey design has the
> main design, and then customizeable pieces that customers can add. For
> example, Name on back = X, number on front = Y, number on back = Z. The
> combinations of X Y Z would count as 1 roster entry, and a customer can order
> that roster entry in multiple sizes.

Register `done_when` (0004, verbatim):

> A customer submits their roster once and it arrives in a validated,
> order-ready format — no manual copying, no chasing for missing fields.

This card covers "submits once" for players with several sizes, and
"order-ready" in the sense that JCC gets one line per printed identity with its
size breakdown. He doesn't have to reconcile duplicate names by eye.

| Persona | Moment | Needs from this |
|---|---|---|
| Captain | Building the list from a group chat, on a phone | Type a player once, tap the sizes, done. Fix a size without retyping the name |
| Player (order form) | Ordering for themselves plus a partner or kid | One card per printed name, several sizes on it |
| JCC (admin) | Turning the list into a factory order | One row per print with its sizes, plus a CSV he can trust |

## 2. What exists today

Walked on 2026-10-05 at 375×812 against the dev app (`_devSeed` fixtures,
`Snap Demo — No Run Yet`, Home Kit), with a Playwright script that counted
taps. I removed the rows afterwards.

Job: add Sidestep #72 as 1 S, 3 M and 1 XL.

| Measure | Today |
|---|---|
| Sheet opens | 3 (one per size) |
| Taps | 11 (open + size + "One more" × (qty−1) + Add, three times) |
| Keystrokes | 30 ("Sidestep" + "72", typed three times) |
| Rows on the list | 3 (`Sidestep #72 · S`, `Sidestep #72 · M ×3`, `Sidestep #72 · XL`) |
| Design count line | "8 items · 1 needs a size" (the 5 jerseys show up as 3 rows) |

Screenshot: `today-three-rows-375.png`.

Surfaces and components involved:

| Surface | Component | Today |
|---|---|---|
| Order list (captain and admin) | `components/orderList/OrderList.tsx`, `ItemRow.tsx` | One row per `orderItems` row: name, #, letter, "Added by", size or `Needs size`, `×qty` |
| Add / edit sheet | `ItemSheet.tsx` | Name, Number, one Size (toggle pills), How many (stepper), Captain letter. `Add` / `Add and start another` / `Save` / `Remove` + Undo |
| Paste | `PasteList.tsx`, `lib/orderItem/paste.ts` | Name, number, optional size. A repeat is added again with the note "already on the list, adds another". More than 3 columns is rejected |
| Copy from design | `CopyFromDesign.tsx` | Copies names (not sizes) to another design, skipping ones already there |
| Public form, "type your own" | `PublicOrderForm.tsx` → `JerseyLine` | One card = name, number, one size (radio), Quantity box. "Add another jersey" for the next size |
| Public form, "pick from list" | `PublicOrderForm.tsx` → `RosterGrid`, `SizeCounter` | Already one row per name with a counter per size. This is the pattern this design reuses |
| CSV | `lib/rosterExport.ts` | One row per garment: Name, Number, Role, Size |
| Confirm gate (admin) | `lib/orderItem/checks.ts` | "2 items need a size: …" |

Data today: one flat `orderItems` table. A "needs size" row is an item with no
size. No player record exists on its own, which is why "several sizes for one
player" has nowhere to live (concept brief, `0004-concept-roster-vs-items.md`).

Already working that I've kept: the bottom-sheet pattern, Undo instead of a
confirm dialog, the size chips, the `C`/`A` badge, "Added by", the amber
`Needs size` pill, paste with a preview, the locked read-only state, and the
public form's size counter.

## 3. Journeys

### Captain: "#72, one small, three mediums, one XL"

```
Today                                         Proposed
─────                                         ────────
[+ Add item]                                  [+ Add player]
  Sidestep · 72 · S · Add                       Sidestep · 72
[+ Add item]                                    tap S · tap M M M · tap XL
  Sidestep · 72 · M · + + · Add                 [Add Sidestep #72 · 5 jerseys]
[+ Add item]                                         │
  Sidestep · 72 · XL · Add                           ▼
       │                                      1 row: Sidestep #72
       ▼                                             S  M×3  XL   5 jerseys
3 rows, 11 taps, 30 keys                      7 taps, 10 keys
```

### Captain: "add an L for #72 later"

```
Option 1, from the row:        ⋯ on Sidestep #72 ─► tap L ─► Save        3 taps
Option 2, without looking:     [+ Add player] ─► Sidestep · 72
                                 │ notice: "Sidestep #72 is already on Home Kit
                                 │ (S, M×3, XL). The sizes you pick here get
                                 │ added to that row."
                                 ▼
                               tap L ─► [Add 1 to Sidestep #72]
                                 ▼
                               toast "Added L to Sidestep #72"; still one row
```

The captain never ends up with a duplicate by accident. Typing the same name and
number (ignoring case and extra spaces, the rule paste already uses) lands on
the existing player.

### Captain: change sizes, remove a size, remove the player

```
⋯ on Sidestep #72 ─► Edit player sheet
  ├─ M: tap − once           ─► M×2           ─► Save
  ├─ XL: tap − until 0       ─► XL gone       ─► Save   (player stays)
  ├─ all sizes to 0          ─► Save          ─► row shows "Needs sizes"
  ├─ rename to "Sidestep II" ─► Save          ─► one row, all sizes keep
  ├─ rename to a player who already exists
  │        ─► notice + button "Merge and save" ─► one row with both sets of sizes
  └─ [Remove player]         ─► row gone, toast "Removed Sidestep #72 (5 jerseys)" [Undo]
                                Undo brings back every size and who added it
```

### Captain: paste a whole team

```
[Paste a list] ─► paste from Sheets (one row per jersey, or a "how many" column)
   │
   ▼
Preview grouped by player:
   Sidestep #72   S  M×3  XL    "3 rows, one player."
   Avery Quinn #7 L             "Already on your list with M, XL. Adds an L."
   Mo #88         Needs sizes   "Row 6: "XXXS" isn't a size we make, ..."
   │
   ▼
[Add to Home Kit] ─► toast "Added 3 players and 6 jerseys"
```

### Player on the public order form ("type your own name" mode)

```
Link in group chat ─► Your name, email
   │
   ▼
Jersey 1: Name on back "Sidestep", Number "72"
          tap S · M M M · XL                         header: "5 jerseys"
   │
   ├─ [+ Add a different name or number] ─► Jersey 2 card (e.g. a kid's jersey)
   ▼
Submit ─► lands on the captain's list as ONE player row, "Added by <first name>"
          If Sidestep #72 was already there, the sizes join that row.
```

"Pick from list" mode looks the same as today: a name, then a counter per size.
What changes is underneath. The sizes now hang off the picked player instead
of filling a "needs size" row.

### JCC (admin)

```
Admin order page ─► same Order list (OrderList is shared)
   │  one row per player, sizes as chips, editable even when locked
   ▼
Stage "Order Size Confirmed" ─► gate: "1 player needs sizes: Jordan Lee #4"
   ▼
Download CSV ─► one row per jersey (unchanged), columns follow the design's fields
```

## 4. The list: one player, their sizes

Mockup frame 1. Layout of one row at 375px:

```
┌──────────────────────────────────────────────┐
│ Sidestep #72  [C]                        ⋯   │  name + number, letter badge
│ Added by you and Riley                       │  who added (all sources)
│ [S] [M×3] [XL]  5 jerseys                    │  size chips + total, wrap
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ Jordan Lee #4                            ⋯   │
│ Added by you                                 │
│ (Needs sizes)                                │  amber pill, as phase 1
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ Blank jerseys                            ⋯   │  one per design
│ Nothing printed · Added by you               │
│ [M] [L×2]  3 jerseys                         │
└──────────────────────────────────────────────┘
```

Rules:

1. One row per player per design. A player on Home and Away is two rows, one
   in each design group, as today.
2. Size chips run in catalogue order (`sortSizes`) and show `×n` only when n > 1.
   The chips wrap, so more sizes make the row taller and never wider.
3. The total (`5 jerseys`) appears only when the player has more than one jersey.
4. The row's chips are display only. Every change goes through `⋯`. I rejected
   tappable chips: on a phone you hit them while scrolling, and a 24px chip
   fails the tap-target rule.
5. Extra printed fields show as a second line under the name only when they
   differ from the default, e.g. `Front #27` when the front number isn't the
   back number. The row stays two lines for the usual case.
6. Design header: `3 players · 10 jerseys · 1 needs sizes`. The size-breakdown
   chips and the footer (`10 jerseys · S×1 M×5 L×2 XL×2` · `1 player needs sizes`)
   read the same summary as the rows, as in phase 1.

Rejected direction: keep one row per size and visually group rows that share
a name and number. It's the cheapest option, with no model change, but a rename
has to touch N rows, the "group" is a guess that a typo breaks, and it isn't
what JCC described. He wants a roster entry that exists on its own.

Also rejected: an accordion row that expands into sub-rows, one per size, each
with its own `⋯`. It doubles the taps to see a player's sizes and doubles the
list height on a phone. Chips show all of it at a glance.

## 5. Add, edit, remove

### Add a player (frame 2)

`+ Add player` opens the existing bottom sheet:

- The fields come from the design (§6). The default is `Name on back` +
  `Number`, then the `Captain letter` segment.
- Sizes: a 4-column grid of counters, one per catalogue size, 44px tall. Tap a
  size to add one; `−` appears once a size has a count; a badge shows the count.
  This is the public form's `SizeCounter`, made bigger. A live summary line sits
  under the grid: `S×1 · M×3 · XL×1` … `5 jerseys`.
- Primary button names what it will do: `Add Sidestep #72 · 5 jerseys`,
  `Add Jordan Lee #4` (no sizes), or `Add 3 blank jerseys` (no fields filled).
- `Add and start another` stays and clears the sheet.

### Same name and number as an existing player (frame 3)

An inline notice appears (status role, not an error) as soon as the fields match
a player on this design:

> **Sidestep #72 is already on Home Kit** (S, M×3, XL). The sizes you pick here get added to that row.

The button becomes `Add 1 to Sidestep #72`. Changing the letter here updates
that player's letter.

### Edit a player (frame 4)

`⋯` → `Edit player`: same fields and grid, prefilled with the player's totals per
size. A read-only "Sizes added by" block on top lists each source:
`You · S, M×2 · Oct 2` / `Riley Chen · M, XL · Oct 4, through the order form`,
plus custom answers as in phase 1. When the captain lowers a size that came from
more than one person, the most recently added jersey goes first.

Buttons: `Save`, `Remove player`.

- Removing one size means tapping `−` to 0 and saving. The player stays.
- Taking every size to 0 and saving gives a `Needs sizes` row. That's allowed:
  it's how a captain keeps a name while someone decides.
- Renaming to a name and number that already exists on the design shows:
  `Avery Quinn #7 is already on Home Kit. Saving puts these sizes on that row.`
  The button becomes `Merge and save`.

### Remove (frame 5)

No confirm dialog. Toast `Removed Sidestep #72 (5 jerseys)` with `Undo` for 8
seconds (`UNDO_TOAST_MS`). Undo restores the player, every size and who added
each one.

## 6. Printed fields per design (JCC refinement)

A design says what changes from player to player. A player is one set of
values for those fields, and sizes hang off the player.

```
design (Home Kit)
 ├─ printed fields: Name on back · Number on back · Number on front · Captain letter
 └─ player (roster entry)  "Sidestep" · 72 · 72 · –
      ├─ size line (order item)  S  ×1
      ├─ size line (order item)  M  ×3
      └─ size line (order item)  XL ×1
```

Mockup frame 8. On the design page, a new card:

- Heading `Printed on each jersey`. Help line: `Pick what changes from player to player. These become the boxes on your order list and order form.`
- One switch per field: `Name on back`, `Number on back`, `Number on front`
  (hint `Usually the same as the back`), `Captain letter (C / A)`.
  `[CONFIRM: the full list of placements Sidestep offers, e.g. sleeve numbers, name on front]`
- Default for new designs, and for every design that exists today: Name on
  back, Number on back, Captain letter. That's what phase 1 stores, so
  existing lists don't change. `[CONFIRM: is this the right default for a new design?]`
- When `Number on front` is on, the add sheet shows both numbers with a
  `Same number on the front` checkbox, ticked by default. The front box is
  greyed out and mirrors the back until it's unticked, so the usual case
  stays two boxes.
- Turning a field off when players already have values shows:
  `12 players have a name on back. Turning this off hides those names from the list and the export. Turn it back on to get them back.`
  The values are kept.

Matching ("is this the same player?") uses every text field, ignoring case and
extra spaces. The captain letter is not part of the match, because players on
the public form can't set it. The captain sets it once per player.

The labels come from the design everywhere: sheet, public form, CSV headers.
If a design has only one number field, the label is just `Number`.

## 7. Paste a list (frame 6)

Changes from phase 1's `PasteList`:

- Columns: name, number, size, and a new optional "how many" column after the
  size. A row with more than 4 cells is skipped with
  `Expected a name, a number, a size and how many. This row has more.`
- Rows with the same name and number are grouped into one player in the
  preview, which shows chips like the list does. Note: `3 rows, one player.`
- A row matching a player already on the design adds its sizes to that player.
  Note: `Already on your list with M, XL. Adds an L.` A matching row with no
  size adds nothing. Note: `Already on your list. Nothing to add.`
- Count line: `3 new players · 1 updated · 6 jerseys · 2 need sizes` (zero
  parts left out). Button: `Add to Home Kit`, or `Nothing to add`.
  Toast: `Added 3 players and 6 jerseys`.
- Number on front, if the design has it, follows the back number in paste.
  The captain edits the odd one by hand.
- Help line: `Paste name, number and size straight from Excel or Google Sheets. One row per jersey, or add a "how many" column after the size. Nothing is added until you confirm.`

`Copy from <design>` copies players without their sizes, the same as today.

## 8. Public order form (frame 7)

"Type your own name" mode (`JerseyLine`):

- Card legend stays `Jersey 1`, `Jersey 2`. The fields come from the design
  chosen on the card. The single-size radio and `Quantity` box become the
  counter grid.
- Size hint: `Tap a size once for each jersey you want with this name and number.`
- `Add another jersey` becomes `+ Add a different name or number`.
- Header count stays `5 jerseys` (Σ counters). The submit button and the "your
  captain will see it right away" line are unchanged.
- Validation: a card with no sizes shows `Pick at least one size.` (replaces
  `Pick a size.`).
- On submit, a card that matches an existing player on that design adds its
  sizes to that player. When two different emails add sizes to the same player,
  the row gets phase 1's collision flag, reworded:
  `Sizes from 2 people. Check they're the same player.`

"Pick from list" mode (`RosterGrid`): no visible change.

## 9. Admin

- The admin order page already renders `OrderList` and keeps edit controls on
  a locked order. It gets everything above unchanged.
- Confirm gate copy (`needsSizeMessage`): `2 players need sizes: Jordan Lee #4, Mo #88`.
  Rule: a player with no sizes blocks confirm. Blank jerseys always have sizes.
- CSV (`rosterExport`): still one row per jersey. Headers follow the design's
  fields, e.g. `Name on back, Number on back, Number on front, Role, Size`.
  Sort by name groups each player's rows together.

## 10. Empty, edge and error states

| State | What shows |
|---|---|
| Design with nobody on it | `Nobody on the list yet` / `Add players one at a time, paste a list from a spreadsheet, or share the order form and let them add themselves.` |
| Player with no sizes | Amber pill `Needs sizes`; counts as "needs sizes", adds 0 jerseys |
| Sheet: nothing typed, no sizes | Primary button disabled, label `Add player`. Hint under it: `Add a name, a number or at least one size.` |
| Sheet: no fields, sizes picked | Button `Add 3 blank jerseys` (no dialog; the label says it) |
| Counter at the max (`MAX_QTY`, 500) | `+` disabled for that size |
| Public form: size not offered by this form | Not shown (form's `sizeOptions`) |
| Save fails | Toast `Could not save that player. Please try again.` Sheet stays open with what was typed |
| Restore fails | `Could not restore that player. Please try again.` |
| Locked | No `+ Add player`, no `⋯`, chips still shown, CSV still works; existing locked note (`Locked for production.`…) |
| Server message reaching the captain | Never raw. `This order is locked for production.` as today |

## 11. Copy (customer-facing, humanizer pass done)

Order list

- Heading `Order list` (kept). Help: `Everything we'll make for this order. Add players yourself, or share the order form and let them add their own.`
- Buttons `+ Add player`, `Paste a list`, `Copy from <design>`, `Download CSV`
- Design line `3 players · 10 jerseys · 1 needs sizes`
- Row: `<Name> #<Number>`, letter badge, `Added by you` / `Added by Riley` / `Added by you and Riley`, chips, `5 jerseys`
- Blank row `Blank jerseys` / `Nothing printed · Added by you`
- Footer `10 jerseys · S×1 M×5 L×2 XL×2` and `1 player needs sizes`

Sheet

- Titles `Add a player` / `Edit player`, subtitle = design title
- Hint under fields `Leave anything blank you don't want printed.`
- `Sizes`, hint (add only) `Tap a size once for each jersey. Not sure yet? Skip it and we'll mark it "needs sizes".`
- `Same number on the front` (only when the design prints a front number)
- Match notice `<Label> is already on <Design> (<sizes>). The sizes you pick here get added to that row.`
- Buttons `Add <Label> · <n> jerseys`, `Add 1 to <Label>`, `Add <n> blank jerseys`, `Add and start another`, `Save`, `Merge and save`, `Remove player`
- Toasts `Added L to Sidestep #72`, `Removed Sidestep #72 (5 jerseys)` + `Undo`

Design page

- `Printed on each jersey` / `Pick what changes from player to player. These become the boxes on your order list and order form.`

Public form

- `Tap a size once for each jersey you want with this name and number.`
- `+ Add a different name or number`
- `Pick at least one size.`

Words that change from phase 1: `item` → `player` (rows) and `jersey` (counts);
`Needs size` → `Needs sizes`; `+ Add item` → `+ Add player`.

## 12. Behaviour rules for the architect

The architect owns the data design. These are what the screens need:

1. A design has an ordered set of printed fields, chosen from a fixed list
   (§6). Existing designs get Name on back, Number on back, Captain letter.
2. A player (roster entry) belongs to one design on one order, and holds a
   value per printed field plus an optional letter. A player with every field
   blank is the design's single "Blank jerseys" row.
3. A size line (order item) belongs to a player: size, qty ≥ 1, who added it
   (captain or submitter + email + date), custom answers. Size is always set.
   "Needs sizes" means a player with no size lines, never a size line with no size.
4. A player is matched by design + all text fields, normalised (trim, collapse
   spaces, case-insensitive). Add, paste, the public form and rename all use the
   same match, and a match adds to the existing player instead of creating a second.
5. Remove player removes its size lines too, and restore brings back all of them.
6. Counts: jerseys = Σ qty of size lines on linked designs; players = players
   with at least one non-blank field; "needs sizes" = players with no size lines.
   One summary feeds rows, chips, footer, admin gate and CSV.
7. The public form sends, per card, one player plus several (size, qty) pairs.
   Fixed mode sends picked player id + sizes.
8. Collision flag: a player whose size lines come from two or more different
   submitter emails (open mode only, as in phase 1).
9. Migration from phase 1: flat rows with the same design + name + number
   become one player with their sizes as lines. A size-less row becomes a player
   with no lines. A letter on any of the rows carries over.
10. Lock and admin-edit rules are unchanged from phase 1.

## 13. Acceptance criteria (UX)

- From the order page, at 375×812, a captain adds Sidestep #72 with 1 S, 3 M and
  1 XL in one sheet: ≤ 7 taps plus typing the name and number once. The list
  shows one row with chips `S`, `M×3`, `XL` and `5 jerseys`.
- Adding Sidestep #72 again (any case or spacing) with an L shows the
  "already on" notice, and afterwards there is still exactly one Sidestep #72
  row on that design, now with L.
- In the edit sheet, lowering M to 2 and saving updates the row, the design
  line, the size chips and the footer in the same render.
- Taking every size to 0 and saving leaves the row with `Needs sizes`; it adds 0 to jerseys and 1 to "needs sizes".
- `Remove player` shows `Removed … (n jerseys)` + `Undo`. Undo restores the same
  sizes, quantities, letter and "added by".
- Pasting three rows for Sidestep 72 (S / M 3 / XL) previews and adds one
  player with S, M×3 and XL. A pasted row matching an existing player adds sizes
  to it, and the preview says so.
- On the public form, one card with S + M×3 + XL submits as one player with
  three size lines. If the player already existed, it joins that row.
- On a design with `Number on front` on, the sheet shows both numbers, with the
  front mirroring the back until `Same number on the front` is unticked. A player
  whose front differs shows `Front #<n>` on its row.
- No row, sheet or card scrolls sideways at 375px with 8 sizes on a player
  (mockup: 0 overflowing elements in all 8 frames, checked by script).
- Every counter, `−`, `⋯` and button is ≥ 40px tall, reachable by keyboard
  with a visible focus ring. Counters have labels like `Add one M for Sidestep #72`
  / `Remove one M for Sidestep #72`, and the summary line is a polite live region.
- When locked, no add/edit control renders on the captain's page; chips and
  CSV stay.
- No customer-visible text contains `CONVEX`, `ConvexError`, a request id or a
  file path.

## 14. Open questions (`needs_decision`)

**Q1. What do we call a roster entry? (JCC asked: is there an industry term, "SKU"?)**

Industry usage I checked: team shops say **roster** for the list and
**names and numbers** (Custom Ink's "Names & Numbers") or **personalization**
for what's printed per player (Custom Ink, LiveArt, Stahls' Team Builder).
**SKU** means a stocked variant, like "design X in size M" (Shopify,
Salesforce definitions). Sidestep makes everything to order, so a SKU is at
most a design + size line on the factory sheet, never a person.

- A. On screen: **player** for the row, **sizes** for its lines, **Printed on
  each jersey** for the design's fields. In code and docs: **roster entry**
  and **order item**. *Recommended.* It matches JCC's own words ("a person on
  the team") and captains already say "add a player".
- B. **Roster entry** everywhere, on screen too. Accurate, but "entry" is
  database talk to a captain.
- C. **Personalization** (industry word) for the row. Right for the printed
  values, but odd as a row label ("Add a personalization").
- D. **SKU**. Rejected: wrong meaning (stock variant, not a person or print).

**Q2. Counts: "jerseys" or "items"?** Phase 1 counts "items" to leave room for
hats. With "order item" now meaning a size line, "8 items" is ambiguous.

- A. **Jerseys** in counts (`10 jerseys`). *Recommended.* Hats are out of scope,
  and the public form already says "jerseys".
- B. Keep "items".

**Q3. Who sets a design's printed fields, and from what list?**

- A. **A fixed list Sidestep offers, switched on per design by the captain or
  admin on the design page.** Default: name on back, number on back, captain
  letter. *Recommended.* Captains know their league's rules, and JCC can still
  change them. `[CONFIRM: the list of placements]`
- B. Admin only. Captains see the fields but can't change them.
- C. Ship sizes-per-player first with today's fixed fields (name, number,
  letter), and per-design fields as a follow-up slice. Fastest route to JCC's
  #72 example. The architect can slice it this way under A or B anyway.

**Q4. Confirm the card's working assumptions.** The design depends on them.

- Roster belongs to one order (not reused next season). *Recommend yes.*
- Blank jerseys are allowed, shown as one `Blank jerseys` row per design.
  *Recommend yes.*
- A paste row, add, or form submission that matches an existing player adds
  sizes to that player instead of making a new one. *Recommend yes.*

**Q5. Two different people add sizes to the same name + number on the order form.**

- A. **Join one player and flag it** (`Sizes from 2 people. Check they're the
  same player.`). *Recommended.* It matches JCC's "one print = one roster
  entry" and phase 1's flag-don't-block rule.
- B. Keep them as two players with the same print.

## 15. Decisions made in this doc (UX's call)

- Chips inside the row over sub-rows or an accordion: a player's sizes are
  visible without a tap, and the row grows taller, not wider.
- The size counter grid is reused from the public form's fixed mode
  (`SizeCounter`) and made 44px tall, rather than inventing a new control.
- Row chips are display only, and edits go through `⋯`. Tappable chips
  would be accidental taps on a scrolling phone list.
- "Needs sizes" is a player with no size lines, which is cleaner than a size
  line without a size.
- The captain letter is not part of the player match, because players can't
  set it on the form.
- Lowering a size that came from several people removes the newest jersey first.
- Number on front mirrors the back by default, so the common case stays two boxes.

## 16. Out of scope

- Reusing a roster across orders or seasons (Q4).
- Hats and other non-jersey products.
- Changes to "pick from list" mode beyond the data underneath.
- Number-uniqueness and other phase-2 validation rules.
- Pricing on the list.
