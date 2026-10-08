# 0004 Size chips + order-row cleanup (UX)

Card: `[0004] UX: size chips + order-row cleanup` (t_5887c7bd), follow-up to Gate 2b
(`~/sidestep/docs/gates/0004-gate2b.md`, G2 + JCC's follow-up note).
Builds on: `docs/ux/0004-roster-sizes.md` §4 (the list). This doc changes §4 rule 2
(`×n` only when n > 1) and the row's second line. Everything else there still holds.
Mockup: `docs/ux/0004-size-chips/mockup.html` (`?state=before|after&theme=light|dark`,
`&view=warning`), rendered by `render.mjs` in the same folder.

## TL;DR

For JCC, one look: `docs/ux/0004-size-chips/compare-375-dark.png` (and `-light`).

1. **Size and count read apart.** The size stays bold in the normal text colour.
   The `×N` drops to regular weight in Sidestep teal (`teal-700` light,
   `teal-300` dark). That's two cues, weight and colour, so it still works in
   greyscale or for someone colour-blind. Same treatment on the row chips, the
   design's size breakdown and the order total line.
2. **"Added by …" comes off the rows completely.** No hover. The edit sheet's
   "Sizes added by" already says who sent what, and a phone has no hover anyway.
   Each row loses one line: 79px → 62px at 375 (measured in the mock).
3. **Always show `×1`.** `S` becomes `S×1`. With the count styled, every chip
   has the same shape, so your eye reads down the teal column without stopping
   to work out that a bare `S` means one.
4. **"items" → "jerseys"** on the header chip, Order details, and the
   remove-design warning (plus the "Removed designs" card, which says "items"
   twice and was missed in the G2 list).

Build size: S. One small presentational component, 4 label strings, one
function deleted. No data or Convex change.

---

## 1. Problem and who it's for

JCC reads the order total to build the factory order. Today that line is one
run of same-weight, same-colour text:

    47 jerseys · XS×1 S×14 M×7 XL×3 2XL×2 3XL×4 4XL×16

In dark mode it's all white. The eye has to parse each token to find where a
size ends and a count starts, and `2XL×2` / `3XL×4` put digits on both sides
of the ×. The captain on a phone at 10pm hits the same thing on every row's
chips, and each row also carries an "Added by you and Quinn" line they rarely
need.

JCC, 2026-10-08 (Discord #office-hours, verbatim):

> The follow up concerns the xN notation attached to each size, e.g. a roster
> entry with 2 large sizes looks like Lx2. In the UI the entire view can be hard
> to read because all the text is white... Especially in the total summary where
> we list all sizes and amounts, e.g. XS×1 S×14 M×7 XL×3 2XL×2 3XL×4 4XL×16.
> Work with Sidestep UX and add something to colour the xN portion a little
> better. Make it easier for the human eye to quickly tell. Also hide the "added
> by X" text in the order list. Maybe that information can only show up when
> hovering, or we can eliminate it entirely, let the edit dialog show who added
> it.

Register 0004 `done_when` (verbatim):

> A customer submits their roster once and it arrives in a validated,
> order-ready format — no manual copying, no chasing for missing fields.

"Order-ready" includes JCC being able to read the totals off the screen
without mistakes. A misread `3XL×4` is a wrong factory order.

## 2. What exists today (main @ 5ae72f7)

Screenshot: `~/sidestep/docs/review/0004-R2-05/captain-row-two-players-375-mobile.png`.
Mock of today, same data as the proposal: `docs/ux/0004-size-chips/before-*.png`.

| Where | Code | Today |
|---|---|---|
| Row chips | `components/orderList/PlayerRow.tsx:113-120`, text from `sizeQtyText` (`lib/orderItem/label.ts:79`) | `S` `M×3` `XL`: bold, foreground, `×1` dropped |
| Row second line | `PlayerRow.tsx:101-105`, `playerAddedBy` (`label.ts:121`) | `Added by you and Quinn`; blank entry `Nothing printed · Added by you` |
| Design size breakdown | `OrderList.tsx:195-209`, `sizeChip` (`label.ts:42`) | `XS×1 S×14 …` chips, medium weight, `×1` shown |
| Order total line | `OrderList.tsx:313-320` (`Footer`) | one string: `47 jerseys · XS×1 S×14 …`, all `font-semibold` |
| Paste preview chips | `PasteList.tsx:292-299`, `sizeQtyText` | same as row chips |
| Add/edit sheet summary | `PlayerSheet.tsx:431` | `S×1 · M×3`, muted, small (fine as is) |
| Header chip | `components/portal/order/OrderHeader.tsx:52`, `itemCountText` | `47 items` |
| Order details | `components/portal/order/OrderDetailsSection.tsx:43-46` | label `Items`, value `47 items` |
| Remove-design warning | `components/portal/DesignRemoval.tsx:55-60` | `drops 47 items`, `sent items for it`, `the items stay saved` |
| Removed designs card | `DesignRemoval.tsx:124, 149` | `their items are still here`, `sent items for this` |

Note that today's screen is already inconsistent: the breakdown chips say `XS×1`
but the row chips say `XS` for the same thing. Decision 3 fixes that too.

## 3. Journeys

    Captain, phone, 10pm: "did everyone get their sizes in?"
    open order ─► scan rows ─► each row: name, then teal counts ─► spot "Needs sizes" ─► ⋯ ─► fix
                               (no "Added by" line in the way; 1 row ≈ 1 thumb-flick shorter)

    Captain: "wait, who added the 3 mediums?"
    row ⋯ ─► sheet ─► "Sizes added by": You · S×1, M×2 · Oct 2 / Quinn · M×1 · Oct 4 ─► done
    (same answer as today, one tap deeper; it was never answerable from the row
     anyway, since "Added by you and Quinn" doesn't say who sent which size)

    JCC, laptop, building the factory order
    admin order ─► footer: 47 jerseys  XS×1  S×14  M×7  XL×3  2XL×2  3XL×4  4XL×16
                 ─► reads sizes down the bold column, counts down the teal column ─► types into supplier sheet

## 4. Decision 1: size vs count

**Direction: one `<SizeQty>` element, size bold + foreground, `×N` regular weight
+ teal.** Mocks: `after-*.png`.

```
  chip:    ( S×14 )         S   = font-semibold text-foreground
             ^^ ^^^         ×14 = font-normal text-teal-700 dark:text-teal-300
  footer:  47 jerseys   XS×1   S×14   M×7   XL×3   2XL×2   3XL×4   4XL×16
           ^semibold    ^ each pair is a <li>, gap-x-3 between pairs, no "·"
```

Why it holds up:

- **Not colour alone.** Weight (600 vs 400) separates them even in greyscale.
  Colour is the second cue, and the one that makes it fast.
- **Contrast, measured (WCAG ratio, computed from the theme hex values):**

  | Text | On | Ratio | AA (4.5) |
  |---|---|---|---|
  | `teal-700` `#0f766e` | chip `bg-muted` `#f5f5f5` (light) | 5.02 | pass |
  | `teal-700` | footer `bg-muted/50` (light) | 5.24 | pass |
  | `teal-300` `#5eead4` | chip `bg-muted` `#262626` (dark) | 10.23 | pass |
  | `teal-300` | footer (dark) | 11.14 | pass |
  | for reference: `text-muted-foreground` | chip `bg-muted` (light) | 4.35 | **fail** |

  That last row is why I didn't make the count grey. Muted grey on the muted
  chip fails AA in light mode, and it pushes the number back when the number is
  the part JCC is copying.
- **Teal is already the site's accent** (`text-teal-700 dark:text-teal-300` on
  "Back to dashboard", the "ORDER" eyebrow, "See all steps"). No new colour, and
  it doesn't read as a warning the way amber would.
- **Screen readers and text lookups don't change.** The DOM text stays `M×3`
  (two adjacent spans, nothing hidden, nothing added). VoiceOver/NVDA read it as
  "M times 3". I rejected an sr-only "M, 3": it would make the chip's text differ
  from what's on screen, break every `toContainText("M×3")` in the e2e suite,
  and "times 3" is already clear.
- **Footer loses the `·` and gets real gaps.** Each size is its own `<li>` in a
  `<ul aria-label="Sizes on this order">`, `gap-x-3`, `whitespace-nowrap` per
  pair so `4XL×16` never splits. At 375 it wraps to two lines below
  `47 jerseys` (footer 89px → 117px). That's the price of the gaps; at 1280 it
  stays one line (45px).

Rejected:

- **Count in its own darker pill or badge** (`M (3)` style). Doubles the chip
  count visually and makes a 7-size footer as busy as the rows. More ink, not
  more clarity.
- **Grey `×N`** (`text-muted-foreground`). Fails AA on the chip in light mode
  (4.35), and it de-emphasises the number JCC actually copies.
- **Superscript or smaller count.** Hurts the part that matters, at 12px on a
  phone.
- **Hover/tooltip on chips.** Chips are display only (roster-sizes §4 rule 4).

## 5. Decision 2: "Added by" off the rows

**Direction: remove it from every order-list row. No hover, no tooltip.** Agree
with the PM.

- A phone has no hover, and captains live on phones. A hover-only fact is a
  desktop-only fact.
- The row version can't answer the question anyway. "Added by you and Quinn"
  doesn't say *which* sizes Quinn sent. The sheet's "Sizes added by"
  (`PlayerSheet.tsx:517-570`) does, with dates and form answers. One tap on `⋯`.
- Each row drops from 3 lines to 2: 79px → 62px at 375 and 1280 (mock,
  measured). On a 40-player order that's ~680px less scroll.

Row's second line after the change:

| Player | Second line |
|---|---|
| named player | *(none)*: name, then chips |
| design's blank entry | `Nothing printed` |
| player with a front number etc. (R2-06, later) | unchanged plan: `Front #27` |

`playerAddedBy` (`label.ts:119-131`) has no other caller once the row stops
using it; delete it and its tests. `sendersOf` stays (the sheet uses it).
`itemAddedBy` (`label.ts:20`) has no caller on main today; the builder may
delete it in the same pass.

Rejected: **hover tooltip on desktop only.** Two behaviours for the same row,
and admin (JCC, laptop) is the one person who'd use it, but he already opens
the sheet to act on anything. **Muted, smaller "Added by".** It's still a line
on every row, which is the complaint.

## 6. Decision 3: always show `×1`

**Direction: show `×1`.** `sizeQtyText` and `sizeChip` become one rule:
`${size}×${qty}` always.

- With the count in teal, every chip has the same two-part shape. A bare `S`
  next to `M×3` breaks the column the eye is reading down; `S×1` doesn't.
- Today the breakdown says `XS×1` and the row says `XS` for the same jersey.
  One rule removes that.
- `2XL` alone looks like it could be "2 × XL". `2XL×1` can't be misread.
- Cost: chips get ~12px wider. At 375 the widest real row in the mock (blank
  entry, 5 sizes + "39 jerseys") still wraps to 2 lines, the same as today.

This applies to every place that shows a size with its count: row chips,
breakdown, footer, paste preview chips, the sheet's "Sizes added by" lines
(`You · S×1, M×2 · Oct 2`), the match notice (`Already on your list with
S×1, M×3`) and the paste notes built by `sizesText` (`paste.ts:248`).

Rejected: **keep bare `S`.** It's one less glyph, but it's the inconsistency
JCC is looking at, and the new styling makes `×1` cheap to scan past.

Note on the sheet and notices: those are sentences, not chips. Plain text
`S×1, M×3` is fine there; `<SizeQty>` styling is for chips and the footer only.

## 7. Decision 4: "items" → "jerseys"

Exact copy (humanizer pass done; these are labels, kept short):

| Where | Today | After |
|---|---|---|
| Header chip (`OrderHeader.tsx:52`) | `47 items` | `47 jerseys` (`jerseyCountText`) |
| Order details label (`OrderDetailsSection.tsx:44`) | `Items` | `On the list` |
| Order details value (`:45`) | `47 items` | `47 jerseys` |
| Warning title (`DesignRemoval.tsx:53-55`) | `Removing "Home kit" drops 47 items from your order` | `Removing "Home kit" drops 47 jerseys from your order` |
| Warning body (`:58-60`) | `Riley (2), Ana (1) sent items for it. Nothing is deleted: the items stay saved and show as removed on the order page, so you can link the design again any time.` | `Riley (2), Ana (1) added jerseys to it. Nothing is deleted: their names and sizes stay saved and show as removed on the order page, so you can link the design again any time.` |
| Removed designs intro (`:122-126`) | `These are off the order, so they don't count toward production — but their items are still here. Nothing was deleted.` | `These are off the order, so they don't count toward production. Their names and sizes are still here, and nothing was deleted.` |
| Removed design card (`:149`) | `Riley (2) sent items for this.` | `Riley (2) added jerseys to this.` |

Why `On the list` and not `Jerseys`: the next field is "Estimated at intake ·
50 jerseys". `Jerseys · 47 jerseys` repeats itself, and "On the list" says what
the number is (the live count, O-07) next to the estimate.

`itemCountText` (`label.ts:46`) has no caller left after this; delete it.

## 8. Token / class approach (for the architect and builder)

One new presentational component, used by the row chips, the breakdown chips,
the paste preview chips and the footer:

```tsx
// components/orderList/SizeQty.tsx (name is the architect's call)
<span className="font-semibold text-foreground">{size}</span>
<span className="ml-px font-normal text-teal-700 dark:text-teal-300">×{qty}</span>
```

- Chip wrapper keeps today's classes: `rounded-full bg-muted px-2 py-0.5 text-xs
  tabular-nums`. Drop `font-semibold`/`font-medium` and `text-foreground` from the
  wrapper; the spans carry them.
- Footer: `<p class="font-semibold">47 jerseys</p>` then
  `<ul aria-label="Sizes on this order" class="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">`,
  one `<li class="whitespace-nowrap">` per size. In the footer the count span uses
  `font-medium` (500) instead of 400, because the footer text is 14px and
  sits on the lighter `bg-muted/50`.
- `ml-px`: stops the size's last letter touching the ×.
- No new tokens, no `globals.css` change. `teal-700` / `teal-300` are the
  existing accent pair.
- `sizeQtyText` and `sizeChip` collapse to one function that always includes
  `×qty`, for the plain-text uses (sheet, notices, paste notes, toasts).

## 9. Mocks

All in `docs/ux/0004-size-chips/`, rendered from `mockup.html` with the app's own
Inter and Bebas Neue (`render.mjs`). Data: JCC's total line from Gate 2b
(XS×1 S×14 M×7 XL×3 2XL×2 3XL×4 4XL×16 = 47) over 4 players + the blank entry.

| File | What |
|---|---|
| `compare-375-dark.png`, `compare-375-light.png` | **The one to show JCC.** Order list card, before and after side by side |
| `before-375-light.png`, `before-375-dark.png` | Today, full order page, phone |
| `after-375-light.png`, `after-375-dark.png` | Proposal, full order page, phone |
| `before-1280-light.png`, `before-1280-dark.png` | Today, desktop with sidebar |
| `after-1280-light.png`, `after-1280-dark.png` | Proposal, desktop with sidebar |
| `before-warning-375-light.png`, `after-warning-375-light.png` | Edit order's remove-design warning |

Measured in the mock (render output):

| | 375 before | 375 after | 1280 before | 1280 after |
|---|---|---|---|---|
| horizontal scroll | none (375) | none (375) | none | none |
| named row height | 79px | 62px | 79px | 62px |
| footer height | 89px | 117px | 45px | 45px |
| order list card | 887px | 846px | 709px | 641px |

## 10. Done when

Workflow sentences an E2E or a component test can check:

1. A player with S×1 and M×3 shows chips reading `S×1` and `M×3` on the order
   list row, and the row has no text "Added by".
2. On the order list, no row contains "Added by" for any player, whether the
   captain added them or a player did through the order form.
3. The design's blank entry shows `Nothing printed` under "Blank jerseys", with
   no "Added by".
4. Opening `⋯` on a player whose sizes came from the captain and from Quinn still
   shows "Sizes added by" with both people and their sizes (`You · S×1, …`,
   `Quinn … · M×1 · …, through the order form`).
5. The order total line shows `47 jerseys` and then one list item per size
   (`XS×1`, `S×14`, …), in a list named "Sizes on this order", with no `·`
   between sizes.
6. In every size chip and the total line, the count (`×3`) is its own element
   with `text-teal-700` (light) / `text-teal-300` (dark) and normal or medium
   weight; the size is `font-semibold`. (Component test on class names.)
7. A chip's accessible text is still exactly `M×3` (`toHaveText("M×3")` passes).
8. Pasting `Sidestep 72 S` and `Sidestep 72 M 3` previews one player with chips
   `S×1` and `M×3`.
9. The order header chip reads `N jerseys`; no `N items` anywhere on the order page.
10. Order details shows the label `On the list` with value `N jerseys`, next to
    `Estimated at intake`.
11. In Edit order, unticking a design that has jerseys shows `Removing "<title>"
    drops N jerseys from your order` and the body says `added jerseys to it`.
12. On a 375px screen, the order page has no horizontal scroll with 7 sizes in
    the total line, and no `4XL×16` is split across two lines.
13. Light and dark theme: count text meets 4.5:1 on its background (checked
    above; holds as long as the classes in 8 are used).

Tests that will change with this (for SDET, not a decision): e2e
`order-list-players.r202.spec.ts` (the Undo test title and body assert "Added
by"), `order-form-sizes.r205.spec.ts:119,148,155` ("Added by" first names),
`lib/orderItem/label.test.ts` (`playerAddedBy`, `itemAddedBy`, `sizeQtyText`
for one), `DesignRemoval.test.tsx` / `OrderDetailsForm.test.tsx` if they pin
"items". The first-name rule those e2e tests check still holds in the sheet;
move the assertion there rather than drop it.

## 11. Open questions

None that block. JCC's yes on the mock is the gate (t_db0301b9):

- **Q1. Approve the look (teal `×N`, `×1` always, no "Added by")?**
  Options: approve / tweak colour / keep bare `S`. Recommend: approve.

## 12. Decisions made in this doc (UX's call)

- Count styled by weight + teal, not grey (grey fails AA on the chip in light mode).
- "Added by" removed from rows, no hover (no hover on phones; sheet already answers it).
- `×1` always shown, everywhere (one shape, fixes breakdown/row mismatch).
- DOM text unchanged (`M×3`); no sr-only rewrite.
- Order details label `Items` → `On the list` (avoids "Jerseys · 47 jerseys").
- Removed-designs card copy included in the "items" sweep (same file, same word, missed in G2).
