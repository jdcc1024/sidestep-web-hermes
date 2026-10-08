# 0004 Public order form: buttons, name/number layout, design picture (UX)

Card: `[0004] UX: public order form redesign` (t_f5beba17). Mini gate: t_db0301b9
(shared with the size-chip mocks, `docs/ux/0004-size-chips.md`).
Builds on `docs/ux/0004-roster-sizes.md` §8 (public form) and R2-05 as shipped
on main (`5ae72f7`). Validation rules, fields and the captain side don't change.

Mockup: `docs/ux/0004-public-form/mockup.html`
(`?mode=open|fixed&designs=1|2&img=yes|no&theme=light|dark`), rendered by
`render.mjs`. The "before" PNGs are real captures of main at
`localhost:8080/run/<id>`, taken by `capture.mjs` against the dev fixture order.

## TL;DR

For JCC, one look each: `docs/ux/0004-public-form/compare-open-2-375-dark.png`
(type-your-own-name, two designs) and `compare-fixed-2-375-dark.png`
(pick-your-name). Light versions sit beside them.

1. **One control height.** Everything you type in or tap to choose is 40px:
   inputs, size buttons, Submit. Today it's 32 / 44 / 32 / 28, which is the
   "all different sizes" look.
2. **Size buttons sit in a real grid.** 3 across on a phone, 4 on desktop,
   all the same width. Today they're 100px-min boxes in a wrapping row, so a
   phone gets 2 per row with an 84px hole on the right.
3. **Name and number share one row at every width.** Name takes the space,
   Number is a fixed 6rem box with the digits centred. One helper line under
   both instead of one each.
4. **Pick-your-name mode becomes a list.** One 48px row per player:
   `#72  Sidestep  S×1 M×2 XL×1  ⌄`. Numbers are right-aligned in a fixed
   column, names truncate instead of wrapping, and tapping a row opens its
   size grid. Today every player gets a full size grid, and that grid starts
   at a different x on every row.
5. **The design picture shows.** One design: a big picture under the intro,
   tap to enlarge. Two or more: a row of picture tiles at the top, plus a
   small thumbnail on each design choice. No usable picture: no picture block
   at all (never a grey "missing" box at the top of a customer page).
6. **Phone gets its width back.** On a phone the page drops its outer card
   frame and the jersey card's padding shrinks, so the card is 317px inside
   instead of 251px.
7. **Two bugs found on the way** (§2.4): the Design dropdown shows the raw
   design id after you pick one, and that pushes the page 4px wider than the
   phone (horizontal scroll).

Build size: **M.** One component reshaped, one shell tweak, `getPublic` returns
each design's main picture. Needs a small **ss-architect card** first (§7): a
public storage URL, plus the picture weighing 10.6 MB.

---

## 1. Problem and who it's for

The **Player**: someone on the team who got the captain's link, opens it on
their phone, and wants to be done in 30 seconds. They need to know they're
ordering the right jersey, type or find their name, tap their sizes, submit.

