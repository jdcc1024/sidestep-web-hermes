# 0004 Import a customer's free-text roster (UX)

Card: `[0004] UX: import a customer's free-text roster` (t_4c2799f1). Next: mini gate
t_db451881 (ss-pm).
Builds on: `docs/ux/0004-roster-sizes.md` §7 (Paste a list) and the paste parser on
`main` at 4a999e1 (`lib/orderItem/paste.ts`, `components/orderList/PasteList.tsx`).
Mockup: `docs/ux/0004-roster-import/mockup.html` (`?state=before|after&theme=light|dark`),
rendered by `render.mjs`. One look for JCC: `docs/ux/0004-roster-import/compare-375-light.png`.

Names below are made up. This repo is public and the sample is real people, so the real
before → after stays local:
`~/sidestep/initiatives/0004-roster-collection/artifacts/customer-roster-sample-2026-10-09.converted.txt`
(gitignored, same rows with the real names). Numbers, sizes, tags and line shapes here
are the real ones.

## TL;DR

Recommend path B: JCC hands the customer's message to a small Hermes skill. The skill
gives back one comma-separated block per design plus a check footer. JCC pastes each
block into that design's existing `Paste a list`, and the preview counts must match the
block's header. The customer doesn't have to change anything.

```
customer's message ──► Hermes skill ──► "Light" block + "Light sleeveless" block + check
                                             │                 │
                                   Paste a list (Light)   Paste a list (Light sleeveless)
                                   11 players · 19        1 player · 1
                                   jerseys ✓              jersey ✓   ──►  20 = 20 lines sent
```

Two app fixes come with it:

| | What | Why | Size |
|---|---|---|---|
| P1 | A blank cell stays blank. `COACH R,,S,1` means no number. | **Bug today.** The parser drops empty cells, so the coach gets printed **#1** (4 columns) or **#S** with no size (3 columns). The same thing happens to any spreadsheet with an empty Number cell. Needed whatever path wins. | S |
| P2 | Optional 5th column "Ordered by", saved as who added those sizes | Answers the owner question (§4.1). Only if JCC picks Q1 = A. | M |
| P3 | A warning when a paste has no numbers and no sizes at all | Pasting the raw message today is accepted: 18 junk players, Add button enabled. | S |

Sample count, checked by hand and by running the parser: **20 jersey lines, 11 distinct
name + number players, 11 owners.** After the sleeveless split that's Light 11 players /
19 jerseys and Light sleeveless 1 player / 1 jersey. 19 + 1 = 20, nothing lost.

---

## 1. Problem and who it's for

Some captains don't use the order form. They collect sizes in a group chat and send JCC
a typed list. Today JCC retypes it, one player at a time. The register's goal for 0004:

> "A customer submits their roster once and it arrives in a validated, order-ready format
> — no manual copying, no chasing for missing fields."

So this is JCC's flow (admin, evenings, desktop with Hermes open), with a phone-sized
preview because captains use the same `Paste a list`. The customer's part ends when they
hit send.

## 2. What exists today (measured, not assumed)

I ran `parseRosterPaste` from `main` (4a999e1) on the sample and on variations of it in a
throwaway vitest probe, not committed. The results:

| Input | Result today |
|---|---|
| The message as sent (21 lines with the heading) | `18 new players · 18 need sizes`, 0 skipped. Every line becomes one player named after the whole line (`Sam - [Dhillon - 44 - 2XL]`), with no number and no size. Identical lines group together. **Add to Light is enabled.** |
| `Dhillon 44 2XL` (space separated) | One player named `Dhillon 44 2XL`, no number, no size. Spaces only split off a trailing number (`Name 44`). **The card body's "tab, comma or space separated" is wrong for space:** a space-separated size is never read. |
| `Dhillon,44,2XL` twice | One player Dhillon #44, 2XL×2, note "2 rows, one player." **This answers card Q2:** repeats group exactly as they should. |
| `COACH R,,S` / `COACH R⇥⇥S` | COACH R **#S**, needs sizes. The empty cell is dropped, so S moves into the number slot. |
| `COACH R,,S,1` | COACH R **#1**, S×1. The wrong number, and nothing on screen points it out. |
| `COACH R,S` | COACH R #S. There's no way today to paste a player with a size and no number. |
| `Abbott,8,M,1,Kai` (5 columns) | Skipped: "Expected a name, a number, a size and how many. This row has more." |
| `Abbott,8,M,Kai` | Skipped: "How many should be a whole number…, not Kai." |
| `Name,Number,Size` header row | A player called `Name #Number`, with the note "Size isn't a size we make". |
| The converted Light block (§5) today | `11 new players · 18 jerseys · 1 needs sizes`. 18 correct rows plus a coach printed as #S. |
| The same block after P1 | `11 new players · 19 jerseys`. All correct. |

