# 0004 Import a customer's free-text roster (architecture)

Card: `[0004] Issues: roster import (R3-03..R3-05) + roster-convert skill spec`
(t_9fbb0c12). Inputs: `docs/ux/0004-roster-import.md` (UX), gate record
`~/sidestep/docs/gates/0004-minigate-import.md` (JCC decisions, 2026-10-09).
Names here are pseudonyms, as in the UX doc. The repo is public.

## Decision

Path B, as approved. The app keeps **one** input format, and a Hermes skill
turns each customer's own format into it. The app parser learns nothing new:
no ` - ` separators, no brackets, no tags. It gets three small changes:

| Issue | What | Size | Order |
|---|---|---|---|
| R3-03 | An empty cell between two separators keeps its place. `COACH R,,S,1` = no number, S×1 | S | 1st |
| R3-04 | Optional 5th column "Ordered by" → `orderItems.submitterName` on the pasted size lines | M | 2nd |
| R3-05 | Amber warning when ≥ 3 rows parse and none has a number or a size | S | 3rd |
| skill | `sidestep-roster-convert`, a Hermes skill for JCC's default profile (spec below) | S | parallel |

```
customer's message ─► sidestep-roster-convert (Hermes, JCC's desktop) ─► one block per design + Check
                                                                            │  copy one block
                                                                            ▼
                         PasteList ─► parseRosterPaste (R3-03/04/05) ─► preview (the trust gate)
                                                                            │  Add
                                                                            ▼
                         rosterEntries.addMany ─► rosterEntries + orderItems {source: "captain",
                                                                              submitterName?: Ordered by}
```

All three issues touch `lib/orderItem/paste.ts`, so they build one after the
other, each on top of the last.

## The input format (the contract)

```
Name,Number,Size[,How many[,Ordered by]]       comma or tab; one row per jersey; no header row
```

- **Name** printed as typed. **Number** is text (`01` ≠ `1`). Empty = no number.
- **Size** is one of `XS S M L XL 2XL 3XL 4XL` (`XXL` reads as `2XL`).
- **How many** is an integer from 1 to `MAX_QTY`. It defaults to 1.
- **Ordered by** (R3-04) is optional per row and per paste. 4-column rows stay
  valid, and one paste can mix 4- and 5-column rows.

Everything the parser does today stays the same: tab beats comma, columns are
detected per row, the `Name 99` single-column shape still works, and the 200-row
bound and the grouping by `playerKey` don't change.

## R3-03: blank cells (parser rule)

Options:

| | Rule | For | Against |
|---|---|---|---|
| **A (pick)** | Drop empty cells only at the start and end of the row. An empty cell **inside** the name/number/size zone (cells 1–3) means one of those three is missing. So: drop the blanks and look for a size **among the cells that are left, even when only 2 are left** (today a size is only looked for when there are 3). If no size is found and 2 cells are left, the numeric one is the number. If neither is numeric, the first is the name and the second is a size we don't make. A zone with no blank works exactly as it does today. | One local change in `cellsOf` + `splitSize`. Column detection stays per row, so every existing test keeps passing (`Gretzky⇥⇥99` is still Gretzky #99, `paste.test.ts:85`). | `Abbott,,8` still reads as Abbott #8, not "Abbott, no number, size 8". That's acceptable: 8 isn't a size, and the skill never writes it. |
| B | Strictly positional once a row has an empty interior cell: cell 1 = name, cell 2 = number, cell 3 = size | Simplest to state | Breaks `Gretzky⇥⇥99` (a spreadsheet with a hidden column). Mixes two rule sets in one parser. |

What A does, row by row (after R3-03):

| Row | Today | After |
|---|---|---|
| `COACH R,,S,1` | COACH R **#1**, S×1 | COACH R, no number, S×1 |
| `COACH R,,S` | COACH R **#S**, needs sizes | COACH R, no number, S×1 |
| `COACH R⇥⇥S⇥1` | COACH R #1, S×1 | COACH R, no number, S×1 |
| `Abbott,8,,1` | Abbott #8, "1 isn't a size" note | Abbott #8, needs sizes, no note |
| `Chen,,youth L,1` | Chen **#youth L**, needs sizes | Chen, no number, "youth L isn't a size we make" note |
| `Gretzky⇥⇥99` | Gretzky #99 | Gretzky #99 (unchanged) |
| `,,Gretzky,99,,` | Gretzky #99 | Gretzky #99 (unchanged: ends are trimmed) |
| `8,,M` | a player called **M #8** | skipped: no name |
| `,,,` / `Gretzky,99⏎,,,` | **throws a TypeError** in `parseRosterPaste` (measured) | the separator-only line is a blank line: skipped, not numbered |