JCC, 2026-10-08 (Discord #office-hours, verbatim):

> there is also an issue in the order form. When a customer is adding order
> items based on an order form that lets customer select the name and numbers.
> THe formatting is quite bad. Have Sidestep UX take a look at the design of
> this page and redevelop a better interface for this. Buttons are too large,
> and the name & numbers are squished, or all different sizes. The order form
> should also show the main image of the design it is collecting order items
> for.

Register 0004 `done_when` (verbatim): "A customer submits their roster once and
it arrives in a validated, order-ready format — no manual copying, no chasing
for missing fields."

A player who can see the design and finish fast submits once, correctly. A
player who scrolls past six size grids looking for their name, or isn't sure
which kit is which, is the one the captain has to chase.

## 2. What's wrong today (main, `5ae72f7`)

Route `/run/[id]` → `app/run/[id]/page.tsx` (shell) →
`components/run/PublicOrderForm.tsx` → `JerseyLine` (type-your-own-name cards),
`RosterGrid` (pick-your-name), `SizeCounter` (`components/orderList/SizeCounter.tsx`,
shared with the captain's player sheet).

Data used: the dev fixture order "Snap Demo — Live Run" (2 designs, 4 roster
players), plus two temporary roster players for the long/short-name case
(`Alexandra Vandermeulen-Okafor #7`, `Bo #9`, removed again after capture).
Names mode and single/two designs were switched with `orderForms:setNamesMode`
and `_devSeed:setFixtureDesignRemoved`, then put back.

| Shot | Files (`docs/ux/0004-public-form/`) |
|---|---|
| Type-your-own-name, 1 design | `before-open-1-{375,1280}-{light,dark}.png` |
| Type-your-own-name, 2 designs | `before-open-2-{375,1280}-{light,dark}.png` |
| Pick-your-name, 2 designs | `before-fixed-2-{375,1280}-{light,dark}.png` |
| R2-05 review shot (8 sizes) | `~/sidestep/docs/review/0004-R2-05/public-form-375-filled.png` |

### 2.1 Buttons too large (measured)

| Control | Today | Notes |
|---|---|---|
| Size button (`SizeCounter`) | `h-11` 44px, `min-w-[6.25rem]` 100px, in `flex flex-wrap gap-2` | At 375 the card's inside is 251–296px, so 2 fit per row: 6 sizes = 3 rows, 8 sizes = 4 rows. Measured: 212px used of a 296px row, 84px empty on the right. At 1280 it's 4 then 2, a ragged last row |
| Input | `h-8` 32px | Shorter than the size buttons right below it |
| Submit | `h-8` 32px, full width on phone | Full-width black bar that's shorter than every size button |
| Add a different name or number | `h-8` outline | Fine |
| Remove | ghost `sm`, `h-7` 28px | Fine |

So the size buttons are big because they're 44px tall *and* there are lots of
them: one jersey card with 6 sizes is 575px tall at 375 (2 designs); in
pick-your-name mode every player carries a full grid, 180–225px per player.

### 2.2 Name & number "squished, or all different sizes"

Type-your-own-name (`JerseyLine`, `grid gap-5 sm:grid-cols-[1fr_140px]`):

- **Phone:** Name and Number stack, each full-width (251px, or 296px with two
  designs) with its own helper line. A 2-digit number gets a 251px box. Card
  layers eat the width: page `px-4` 16 + page card `p-6` 25 + jersey card
  `p-5` 21 = 62px lost per side out of 375.
- **Desktop:** Name 340px, Number 140px, Design select 500px, size buttons 100px.
  Four widths in one card, none lining up with another. The two helper lines
  ("Leave blank for no name." / "Leave blank for none.") are different lengths.

Pick-your-name (`RosterGrid`, row = `sm:flex-row sm:justify-between`):

- **Desktop:** the name column is as wide as the name, so the size grid starts
  somewhere different on every row. Measured left edge of the grid per row:
  473, 474, 465, 541, 433, 469px. Two-word names wrap ("Avery / Quinn"), the long
  one goes to three lines, and `#7` sits under the name, not beside it. Row
  height 96–113px.
- **Phone:** each player is a name line + a 2-across grid: 180–225px per player.
  Six players = 1,200px of buttons before you reach Submit. Your own name could
  be anywhere in there.
- Numbers are plain text in `text-muted-foreground`, not tabular, so `#7` and
  `#72` don't line up either.

### 2.3 No design picture

`getPublic` returns `_id`, `title`, `roster` per design. A player sees
"Snap Demo — Home Kit" as text only. With two designs they're picking from
names, not jerseys.

### 2.4 Bugs found (not in scope to redesign, but fixed by it)

1. **Design dropdown shows the raw id.** After picking a design in a
   two-design order, the trigger reads `j97dd5by34yqa1btb6mphxzymx8fcqt2`
   instead of "Snap Demo — Home Kit" (`before-open-2-375-light.png`, every card).
   Base UI's `Select.Value` renders the value unless it's given `items`.
2. **Horizontal scroll at 375.** That id is one unbreakable string, so the
   first card grows to 338px and the page scrolls to 379px (measured
   `scrollWidth` 375 → 379 the moment a design is picked).

The new design chooser (§4.3) replaces the dropdown, which fixes both. If
JCC turns the chooser down, these two still need fixing: pass `items` to
`Select` and add `min-w-0` to the trigger.

## 3. Journeys

### Player, type-your-own-name, one design

```
link from captain ─► page opens
   │  sees: team name, "Submissions close …", THE JERSEY (big picture)   ← new
   ▼
Your name / Your email
   ▼
Jersey 1:  [ Name on jersey ........ ] [  72  ]                          ← one row
           Leave either one blank and we won't print it.
           Sizes  [XS][S ][M ]
                  [L ][XL][2XL]                                          ← 3-across grid
                  [3XL][4XL]
   ▼ (more names? "Add a different name or number")
Submit ─► "You're in!"
```

### Player, type-your-own-name, two designs

```
page opens ─► two picture tiles: Home Kit | Away Kit                     ← new
   ▼
Jersey 1:  Design  ( [img] Home Kit ) ( [img] Away Kit )                 ← tiles, not a dropdown
           Name / Number row, sizes grid … as above
```

### Player, pick-your-name (captain pre-loaded the roster)

```
page opens ─► picture(s)
   ▼
Your jerseys
 ┌ [img] Snap Demo — Home Kit
 │       Find your name and tap it to pick sizes.
 │   #7   Avery Quinn                    M×1  ⌄
 │  #12   Sam Okafor                          ⌄
 │  #72   Sidestep                            ⌃   ← tapped: opens
 │        [XS][S 1][M 2] [L][XL 1][2XL] [3XL][4XL]
 │   #7   Alexandra Vandermeulen-Oka…         ⌄
 │   #9   Bo                                  ⌄
 └
   ▼
Submit ─► "You're in!"
```

Taps for "Sidestep #72: S, M, M, XL" today: scroll past 2 grids, 4 taps.
After: 1 tap to open the row, 4 taps. One extra tap, but no scrolling past
other people's grids, and your name is in a short list you can scan.

## 4. The new layout

All class names are Tailwind/shadcn as used in the repo. The mockup carries
the same values as CSS, with `tw:` comments.

### 4.1 Page shell (`app/run/[id]/page.tsx`)

- The page card keeps its look from `sm` up and drops it on a phone:
  `rounded-none border-0 bg-transparent p-0 shadow-none sm:rounded-2xl sm:border sm:bg-card sm:p-10 sm:shadow-sm`.
  A card inside a card inside a card on a 375 screen is where the squish
  starts. Closed / success / not-found states get the same shell and still look
  fine with no frame (they're centred text).

### 4.2 Control sizes: one rule

| Control | Today | New |
|---|---|---|
| Inputs on this form | `h-8` | `className="h-10"` |
| Size button (public form only) | `h-11 min-w-[6.25rem]` in flex-wrap | `className="h-10 w-full min-w-0"` inside `grid grid-cols-3 gap-1.5 sm:grid-cols-4` |
| Submit | `h-8`, full width on phone | `h-10 w-full sm:w-auto sm:px-6` |
| Add a different name or number | outline, `h-8` | unchanged |
| Remove (per card) | ghost `sm` | unchanged |
| Jersey card | `space-y-5 p-5` | `space-y-4 p-3 sm:p-5` |

Rule: what you type into or choose with is 40px. Secondary actions (add,
remove) stay at 28–32px so they read as secondary.

40px still clears the touch rule in `0004-roster-sizes.md` §13 ("every counter
… is ≥ 40px tall") with a 6px gap between buttons. The captain's player sheet
keeps `SizeCounter` at 44px. Only the public form passes the `className`
override, so the shared component doesn't change.

Yes, Submit goes from 32 to 40: it's the one button that gets bigger. It's
the main action, and 32px is under the touch minimum everything else meets.

### 4.3 Type-your-own-name card (`JerseyLine`)

```
┌ Jersey 1 ─────────────────────────── 🗑 Remove ┐
│ Design *                         (2+ designs) │
│ ┌──────────────────┐ ┌──────────────────┐     │
│ │[img] Snap Demo — │ │[img] Snap Demo — │     │  radiogroup, 2 across,
│ │      Home Kit  ✓ │ │      Away Kit    │     │  h-14, 40px thumbnail
│ └──────────────────┘ └──────────────────┘     │
│ Name on jersey              Number            │
│ [ Sidestep             ] [   72   ]           │  grid-cols-[minmax(0,1fr)_6rem] gap-3
│ Leave either one blank and we won't print it. │  one helper, spans both
│ Sizes *                                       │
│ [  XS  ][ − S ① ][ − M ③ ]                    │  grid-cols-3 (sm: 4)
│ [  L   ][ − XL ①][  2XL  ]                    │
│ [ 3XL  ][  4XL  ]                             │
│ Tap a size once for each jersey you want      │
│ with this name and number.                    │
└───────────────────────────────────────────────┘
```

- **Name/Number:** `grid grid-cols-[minmax(0,1fr)_6rem] gap-3` at every width
  (not `sm:` only). Number input: `text-center tabular-nums font-medium`,
  keeps `inputMode="numeric"` and `maxLength={ROSTER_NUMBER_MAX_LENGTH}` (8).
  `minmax(0,1fr)` lets a long name scroll inside its box instead of pushing the
  card wider. Measured in the mock: name 209px, number 96px at 375; 392 / 96 at
  1280.
- **Helper text:** the two `FormDescription`s become one line under the row,
  linked to both inputs with `aria-describedby`. Each field's `FormMessage`
  still renders under its own input (validation unchanged).
- **Design chooser (2+ designs only):** a `role="radiogroup"` labelled
  "Design", one radio tile per design: `flex h-14 items-center gap-2 rounded-lg
  border px-2`, 40px `DesignThumbnail` + title clamped to 2 lines. Selected:
  `border-primary bg-primary/10 ring-1 ring-primary`. `grid grid-cols-2 gap-2`;
  3+ designs wrap to more rows. Arrow keys move between radios. Rejected: keep
  the `Select` and add thumbnails to its options. The picture only shows once
  it's open, and the picked value is one line of text again.
- **Sizes:** see §4.2. Every button is the same width (measured 102px at 375,
  121px at 1280) and every card's grid starts at the same x.

### 4.4 Pick-your-name list (`RosterGrid`)

```
┌ [img] Snap Demo — Home Kit ──────────────────┐   design header (2+ designs);
│       Find your name and tap it to pick sizes.│   1 design: just the hint line
├───────────────────────────────────────────────┤
│  #7  Avery Quinn                     M×1   ⌄  │   h-12 row = one <button>
│ #12  Sam Okafor                            ⌄  │
│ #72  Sidestep                              ⌃  │   open: bg-primary/[.04]
│   [ XS ][− S ①][− M ②]                        │
│   [ L  ][− XL ①][ 2XL ]                       │
│   [3XL ][ 4XL ]                               │
│   Tap a size once for each jersey you want.   │
│  #7  Alexandra Vandermeulen-Oka…           ⌄  │   truncate
│  #9  Bo                                    ⌄  │
└───────────────────────────────────────────────┘
```

- **Row:** a full-width `<button aria-expanded aria-controls>`:
  `flex h-12 w-full items-center gap-3 px-3 sm:px-5 text-left`. Rows separated
  by `border-t border-border/60`.
- **Number column:** `w-10 shrink-0 text-right font-semibold tabular-nums`, with
  the `#` in `text-muted-foreground`. Every number ends at the same x (measured:
  all six rows at 69px at 375, 430px at 1280). A player with no number gets an
  empty column, so the name still lines up.
- **Name:** `min-w-0 flex-1 truncate font-medium`. The full name is in the
  button's accessible name, and the row wraps it in full when open.
- **Chosen sizes:** collapsed rows show their sizes as chips in the size-chip
  style (`docs/ux/0004-size-chips.md`): size bold, `×N` regular in
  `text-teal-700 dark:text-teal-300`. Empty when nothing's picked.
- **Open row:** the size grid from §4.2 under the row, indented to the name
  column from `sm` up (`sm:pl-[4.5rem]`), full width on a phone.
  **One row open at a time.** Opening another closes the last, and its chips
  show what was picked. Nothing opens by default.
- **Section:** `rounded-xl border bg-muted/30`, header row with a 40px
  `DesignThumbnail` + title + hint when the order has 2+ designs.
- Accessible names for the size buttons don't change ("Add one M for
  Sidestep"), so the counters still say who they're for.

Measured: rows are all 48px. The pick-your-name page at 375 goes from
2,436px to 1,763px tall (−28%), even with the picture tiles added.

Rejected: keep every player's grid open but make it compact (3-across, 40px).
Each player would still be ~150px at 375, so a 15-player roster is ~2,250px of
buttons and you still scroll to find yourself. The list scales; open grids don't.

### 4.5 The design picture

Reuse `DesignThumbnail` (`components/design/DesignThumbnail.tsx`). It already
handles no file, not-an-image and stale-URL with one placeholder, and it opens
`ImageLightbox` when `zoomable`.

| Order | Where | Size |
|---|---|---|
| 1 design, has picture | Under the intro, above "Your name" | `h-48 sm:h-64 w-full rounded-xl`, `object-contain` on `bg-muted/50` (a jersey shouldn't be cropped), `zoomable`. Caption row: title left, "⤢ Tap to enlarge" right in `text-xs text-muted-foreground` |
| 2+ designs | Same spot: a tile per design | `grid grid-cols-2 gap-3 sm:grid-cols-3`, tile `h-36 sm:h-40`, `object-contain`, `zoomable`, title under it |
| 2+ designs, in the form | Each design choice (open mode) / each design section header (pick mode) | 40px square `DesignThumbnail`, `object-cover`, not zoomable (it's inside a button) |

Why top of the page and not inside "Your jerseys": the player's first question
is "is this my team's jersey?" Answering it before they type their name means
nobody fills in a form for the wrong kit. With 2+ designs, the big tiles say
"these are the options" once, and the 40px thumbnails at each choice say
which one you're on without scrolling back up.

Cost: with one design, "Your jerseys" moves down from 561px to 770px at
375. That's the picture, and it's the point. Rejected: a 56px thumbnail beside
the team name. You can't tell two kits apart at 56px, and JCC asked for the
picture so players can see the design.

**Fallback.** Uses the same main-picture rule as the rest of the app
(`resolveMainAsset`: flagged `isMain`, else oldest web-safe picture), and the
same "can a browser draw it" check (`isWebSafeImage`):

| Case | Shows |
|---|---|
| 1 design, main is a PDF / AI / PSD, or no files | No picture block. One muted line under the intro: `Design: Snap Demo — Home Kit` (`after-noimage-open-1-375-light.png`) |
| 2+ designs, none drawable | No tiles. Thumbnails in the chooser and section headers show the existing placeholder icon (`after-noimage-open-2-375-light.png`) |
| 2+ designs, some drawable | Tiles for all. The ones without get `DesignThumbnail`'s placeholder, so the row stays even |
| URL fails to load | `DesignThumbnail`'s `onError` → placeholder (existing behaviour) |

The rule doesn't skip a flagged PDF to find some other picture. The main file
is JCC's or the captain's deliberate pick, and every other surface follows the
same rule. If JCC wants players to always see *some* picture, that's a
one-line resolver variant for the architect, not a layout change.

## 5. Copy

Only these strings change (humanizer pass done; plain, shop-counter voice):

1. Under Name/Number (replaces "Leave blank for no name." and "Leave blank
   for none."):
   `Leave either one blank and we won't print it.`
2. Pick-your-name hint (new, top of each design section):
   `Find your name and tap it to pick sizes.`
3. Size hint, pick-your-name only (open mode keeps its current line):
   `Tap a size once for each jersey you want.`
4. Single-design picture caption: `Tap to enlarge`
5. No-picture line, single design: `Design: <design title>`

Accessible names (not visible): picture button `View <title> full size`
(existing `ImageLightbox`), placeholder `No image yet for <title>` (existing),
roster row button `<name>, number <n>, <sizes or "no sizes yet">`.

## 6. Done when

Each line is one E2E check (375 unless stated; the suite already asserts no
console errors and no horizontal scroll).

1. A player opening a single-design form whose design has a PNG/JPEG main
   picture sees that picture above "Your name", and tapping it opens it full
   size.
2. A player opening a single-design form whose design has no picture, or only
   a PDF, sees no picture block and sees "Design: <title>" under the intro.
3. A player on a two-design form sees one picture tile per design at the top,
   picks "Away Kit" from the Design choices in Jersey 1, and the choice shows
   the design's title (not an id). The page doesn't scroll sideways.
4. In Jersey 1, "Name on jersey" and "Number" sit on the same row (same top
   edge) at 375 and 1280, and all size buttons in the card are the same width.
5. A player on a pick-your-name form taps "Sidestep" (#72), adds S, M, M, XL,
   then taps "Avery Quinn". Sidestep's row closes and shows `S×1 M×2 XL×1`,
   Avery's opens, the header says 4 jerseys, and Submit sends those 4.
6. On a pick-your-name form with numbers 7, 12 and 72, the numbers' right
   edges line up, and a 29-character name shows on one line, truncated.

## 7. Notes for the architect and the build

**`getPublic` (needs an ss-architect card, small).** Return each design's main
picture: reuse `assetSummariesByDesign` (`convex/_designAssets.ts:107`), as
`orders.ts:146` and `admin.ts:97` already do, and pass
`{ url, contentType }` as `mainImage`. Two things to decide there, not here:

- *Public URL.* `getPublic` is unauthenticated: anyone with the form link would
  get a Convex storage URL for the main picture. That's the point of the
  feature (the player should see it), and it's one file per design, not the
  design's file pool. My view: fine, but don't send `filename`. A name like
  `client_final_v3_DO_NOT_SEND.png` is captain/JCC-facing, and the alt text
  uses the title anyway.
- *Weight.* The real main picture on the dev deployment's "Never OK Design"
  is a 3732×4406 PNG at **10.6 MB**. On the public form that's the first
  thing a player's phone downloads, often on cell data. Options: a web-size
  derivative made at upload (e.g. 1200px JPEG/WebP stored next to the
  original), or ship as-is first and add derivatives later. Recommend the
  derivative. This page is the most-opened page in the app, and it's opened
  on phones.

**Build (ss-dev), size M:**
- `PublicOrderForm.tsx`: `JerseyLine` layout + design radiogroup; `RosterGrid`
  → list with one open row; picture block in `Header`; `h-10` on inputs/Submit.
- `SizeCounter`: no change; pass `className="h-10 w-full min-w-0"`.
- `app/run/[id]/page.tsx`: phone drops the outer card frame.
- Tests: `PublicOrderForm.test.tsx` uses `getByRole("combobox")` for the design
  pick. It becomes `getByRole("radio", { name: /away kit/i })`. Pick-your-name
  tests must open the row before tapping a size. Labels "Name on jersey",
  "Number", "Add one M" and "Add a different name or number" don't change, so
  the existing e2e (`order-form-sizes.r205`, `order-form-player`) keeps working
  in open mode.

## 8. Accessibility

- Radio tiles and roster rows are real buttons/radios: keyboard reachable,
  `focus-visible:ring-3 ring-ring/50` like the rest of the form.
- Roster row: `aria-expanded`, `aria-controls` the panel. Opening moves no
  focus. The size buttons are next in tab order.
- Selected state uses border + fill + (in the grid) the count badge, not
  colour alone.
- Pictures: `alt="<title> main image"`. No motion added. The accordion opens
  without animation under `prefers-reduced-motion`.
- Contrast: `#` and helper text use `text-muted-foreground` (as today); the
  `×N` teal is the size-chips spec's AA-checked pair.

## 9. Decisions (UX's call)

- **One 40px control height** for inputs, size buttons and Submit. Rejected:
  shrinking size buttons to 36px. That's under the 40px floor set in
  `0004-roster-sizes.md` §13, and the problem was the wrapping, not the height.
- **Grid, not flex-wrap**, for sizes (`grid-cols-3 sm:grid-cols-4`), so every
  button is the same width and every row is full.
- **Name + Number on one row everywhere**, Number fixed at 6rem: 8 characters
  max fits, and 2 digits don't float in a 300px box.
- **Radio tiles replace the Design dropdown.** They fix the raw-id bug and
  the 379px overflow, and show the picture where you choose.
- **Phone drops the outer page card** (50px) and the jersey card goes `p-5` →
  `p-3` (16px). Together that's 66px more width for the fields at 375.
- **Fallback = no picture block**, not a grey placeholder at the top.
- **Picture rule = the app's existing `resolveMainAsset`**, with no special case
  for the public form.

## 10. Open questions (`needs_decision`, for the mini gate)

1. **Pick-your-name: list with one open row, or every player's sizes always
   showing?** Recommend the list (§4.4): 48px per player, your name is easy to
   find, 28% shorter page with 6 players. Costs one tap per player.
2. **Single design: big picture at the top, or a small thumbnail beside the
   team name?** Recommend the big picture (§4.5). It moves the form down about
   200px on a phone, and that's the cost of actually seeing the jersey.
3. **Copy sign-off**: the five strings in §5.