Pieces involved:

- `Paste a list` sheet: `components/orderList/PasteList.tsx`. It works one design at a time,
  shows a preview, and is all or nothing (`rosterEntries.addMany`). Captains (portal) and
  JCC (admin) use the same sheet.
- Player = `rosterEntries` (name, number per design). Sizes = `orderItems` (size, qty,
  `source`, `submitterName`, `submitterEmail`). Today only the public form sets the
  submitter (schema comment: "no captain or admin mutation accepts these").
- "Sizes added by" in the edit sheet (`PlayerSheet.tsx` → `sendersOf` in
  `lib/orderItem/label.ts`) groups size lines by submitter. A named submitter reads
  `Riley Chen · M×1, XL×1 · Oct 4, through the order form` (the code comment's example).
- The admin order export (`lib/orderExport.ts`) already has submitter name and email
  columns. The captain CSV (`lib/rosterExport.ts`) doesn't.
- `designs.sleeveStyle` is an allowlist of `Regular | Raglan`. Tests reject
  `"Sleeveless"` on purpose (`lib/design.test.ts:194`).

## 3. Journeys

### JCC: a captain sends a typed list (recommended flow)

```
Discord / text / email                Hermes chat (desktop)                Admin order page
──────────────────────               ─────────────────────               ─────────────────
customer sends list ───────────►  paste it in: "convert this roster"
                                   skill replies:
                                     == Light · 11 players · 19 jerseys ==
                                     Abbott,8,M,1,Kai …
                                     == Light sleeveless · 1 player · 1 jersey ==
                                     Hughes,3,2XL,1,Ash
                                     Check: 20 lines in, 20 rows out. Questions: none.
                                   any questions? ── yes ─► ask customer, re-run
                                        │ no
                                   copy "Light" block ─────────────►  Light ▸ Paste a list ▸ paste
                                                                     preview "11 new players · 19 jerseys"
                                                                     = block header? ── no ─► Cancel, check
                                                                        │ yes
                                                                     Add to Light ✓
                                   copy "Light sleeveless" block ──►  (design exists? if not, add it)
                                                                     Light sleeveless ▸ Paste a list ▸ … ✓
```

Per design: copy, `Paste a list`, paste, check one number, `Add`. That's about 4 actions,
where today it's about 20 single adds for this sample.

### Customer

```
collects sizes in group chat ─► sends list in whatever shape ─► done
                                 (optional, next time: order form link, §7)
```

Nothing changes for them. JCC said asking for a little cleanup is OK, but B doesn't
need any.

## 4. The six questions

### 4.1 Owner ("Kai" in `Kai - [Abbott - 8 - M]`)

The first name is the person the jersey is for or who paid. It isn't printed. In this
sample each owner maps to exactly one player (11 owners, 11 players), but "Rob" orders
7 Fraser #43 jerseys in 6 sizes, so one owner can hold many jerseys and a player could
have jerseys from more than one owner.

| Option | Where it lands | Cost |
|---|---|---|
| **A (recommend)** | On the **size lines**, as the existing submitter name: column 5 "Ordered by". The edit sheet's "Sizes added by" shows `Rob · S×1, M×1, L×1, XL×1, 2XL×2, 3XL×1 · Oct 9, from a pasted list`, and the admin export's submitter column fills in. | P2 (M). `addMany` takes an optional name per player row, the paste reads column 5, the preview shows `Ordered by Rob`, and "Sizes added by" needs a pasted-list wording. The schema rule "only the public form sets submitter" changes, which is the architect's call. |
| B | Nowhere. The skill drops it, and the original message stays in Discord. | None. But JCC loses who to hand each jersey to (or collect from) once the list is in the app. |

Why A: JCC called it "similar to the orderer's email in a jersey run". The model already
has that slot, at the right level: per size line, not per player. Who ordered is a fact
about a jersey, not about the name printed on it. It isn't a player field and it doesn't
go on the order row (size-chips decision: no "Added by" on rows).
`[CONFIRM: what JCC uses the owner for. Handing out, collecting payment, or both? If
neither, B is fine and P2 drops.]`

### 4.2 Repeated lines (`Sam - [Dhillon - 44 - 2XL]` ×2)

Confirmed on `main`: rows with the same name + number become one player and their sizes
add up, so Dhillon #44 is 2XL×2 with the note "2 rows, one player." The sample has three
exact repeats (Dhillon 44 2XL, Fraser 43 2XL, Ivanov 34 2XL). The skill keeps them as
real jerseys and lists them under "Repeats" in its check. It never removes one.
`[CONFIRM: repeats are real extra jerseys, not typos. The skill only lists them.]`

### 4.3 Variants: `(sleeveless)`

**Recommend a separate design, "Light sleeveless"**, as JCC suggested. A sleeveless
jersey is a different garment, so it needs its own size breakdown on the factory order,
and a design already gives it one. Hughes #3 then sits on both designs, which the model
handles (one player per design).

Rejected: a size like `2XL sleeveless`. It breaks the size catalogue and every size count.
Also rejected: a per-jersey "options" field. That's new model work for one tag.

Follow-up for the architect, not this card: `SLEEVE_STYLES` has no `Sleeveless`, so the
design's own spec can't say it.
`[CONFIRM: sleeveless is a different cut at the factory, and JCC makes it its own design
on the order.]`

### 4.4 `(no number)`: `Robin - [COACH R - S ] (no number)`

In the format it's an empty number cell: `COACH R,,S,1,Robin`. The name is kept exactly
as typed (`COACH R`, in capitals). The skill blanks a number only when the customer says
so ("no number", "no #", "blank"). A number that's just missing goes under Questions
instead, because a blank there would hide a gap. This needs **P1**. Today that row is
misread (§2).

Phase 2 note: today "no number" and "forgot the number" look the same once stored. See §9.

### 4.5 Heading `[Light Jersey Order]` → design

**One paste per design.** `Paste a list` already belongs to one design and `addMany`
takes one `designId`. The skill names each block after the customer's heading, minus
"Jersey Order", plus the variant: `Light`, `Light sleeveless`. JCC pastes it into the
design with that name.

Rejected for now: several designs in one paste. It needs a design picker per block in the
sheet, all to save one copy and paste. Revisit if a 4+ design order comes up.
`[CONFIRM: the design on this order is called "Light", or JCC maps the name by eye.]`

### 4.6 Path

| | What | For | Against |
|---|---|---|---|
| A | Ask customers for a fixed format | No app or skill work | Customers type on phones in group chats. Tabs don't exist there and compliance varies. JCC still checks every list. It also asks the customer to do work, and the done_when wants them to submit once. |
| **B (recommend)** | JCC passes the message to a Hermes skill that writes our paste format | Handles this shape and the next odd one with no code. The app's paste preview stays the one trust gate (what you see = what's saved, all or nothing). The customer does nothing. | The model can misread a line. That's covered by the check footer and the count match (below). Customer names pass through the model provider. `[CONFIRM: fine, same as Discord/Hermes today]`. JCC needs Hermes open. |
| C | Teach the paste parser this shape | One step, no chat | Fits one customer's habit. The next list looks different, and every shape means more code and tests. ` - ` as a separator breaks on hyphenated names (`Smith-Jones`). Owners and tags need rules in app code anyway. |