Measured on `main` (f974345) with a throwaway vitest probe, not committed: the
4-column Light block from the UX doc §5 already previews `11 new players · 19
jerseys`, **and** it saves COACH R as #1. So the count gate can't see this bug.
That's why R3-03 comes first and why the skill's Check lists every row with an
empty number under "Changed" (JCC looks at those rows in the preview).

## R3-04: "Ordered by" → submitter

### Where it lands

Options:

| | Where | For | Against |
|---|---|---|---|
| **A (pick)** | The existing `orderItems.submitterName`, on each pasted size line, with `source: "captain"` | No schema change. "Sizes added by", the admin export and the run-responses page already read it. It belongs per jersey (Rob's 7 lines), not per player. | Relaxes the rule "only the public form sets a submitter" (handled below). |
| B | A new `orderItems.orderedBy` field | Keeps `submitter*` purely for the form | A schema change, a second "who" field that every reader has to merge, and the export would need a new column. That's more work for the same fact. |

### Data flow

```
paste row  "Fraser,43,2XL,1,Rob"
  parseRosterPaste ─► players[i].sizes[j] = { size: "2XL", qty: 1, orderedBy: "Rob" }
                      preview item.orderedBy = ["Rob"]          (distinct, first-seen order)
  addMany            ─► sizes: v.array(v.object({ size, qty, orderedBy: v.optional(v.string()) }))
                        trim; "" → absent; > SUBMITTER_NAME_MAX_LENGTH (120) → reject whole paste
  insertSizeLine     ─► orderItems { source: "captain", submitterName: "Rob" }   (no email, answers, form id)
  sendersOf          ─► group key "name:Rob", via: "paste"  ─► "Rob · … · Oct 9, from a pasted list"
  admin exportOrder  ─► submitterName column = "Rob"   (no code change)
```

- **Parser.** A 5th cell is "Ordered by". It is trimmed, and an empty cell
  means none. More than 5 cells is invalid, and the message mentions "who
  ordered". An empty 4th cell next to a 5th means How many = 1
  (`Abbott,8,M,,Kai`). A name over 120 characters makes that row invalid,
  using the same rule as `checkSubmitterName`. Grouping is still by
  `playerKey`, and the chips still sum per size. The `players` payload keeps
  one size line per `(size, orderedBy)`, so the server records each owner's
  jerseys separately. With no owner, the `orderedBy` key is left out, not set
  to `undefined`, so the payload is the same as today. `counts` don't change.
  A 4-cell row whose 4th cell isn't a number stays invalid (`Abbott,8,M,Kai`).
  Columns are positional, and an owner is never guessed from the How many
  slot.
- **Server.** `addMany` validates `orderedBy` and inserts one size line per
  `(size, orderedBy)`. `checkSizesToAdd` merges by size today. It still checks
  the per-size `MAX_QTY` total across owners, but it must not merge two owners
  into one line.
- **Sheet.** `sendersOf` gains `via: "form" | "paste"` on a named sender. It's
  `"form"` if any of the sender's lines is `source: "fan"` or has an email,
  otherwise `"paste"`. `PlayerSheet` picks the suffix from `via`. The captain's
  own unnamed lines are still "You".

### Who may set a submitter now (auth)

| Function | Caller | `submitterName` | `submitterEmail`, `customAnswers`, `orderFormId` | `source` |
|---|---|---|---|---|
| `orderEntries.submitOrder` (public form) | anyone with an open form link | the sender's own name | yes | `"fan"` |
| `rosterEntries.addMany` | `requireListWriter`: admin always; the captain on their own order while it's unlocked | **new:** `orderedBy` per size line, only on lines this call inserts | **never** | `"captain"` (server-set) |
| `rosterEntries.add / update / remove / restore / copyToDesign` | `requireListWriter` | never (unchanged) | never | server-set |

Security review:
- **Can a captain forge an order-form submission?** No. `source: "fan"`,
  `submitterEmail` and `customAnswers` are still only written by
  `submitOrder`. The UI decides between "through the order form" and "from a
  pasted list" from `source`/email, not from the name. A pasted "Avery Quinn"
  reads ", from a pasted list".
- **Can it reach someone else's data?** No. `requireListWriter` and
  `requireDesignOnOrder` are unchanged. `listMyResponses` keys on
  `submitterEmail`, so a pasted line never shows up in anyone's "My jerseys".
- **Can it rewrite an existing submitter?** No. `addMany` only inserts, and a
  merge still moves lines by `rosterEntryId` (invariant 5 holds).
- **Trust level.** "Ordered by" is the captain's own note on their own order,
  the same as the printed name they can already type. The admin CSV goes
  through `lib/csv.ts`'s formula guard, so `=HYPERLINK(…)` as a name can't run.
- The validator stays strict, so `submitterName`, `submitterEmail` and
  `source` sent as `addMany` args are refused before the handler runs. The
  public argument is called `orderedBy`, not `submitterName`, which makes it
  obvious which path wrote it.

Comments to update in the same diff: `convex/schema.ts` above `submitterName`,
the header of `convex/rosterEntries.ts`, `insertSizeLine` in
`convex/_orderItems.ts`, and the "Spoofing check" paragraph in
`docs/architecture/0004-roster-sizes.md`. They should all say: the public form
sets the name and email; a paste may set a name only, with `source: "captain"`.

## R3-05: the not-columns warning

The rule is pure, so it lives next to the parser:
`looksLikeNotColumns(result) = valid rows ≥ 3 && none has a number or a size`.
Here a "size" is a catalogue size: an unknown size note doesn't count. Invalid
rows don't count toward the 3. `PasteList` shows the copy from UX §6 in the
amber notice style that `OrderList.tsx:218` uses. Add stays enabled. A list of
names only (sizes come later) is real, so this is a hint, not a gate.

Options: a flag on `RosterPasteResult` (`hints: { notColumns }`) or a separate
exported function that takes the result. Pick the **separate function**.
`parseRosterPaste`'s output stays "what the paste means and what gets sent",
and the hint, which is only about presentation, can be tested on its own with
hand-built rows. The flag would work too. It just puts a UI concern into the
parser's return type.

## Skill: sidestep-roster-convert

A Hermes skill, not app code. ss-dev builds it on card t_1aea8964. It lives at
`~/sidestep/agents/skills/sidestep-roster-convert/SKILL.md`. That folder is
already in the default profile's `skills.external_dirs`, and `~/sidestep` has
no remote. **No real names in the skill files.** Worked examples use the
pseudonyms from `docs/ux/0004-roster-import.md` §5.

### Frontmatter and trigger

```yaml
name: sidestep-roster-convert
description: "Use when JCC pastes a customer's typed jersey list and says 'convert this roster' (or similar): turn it into Sidestep Paste-a-list blocks plus a Check."
```

It triggers on a pasted list plus one of: "convert this roster", "roster
convert", "make this pasteable", "convert for paste". Without a list it asks for
one, in one line.

### What it may do

- Read the message in the chat and reply in the chat. That's all.
- It must **not** write to Convex, call the app or any URL, run `npx convex`,
  write files, or save names to memory or skills. The app's paste preview is
  the only path into the data. Customer names going through the model is
  approved (JCC, 2026-10-09).

### Output contract (UX §5, plus the optional 5th column)

Inside one fenced code block, so a chat copy keeps commas and line breaks:

```
== <Design> · paste into design "<Design>" · <P> players · <J> jerseys ==
<Name>,<Number>,<Size>,1[,<Ordered by>]
…one row per jersey, in the customer's order…

== <Design> <variant> · paste into design "<Design> <variant>" · <P> player(s) · <J> jersey(s) ==
…

== Check ==
Jersey lines in: <N> (headings and blank lines not counted)
Rows out: <a> + <b> = <N>. Nothing dropped.
Changed: <none | line <n> "<tag>" -> <what happened>, one per line>
Repeats kept as separate jerseys: <none | Name #N Size xk, …>
Same number on two names: <none | list, per design>
Same name on two numbers: <none | list, per design>
Couldn't read: <none | line <n> "<text as sent>">
Questions: <none | numbered, one per thing to ask the customer>
```

- **One block per design.** The design name is the customer's heading minus
  "Jersey Order" and the like (`[Light Jersey Order]` → `Light`). With no
  heading, the design is `Design 1` and Questions asks which design.
- **`<P>`** = distinct name + number in that block (case and spacing ignored,
  the same as `playerKey`). **`<J>`** = rows. These must equal the app's
  preview count line for that block.
- **Ordered by:** emit column 5 on a row when the customer names an owner for
  that line, and omit it when they don't. A paste can mix 4- and 5-column rows
  (R3-04). Until R3-04 is on `main`, the app skips 5-column rows ("This row
  has more"). If JCC asks for the list "without owners", the skill drops
  column 5 from every row and says so under Changed.
- **No header row, ever.** The parser would read it as a player.

### Rules

1. **Never guess a size.** `XXL` → `2XL`, and the case is normalised (`xl` →
   `XL`). Anything else that isn't in `XS S M L XL 2XL 3XL 4XL` (`YL`, `Youth
   M`, `XXXL`, `L/XL`) is kept as typed in the Size cell and listed under
   Questions. The preview then shows "isn't a size we make".
2. **Never fix a name.** Keep case, spelling, spaces and accents as typed
   (`COACH R` stays in capitals). A name containing a comma goes under
   Questions, and the row goes under Couldn't read.
3. **Never drop a repeat.** An identical line is another jersey. Keep it and
   list it under Repeats.
4. **Blank number only on an explicit "no number"** ("no number", "no #",
   "blank", "no num"). A number that's just missing gets an empty cell **and**
   a Questions entry ("line n: number missing, blank or forgot?"). It's never
   filled in or borrowed from another line.
5. **Numbers as typed.** Leading zeros are kept. `#` is stripped.
6. **Tags.** A garment tag (sleeveless, long sleeve, youth cut, …) moves the
   row to a `<Design> <tag>` block. A print tag ("no number") changes the
   fields. An unknown tag leaves the row where it is and goes under Questions.
   Every tag that's acted on is listed under Changed.
7. **Every input line is accounted for.** It ends up as exactly one row or
   under Couldn't read. Jersey lines in = rows out + couldn't-read lines. If
   that doesn't add up, the skill says so on the "Rows out" line instead of
   "Nothing dropped".
8. **How many is always 1.** That way rows = jerseys and the paste groups them.
9. No "next time use the order form" note (JCC, 2026-10-09).

### Acceptance check (for ss-dev's card)

On the real sample,
`~/sidestep/initiatives/0004-roster-collection/artifacts/customer-roster-sample-2026-10-09.txt`,
the output's rows equal the rows of `….converted.txt` **row for row, in
order** (compare only the lines between the `==` headers). The wording of the
Check may differ. The counts may not:

| Check | Expected |
|---|---|
| Jersey lines in / rows out | 20 / 19 + 1 = 20 |
| Light block header | 11 players · 19 jerseys |
| Light sleeveless block header | 1 player · 1 jersey |
| Changed | the `(sleeveless)` line and the `(no number)` line |
| Repeats | 3 (one 2XL ×2 each on three players) |
| Couldn't read / Questions | none / none |
| Header row | absent |

Then paste the Light block into `parseRosterPaste` with a throwaway probe in
`$TMPDIR`, not committed. With R3-03 + R3-04 built, the preview must say `11
new players · 19 jerseys`, 0 skipped. With only R3-03, strip column 5 first.
On `main` today, the 4-column block also says 11 / 19, but it saves the coach
as #1 (see R3-03). That's why the count alone isn't enough there.

A pseudonym messy list for the negative case (ss-dev's Done when 3):

```
Quinn 12 L                      -> Quinn,12,L,1
Park - M (no #)                 -> Park,,M,1               Changed: "(no #)"
Lee, 7, XXL                     -> Lee,7,2XL,1
Rivera 9 youth L                -> Rivera,9,youth L,1      Questions: size "youth L"
Chen M                          -> Chen,,M,1               Questions: number missing
Okafor 5 L long sleeve          -> block "<Design> long sleeve"   Changed
#22                             -> Couldn't read (no name)
```

## Files touched (all three issues)

| File | R3-03 | R3-04 | R3-05 |
|---|---|---|---|
| `lib/orderItem/paste.ts` | ✓ | ✓ | ✓ |
| `lib/orderItem/paste*.test.ts` (SDET) | ✓ | ✓ | ✓ |
| `components/orderList/PasteList.tsx` | | ✓ | ✓ |
| `convex/rosterEntries.ts` (+ r201 test) | | ✓ | |
| `convex/_orderItems.ts`, `convex/schema.ts` (comments only) | | ✓ | |
| `lib/orderItem/label.ts`, `components/orderList/PlayerSheet.tsx` | | ✓ | |
| `e2e/` paste spec | ✓ | ✓ | ✓ |

No schema change, no new public function, no migration, no new dependency or
service.

## Risks and what to test

| Risk | Covered by |
|---|---|
| The blank-cell rule changes a reading captains rely on | R3-03 keeps every existing `paste*.test.ts` case passing unchanged |
| A wrong number passes the count check (the coach bug) | R3-03, plus the skill's Changed list naming blank-number rows |
| Two owners' jerseys merged into one line, so an owner is lost | R3-04 Logic: `addMany` with the same size from two owners → two lines, each with its own `submitterName` |
| A pasted name reads as an order-form submission | R3-04 Logic: `sendersOf` → `via: "paste"`. Review check on the `PlayerSheet` suffix |
| A captain sets email/answers through the new arg | R3-04 Logic: an `addMany` call with `submitterEmail` in a size line is refused by the validator |
| The model misreads a line | Out of the app's hands: two independent counts (the skill's footer, the app's preview) and one row per jersey. JCC cancels on a mismatch |
| The warning nags a names-only list | R3-05 threshold: it never blocks, it's only a hint |

## Not doing

- Teaching the parser the customer's shape (path C), or several designs in one
  paste.
- A captain-facing help line for column 5 (UX §6: the help text doesn't change).
- `Sleeveless` in `SLEEVE_STYLES`, telling "no number" apart from "forgot" in
  storage, and normalising name case for the factory. All three are parked for
  phase 2 (gate record).