Also rejected: the skill writing straight into Convex. That skips the preview, needs
credentials, and touches production.

**How JCC knows the skill got it right.** Two independent counts have to agree:

1. The skill's footer: `Jersey lines in: 20 … Rows out: 19 + 1 = 20`. The skill counts the
   input lines itself, and every input line ends up either as a row or under
   "Couldn't read".
2. The app's preview count line (`11 new players · 19 jerseys`, computed by
   `parseRosterPaste`, not by the model) must equal the block header
   (`11 players · 19 jerseys`).

One row per jersey keeps "rows = jerseys", so JCC can also scan the block against the
message line for line. The preview shows the grouping (`Fraser #43 · 3XL×1 2XL×2 XL×1 L×1
M×1 S×1 · 7 rows, one player`), so a split player (a typo'd number) shows up as two
entries.

## 5. The format (the skill's output contract)

What the skill replies, exactly. The format is meant to be read by a person and by the
parser alike.

```
== <Design> · paste into design "<Design>" · <P> players · <J> jerseys ==
<Name>,<Number>,<Size>,1,<Ordered by>
…one row per jersey, in the customer's order…

== <Design> <variant> · paste into design "<Design> <variant>" · … ==
…

== Check ==
Jersey lines in: <N> (headings and blank lines not counted)
Rows out: <a> + <b> = <N>. Nothing dropped.
Changed: line <n> "<tag>" -> <what happened>
Repeats kept as separate jerseys: <Name #N Size ×k>, …
Same number on two names: <none | list>          (per design)
Same name on two numbers: <none | list>          (per design)
Couldn't read: <none | line n "<text as sent>">
Questions: <none | numbered, one per thing to ask the customer>
```

Rules for the rows:

- **Separator: comma.** Commas survive being copied out of a chat. Tabs often turn into
  spaces, and the parser never reads a space-separated size (§2). A name containing a
  comma goes under Questions.
- **No header row.** The parser would read it as a player (§2).
- **Name:** the printed name exactly as the customer typed it: case, spelling, spaces.
  The skill never fixes or capitalises it.
- **Number:** digits as typed, leading zeros kept (`01` ≠ `1`). Empty only when the
  customer said "no number". A missing number goes under Questions.
- **Size:** one of `XS S M L XL 2XL 3XL 4XL`. `XXL` becomes `2XL`. Anything else is kept
  as typed (the preview then says "isn't a size we make" and the player shows Needs
  sizes) and listed under Questions. The skill never guesses a size.
- **How many:** always `1`, so rows = jerseys. Paste groups them.
- **Ordered by:** the owner as typed. Only with P2. Without P2 the skill stops at 4
  columns.
- **Tags:** a garment tag (sleeveless, long sleeve, …) moves the row to a
  `<Design> <tag>` block. A print tag ("no number") changes the fields. An unknown tag
  leaves the row where it is and goes under Questions.

### Before → after, all 20 lines (pseudonyms)

| # | Customer sent | Block | Row |
|---|---|---|---|
| – | `[Light Jersey Order]` | heading → design "Light" | – |
| 1 | `Kai - [Abbott - 8 - M]` | Light | `Abbott,8,M,1,Kai` |
| 2 | `Lee - [Brennan - 15 - 2XL]` | Light | `Brennan,15,2XL,1,Lee` |
| 3 | `Max - [Carver - 23 - L]` | Light | `Carver,23,L,1,Max` |
| 4 | `Sam - [Dhillon - 44 - 2XL]` | Light | `Dhillon,44,2XL,1,Sam` |
| 5 | `Sam - [Dhillon - 44 - 2XL]` | Light | `Dhillon,44,2XL,1,Sam` (repeat, kept) |
| 6 | `Jo - [Evans - 30 - 2XL]` | Light | `Evans,30,2XL,1,Jo` |
| 7 | `Rob - [Fraser - 43 - 3XL]` | Light | `Fraser,43,3XL,1,Rob` |
| 8 | `Rob - [Fraser - 43 - 2XL]` | Light | `Fraser,43,2XL,1,Rob` |
| 9 | `Rob - [Fraser - 43 - 2XL]` | Light | `Fraser,43,2XL,1,Rob` (repeat, kept) |
| 10 | `Rob - [Fraser - 43 - XL]` | Light | `Fraser,43,XL,1,Rob` |
| 11 | `Rob - [Fraser - 43 - L]` | Light | `Fraser,43,L,1,Rob` |
| 12 | `Rob - [Fraser - 43 - M]` | Light | `Fraser,43,M,1,Rob` |
| 13 | `Rob - [Fraser - 43 - S]` | Light | `Fraser,43,S,1,Rob` |
| 14 | `Tess - [Gill - 21 - 2XL]` | Light | `Gill,21,2XL,1,Tess` |
| 15 | `Ash - [Hughes - 3 - 2XL]` | Light | `Hughes,3,2XL,1,Ash` |
| 16 | `Ash - [Hughes - 3 - 2XL] (sleeveless)` | **Light sleeveless** | `Hughes,3,2XL,1,Ash` |
| 17 | `Mo - [Ivanov - 34 - 2XL]` | Light | `Ivanov,34,2XL,1,Mo` |
| 18 | `Mo - [Ivanov - 34 - 2XL]` | Light | `Ivanov,34,2XL,1,Mo` (repeat, kept) |
| 19 | `Pat - [Jensen - 24 - M]` | Light | `Jensen,24,M,1,Pat` |
| 20 | `Robin - [COACH R - S ] (no number)` | Light | `COACH R,,S,1,Robin` (needs P1) |

What JCC pastes, and what the preview must say:

```
== Light · paste into design "Light" · 11 players · 19 jerseys ==        preview after P1:
Abbott,8,M,1,Kai                                                           11 new players · 19 jerseys
Brennan,15,2XL,1,Lee                                                       Abbott #8       M×1
Carver,23,L,1,Max                                                          Brennan #15     2XL×1
Dhillon,44,2XL,1,Sam                                                       Carver #23      L×1
Dhillon,44,2XL,1,Sam                                                       Dhillon #44     2XL×2   2 rows, one player
Evans,30,2XL,1,Jo                                                          Evans #30       2XL×1
Fraser,43,3XL,1,Rob                                                        Fraser #43      3XL×1 2XL×2 XL×1 L×1 M×1 S×1
Fraser,43,2XL,1,Rob                                                                        7 rows, one player
Fraser,43,2XL,1,Rob                                                        Gill #21        2XL×1
Fraser,43,XL,1,Rob                                                         Hughes #3       2XL×1
Fraser,43,L,1,Rob                                                          Ivanov #34      2XL×2   2 rows, one player
Fraser,43,M,1,Rob                                                          Jensen #24      M×1
Fraser,43,S,1,Rob                                                          COACH R         S×1     (no number)
Gill,21,2XL,1,Tess
Hughes,3,2XL,1,Ash
Ivanov,34,2XL,1,Mo
Ivanov,34,2XL,1,Mo
Jensen,24,M,1,Pat
COACH R,,S,1,Robin

== Light sleeveless · paste into design "Light sleeveless" · 1 player · 1 jersey ==
Hughes,3,2XL,1,Ash

== Check ==
Jersey lines in: 20 (heading "[Light Jersey Order]" not counted)
Rows out: 19 + 1 = 20. Nothing dropped.
Changed: line 16 "(sleeveless)" -> moved to Light sleeveless
         line 20 "(no number)" -> number left empty; "COACH R" kept as typed
Repeats kept as separate jerseys: Dhillon #44 2XL ×2, Fraser #43 2XL ×2, Ivanov #34 2XL ×2
Same number on two names: none. Same name on two numbers: none.
Couldn't read: none
Questions: none
```

Size check, Light: S 2 · M 3 · L 2 · XL 1 · 2XL 10 · 3XL 1 = 19. Sleeveless: 2XL 1.
Players: 11 in Light (10 numbered + COACH R), 1 in Light sleeveless (Hughes #3, also in
Light). Owners: 11, each kept on its rows.

The same output with real names, ready for the skill's first test case:
`~/sidestep/initiatives/0004-roster-collection/artifacts/customer-roster-sample-2026-10-09.converted.txt`.

## 6. App changes (screens and words)

Mockup frames: `before-375-*.png` (the raw message pasted today) and `after-375-*.png`
(the converted block with P1 + P2). Measured at 375px: scrollWidth 375, no sideways
scroll. Before shows 18 entries, after 11.

**P1: blank cells keep their place (bug fix, required).** An empty cell between two
separators is an empty value, not a missing column. `COACH R,,S` is name COACH R, no
number, size S. Empty cells at the very start or end of a spreadsheet row are still
ignored. That's what the current filter is for, so keep that part. The preview shows
`COACH R` with no `#` and an `S×1` chip. No new copy.

**P2: "Ordered by" (only if Q1 = A).**
- Paste reads an optional 5th column after How many.
- Preview: under each player's chips, `Ordered by Rob` (several names: `Ordered by Sam,
  Jo`). Small, muted label, normal-colour name, same as the mock.
- After Add, the edit sheet's "Sizes added by" lists that person:
  `Rob · S×1, M×1, L×1, XL×1, 2XL×2, 3XL×1 · Oct 9, from a pasted list`. Today a named
  sender always ends in ", through the order form". That suffix should follow
  `orderItems.source`: `fan` keeps it, `captain` with a name says ", from a pasted list".
- The help text in the sheet doesn't change. Most captains won't use column 5, and the
  skill knows about it.
- The admin order export's submitter name column fills in with no change.

**P3: warning on a paste that isn't columns (recommend).** When 3 or more rows parse and
none has a number or a size, show this above the preview, in the existing amber style:

> None of these rows has a number or a size. Put a comma or a tab between name, number
> and size, like `Abbott,8,M`.

Add stays enabled, because a list of names only is a real use (sizes come later). The
point is that a tired paste of the raw message gets noticed.

## 7. Customer-facing copy

With path B **nothing is asked of this customer.** Their list is fine as sent.

Optional, for next time. JCC could send this after the order is in, to captains who send
typed lists:

> Got your list, thanks. That's everything I need.
>
> Next time I can send you an order form link instead. Everyone picks the name, number
> and size for their own jerseys, it comes straight to me, and nobody has to type up a
> list. Want me to set that up for your next order?

`[CONFIRM: JCC sends order-form links to captains today (0004 public form). If not yet,
hold this message.]`

## 8. Acceptance criteria (UX)

1. On `main` + P1, pasting the Light block from §5 into a design shows
   `11 new players · 19 jerseys`, with nothing skipped and no "needs sizes".
2. In that preview, COACH R has no number and shows `S×1`. Fraser #43 is one entry with
   `3XL×1 2XL×2 XL×1 L×1 M×1 S×1` and "7 rows, one player". Dhillon #44 and Ivanov #34
   each show `2XL×2`.
3. A row `Name,,S,1` or `Name⇥⇥S⇥1` never gets a number, and a number never comes from
   the Size or How many column.
4. The sleeveless block pasted into its own design shows `1 new player · 1 jersey`.
5. At 375px the sheet has no sideways scroll, and long names wrap.
6. If P2: every player in the preview shows `Ordered by <name(s)>`. After Add, "Sizes added
   by" lists each owner with their sizes and ", from a pasted list". The admin export's
   submitter column holds the owner.
7. If P3: pasting the raw message shows the warning, and pasting the Light block doesn't.
8. Skill: on the sample, the footer says 20 in and 20 out, and the block headers equal the
   app's preview counts. Every input line ends up in a block or under "Couldn't read".
   The skill's output never includes a header row.

## 9. For phase 2 (validation + factory format)

What this real roster says about validation:

- **One player, many sizes is normal.** Fraser #43 ×7 (family or fan copies), so "number
  unique in design" has to key on name + number, not on number alone. No conflicts in
  this sample (10 distinct numbers on 10 names), but the skill reports both "same number
  on two names" and "same name on two numbers".
- **Exact repeats happen** (3 of 20 lines). Don't block them. A note is enough, and paste
  already shows "2 rows, one player."
- **"No number" is a choice, not a gap.** The coach row says so outright. Today a blank
  number can't tell "no number" from "forgot". If phase 2 adds "this design prints
  numbers, so a number is required", it needs a way to mark "no number" on purpose, or
  it will flag every coach.
- **Name case varies** (`COACH R` in capitals, `Abbott` in title case).
  `[CONFIRM: the factory prints names exactly as typed, or always uppercase?]` That
  decides whether the factory export normalises names.
- **Garment variants live inside one customer list.** Sleeveless sizes may run
  differently. `[CONFIRM: same size range for sleeveless?]`
- **Count check:** 20 jerseys from this customer against `orders.estimatedQuantity`.

## 10. Open questions (→ needs_decision)

| # | Question | Options | Recommend |
|---|---|---|---|
| Q1 | Where does the owner ("Kai" in `Kai - […]`) land? | A) "Ordered by" on the size lines (P2). B) Drop it. | **A** if JCC uses it to hand out or collect. Otherwise B, and P2 goes away. |
| Q2 | Which path? | A) customer template. B) Hermes skill → paste. C) parser learns this shape. | **B** |
| Q3 | Sleeveless | Separate design "Light sleeveless". Size variant. Options field. | **Separate design** |
| Q4 | Label for column 5 / preview line | "Ordered by". "For". "Owner". | **"Ordered by"** |
| Q5 | Send the "next time, use the order form" note (§7)? | Yes, after the order. No. | **Yes**, once form links are something JCC sends |
| Q6 | OK for customer names to go through the AI model in the skill? | Yes. No (then path A). | **Yes**, same exposure as Discord/Hermes today |
| Q7 | P3 warning on non-column pastes | Build. Skip. | **Build** (S) |

## Decisions (ss-ux, this card)

- The repo doc uses pseudonyms. The real before → after stays in the gitignored
  `artifacts/` folder, because the repo is public (GitHub API answers unauthenticated)
  and the sample file says not to put the names anywhere public.
- Commas, not tabs, in the skill output. Tabs don't survive a chat copy, and spaces don't
  split sizes.
- One row per jersey with How many = 1, so the line count equals the jersey count and the
  check is one number.
- P1 counts as a bug fix in every path, not a feature of B.
