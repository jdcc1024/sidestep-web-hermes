# 0004 Order items: one order list the captain owns (UX)

Register: `~/sidestep/initiatives/0004-roster-collection/initiative.md`
Mockup: `docs/ux/0004-order-items/mockup.html` (open it in a browser; frames 1–6)
Evidence: `docs/ux/0004-order-items/today-*.png` (375px, dev app, 2026-09-29)

## TL;DR

- **The captain can't add a sized item today.** "Manage roster" takes a name and
  number but no size. The only way to get "Sidestep #72 – M" onto an order is
  for the captain to fill in the public fan form as if they were a player. Once
  an item exists, nobody can edit or remove it from any screen, and removing
  that player throws a raw server error.
- **Proposal: one order list per order, owned by the captain.** Each design gets
  one list of items (name, number, size, how many). The captain can add, edit
  and remove any item, including ones players sent, until the order is locked.
  The shareable link becomes just another way to fill the same list.
- **Proposed words:** *order list* and *item* for what we make, *order form* for
  the shareable link (replacing "jersey run"), and "roster", "slot",
  "collected" and "responses" drop out of the captain's vocabulary. Section 6.
- **JCC decisions, 2026-09-29:** the captain can edit items (including
  player-sent ones), the captain can add items before any link or deadline
  exists, and hats are out of scope (the PM logs them as low priority).
- **One question blocks the build:** what locks the list (section 9, Q1).
  Today the order-form deadline is the only thing that ever locks an order,
  because no screen calls lock or unlock.

---

## 1. Problem and who it's for

Captains build their team's order on a phone, often at night, from a group
chat where players text "I'm a medium, #72". They need to put that straight
onto the order and fix it when someone changes their mind. The site makes them
split the job across four screens with six names for the same thing, and the
one action they need most (add a sized item) only works through a form built
for players.

Register `done_when` (0004, verbatim):

> A customer submits their roster once and it arrives in a validated,
> order-ready format — no manual copying, no chasing for missing fields.

This work covers the "submits once" and "no chasing" halves. A captain who can
see and fix the whole list, with the gaps marked, doesn't email JCC a
spreadsheet or a correction. The "validated, order-ready format" half (factory
format, number uniqueness and so on) stays with 0004's other scope, and the PM
decides whether to split it.

Personas:

| Persona | Moment | Needs from this |
|---|---|---|
| Captain | Mid-order, on a phone, copying from a group chat | Add/fix items in seconds; see who's missing a size |
| Player | Opened the shared link | Unchanged: add own name, number, size in ~30s |
| JCC (admin) | Captain emails "Sam should be an L" after lock | Make the change once, in the same list, without retyping |

## 2. What exists today

Walked on 2026-09-29 at 375×812 against the dev app with the `_devSeed` fixtures
(`Snap Demo — Live Run` has a run, `Snap Demo — No Run Yet` doesn't). The script
is Playwright, and the screenshots are in `docs/ux/0004-order-items/`.

Surfaces involved:

| Surface | Route / component | What it does with items |
|---|---|---|
| Order page, design cards | `app/portal/orders/[id]/page.tsx` → `DesignSection`, `DesignRosterPreview` | Shows each player row with ordered sizes, read-only |
| Manage roster sheet | `components/portal/RosterSheet.tsx` | Add / edit / remove **name + number + C/A**. No size, no qty |
| Order form (public) | `app/run/[id]` → `components/run/JerseyRunPublicForm.tsx` | The **only** place a size gets set (`orderEntries.submitOrder`) |
| Responses | `app/portal/orders/[id]/run/responses/page.tsx` | Table of sized items. Read-only |
| Manage run | `app/portal/orders/[id]/run/setup` → `JerseyRunSetup.tsx` | Link, deadline, custom questions |
| Start collecting | `components/portal/StartCollecting.tsx` | Creates the run; asks for a deadline |

Data today (`convex/schema.ts`): a **rosterEntry** is a player on a design
(name, number, C/A) with no size. An **orderEntry** is a jersey to make (design,
size, qty, submitter), optionally tied to a rosterEntry. Both hang off a
**jerseyRun**, so nothing can be added to an order until a run exists.

What I measured on the walk:

| Finding | Evidence |
|---|---|
| Captain can't set a size from the portal | Roster sheet has name, number, C/A only (`today-roster-sheet-375.png`) |
| Adding "Sidestep #72 – M" took the fan form: my name + email as "submitter", then name, number, size, Submit | 8 taps on `/run/<id>` (`today-order-form-375.png`) |
| Sized items can't be edited or removed | Responses page has 0 edit/remove controls. The only mutations are `orderEntries.create` and `submitOrder`, so the backend has no update or delete at all |
| Removing a player who has a size fails with a raw error | Toast: *"[CONVEX M(rosterEntries:remove)] [Request ID: …] Server Error Uncaught ConvexError: This slot has orders on it — remove those first. at handler (../convex/rosterEntries.ts:266:8) Called by client"* (`today-remove-error-375.png`). No screen can "remove those first" |
| An order without a run can't take items | `Snap Demo — No Run Yet` card says "Start collecting below to start building this design's roster". Start collecting needs a deadline first |
| Items are buried | Order page is 2,964px tall (3.7 screens). First "Manage roster" sits at y≈2,191px, below the 8-step timeline, the basics card and the names-mode picker (`today-order-page-375.png`) |
| Responses table overflows | 859px wide inside a 341px box on a 375 screen. Columns run Submitter, Email, Design, Jersey, Size…, so size is off-screen (`today-responses-375.png`) |
| Same thing, six names | roster, slot, "not yet filled", collected, responses, jerseys (plus "jersey run", "run", "collecting") |
| Nothing in the UI locks an order | `jerseyRuns.lock` / `unlock` exist but no component calls them. The only lock is the lazy one when the deadline passes (`lib/jerseyRun/lock.ts`) |

What works and should stay: the public form itself, paste-from-spreadsheet
with preview, copy roster between designs, C/A letters, CSV export, the size
summary chips, and the locked read-only pattern (`OrderLocked`).

## 3. Journeys

### Captain today: "add Sidestep #72 in a medium"

```
Group chat: "put me down, #72, medium"
  │
  ▼
Order page ──scroll ~3 screens──► Home Kit card ──► [Manage roster]
  │                                                   │ add "Sidestep" 72
  │                                                   ▼
  │                                     row says "not yet filled"  ✗ no size here
  ▼
Collect section ──► Manage run ──► copy link ──► open own link
  │
  ▼
Fan form: type MY name + MY email ──► name, number ──► tap M ──► Submit
  │
  ▼
Back to order page: row shows M                                   8+ taps, 4 screens
  │
  ▼
Player texts "actually L" ──► no edit anywhere ──► remove row ──► raw server error
                                                    └──► captain emails JCC
```

### Captain proposed: same job

```
Group chat: "put me down, #72, medium"
  │
  ▼
Order page ──(~1 screen)──► Order list · Home Kit ──► [+ Add item]
  │                                                     │ Sidestep · 72 · M · ×1
  │                                                     ▼ [Add]
  ▼
Row "Sidestep #72  M" on the list                                 4 taps + typing, 1 screen
  │
  ▼
Player texts "actually L" ──► ⋯ on the row ──► tap L ──► Save          3 taps
```

### Captain proposed: whole team from a spreadsheet

```
New order saved ──► Order list (empty) ──► [Paste a list]
  │  Name ⇥ Number ⇥ Size   (size column optional)
  ▼
Preview ──► [Add 14 items] ──► list shows 14 rows, "3 need a size"
  │
  ▼
[Make an order form] (optional) ──► pick deadline ──► Copy link ──► group chat
  │
  ▼
Players fill in their size ──► their rows flip from "Needs size" to M/L/…
```

### Player (unchanged surface, new destination)

```
Link in group chat ──► Order form ──► name, email, jersey(s), size ──► Submit
  │
  ▼
Lands on the captain's order list as "Added by <player>"
(fixed-names mode: picks their name from the list, and their size fills that row)
```

### JCC (admin): change after lock

```
Captain email: "Sam should be an L"
  │
  ▼
Admin order page ──► same Order list, editable for admin even when locked
  │ ⋯ Sam Okafor ──► L ──► Save
  ▼
CSV export / production basis shows L. Lock snapshot follows the rule in Q1.
```

## 4. What the captain sees (content)

Customer-facing copy, run through a humanizer pass. It follows the portal's
existing voice ("Tell us about your team.", "No design attached yet — that's
okay…"). No business facts are introduced except the one marked `[CONFIRM]`.

**Order page, list card**

- Heading: `Order list`
- Help line: `Everything we'll make for this order. Add items yourself, or share the order form and let players add their own.`
- Per design: `<Design title>` · `4 items · 1 needs a size`
- Row: `<Name> #<Number>` + C/A badge · subline `Added by you` / `Added by <submitter first name>` · size, or `Needs size`
- No name and no number: `No name`
- Buttons: `+ Add item`, `Paste a list`
- Footer: `7 items · S×1 M×2 L×1 2XL×2` · `1 needs a size`
- Empty design: `Nothing on the list yet` / `Add your players one at a time, paste a list from a spreadsheet, or share the order form and let them add themselves.`

**Add / edit item sheet**

- Titles: `Add an item` / `Edit item`, subtitle = design title
- Fields: `Name on jersey`, `Number`, hint `Leave either one blank if you don't want it printed.`
- `Size`, hint (add only) `Not sure yet? Skip it and we'll mark it "needs size".`
- `How many` (stepper), `Captain letter` (None / C / A)
- Edit sheet header block (read-only, only for player-sent items): `Added by` `<name> · <email> · <date>, through the order form`, then each custom question and answer
- Buttons: `Add`, `Add and start another` / `Save`, `Remove`
- After remove: toast `Removed <Name> #<Number> (<Size>)` with `Undo`

**Order form card (replaces "Collect from your team")**

- No form yet: `Order form` / `Want players to send their own name, number and size? Make a link to share. Everything they send lands on your list, and you can still change it.` / button `Make an order form`
- Form open: `Players add their own name, number and size. It all lands on your list above.` · chips `Open`, `Closes <date>` · buttons `Copy link`, `Form settings`
- `Form settings` holds the deadline, custom questions and names mode (moved off the order page):
  - `Players type their own name and number` / `Players pick their name from your list`

**Locked**

- `Locked for production.` `Your list is confirmed and we're making it now. Need a change? Email us and we'll sort it out.` "Email us" is a `mailto:info@sidestep.design` link (Q5 = A, JCC 2026-10-01). Keep it a real link: keyboard focusable, visible focus ring, and the underline and teal link style used elsewhere in the portal.

**Errors.** No raw server text reaches the captain. `Could not save that item. Please try again.` Anything specific (e.g. "The order is locked") gets its own sentence.

## 5. Mockup

`docs/ux/0004-order-items/mockup.html`, rendered as `mockup-1280.png` and
`mockup-frame1..6.png`. It reuses the portal's tokens and patterns: teal-600
primary, shadcn card/border/radius, amber notes, size pills from the public
form, the C/A badge and the bottom `Sheet` (already used by `RosterSheet`).

1. **Order page.** The timeline folds to one line on phones ("Step 1 of 8 ·
   Order started · See all steps"). The order list comes next, then the order
   form card, then order details. The list heading sits at y≈278 and the first
   item at y≈457 on 375×812. Today the first item is at about 2,191.
2. **+ Add item.** One sheet with name, number, size, how many and letter. "Add
   and start another" keeps the sheet open with the fields cleared.
3. **Edit a player's item.** Who sent it and their answers sit read-only on top.
4. **Remove with undo.** No confirm dialog. Removing a player with a size just works.
5. **New order.** The list is usable with no deadline and no link. The order form is opt-in.
6. **Locked.** Edit controls go away and CSV export stays.

Rejected alternative: **add a size picker to the existing Manage roster
sheet.** It's the smallest change, but names and sizes stay in two lists, Responses
stays read-only, remove still fails on sized players, and the captain still
needs a run before adding anyone. It patches one symptom of the split and keeps
the split.

Also rejected: **making Responses the editable list.** It's a table, it's 859px
wide on a phone, and it's organised by submitter. The captain thinks by player
and design.

## 6. Terminology proposal

One noun per concept on screen. The code can keep its names, and the architect
decides whether renaming the schema is worth it.

| Concept | Today (UI) | Proposed (UI) | Code today | Why |
|---|---|---|---|---|
| The whole job for a team | Order | **Order** (keep) | `orders` | Already clear |
| Everything we'll make | roster, collected, responses | **Order list** | `rosterEntries` + `orderEntries` | Captains say "our list". One name for the one thing |
| One line on it | slot, jersey, entry, response | **Item** | `orderEntries` (+ its `rosterEntry`) | Product-neutral, so hats later don't need a rename |
| An item with no size yet | "not yet filled" | **Needs size** | rosterEntry with 0 orderEntries | Says what to do, not a state |
| The shareable link + deadline | jersey run, run, collecting | **Order form** | `jerseyRuns` | Players fill in a form. "Run" means nothing outside Sidestep |
| Names mode | Open / Fixed roster | **Players type their own name** / **Players pick from your list** | `namesMode` | Describes what the player sees |
| Design | Design (Home Kit) | **Design** (keep) | `designs` | Titles like "Home Kit" already carry meaning |
| Locked | Locked / Roster locked / Order locked | **Locked for production** | `status: "locked"` | Says why it's locked |

Watch-outs:
- "Order form" could be confused with the captain's own *New order* page. It's
  headed "Tell us about your team." and its button says `Create order`, so
  I don't think it will, but SDET should watch for it in review.
- "Item" is the UI word. Where the context is clearly a jersey (the public
  form's "Add another jersey"), keep "jersey". Players ordering jerseys should
  read "jersey".
- Alternatives considered for *order form*: "sign-up link" (sounds like an
  account) and "team link" (doesn't say what it does). Rejected.

## 7. Behaviour rules (UX requirements for the architect)

The architect owns the data design. These are the rules the screens need:

1. An item is: design, optional name, optional number, optional C/A, size
   **or none**, how many (≥1), who added it (captain or submitter), and custom
   answers if it came from the order form.
2. The captain can add, edit (every field) and remove **any** item on their
   order until it is locked, whoever added it. (JCC, 2026-09-29.)
3. Items can be added **before any order form exists**. A deadline is asked
   only when the captain makes the order form. (JCC, 2026-09-29.)
4. Removing an item removes it whole: player, sizes, the lot. There's no
   "remove those first" step. Undo restores it exactly.
5. A no-size item shows as `Needs size` and counts toward "needs a size", not
   toward the item total.
6. Fixed-names mode keeps working: the player picks a name from the list, and
   their size fills that item. A second pick of the same name follows today's
   collision flag (M-07), and does not silently create a duplicate.
7. Paste accepts an optional 3rd column, size. Unknown sizes land as `Needs size`
   and are listed in the preview. They are not rejected.
8. Admin sees the same list on the admin order page and can edit even when locked.
9. The per-design summary chips, the order total and the CSV export all read
   the same list, so they can't disagree.
10. Player-facing behaviour of the order form doesn't change in this initiative.

## 8. Acceptance criteria (UX)

- On a 375×812 screen, the order list heading is visible without scrolling on
  an order page with the timeline folded (mockup: y≈278).
- On 375px, no order-list row, sheet or card scrolls horizontally.
- From the order page, a captain adds "Sidestep #72, M, ×1" in ≤ 4 taps plus
  typing, without leaving the order page.
- A captain can change the size of an item a player submitted, and the
  per-design chips and footer total update without a refresh.
- Removing an item that has a size succeeds, shows `Removed … Undo`, and Undo
  restores the same name, number, size, qty, letter and submitter.
- An order with no order form shows `+ Add item` and `Paste a list`, and adding
  works. No deadline prompt appears until `Make an order form`.
- An item saved without a size shows `Needs size`, and the design and footer
  counts say how many need a size.
- Paste with a size column creates sized items. A bad size lands as `Needs size`
  and is named in the preview.
- When locked, no add/edit/remove control renders anywhere on the captain's
  order page, and `Download CSV` still works.
- No customer-visible message contains `CONVEX`, `ConvexError`, a request id or
  a file path.
- Every control in the list and sheet is reachable by keyboard with a visible
  focus ring. Row menus have labels like `Edit Sidestep #72`. Tap targets are ≥ 40px
  (mockup: none under 36px, checked by script).
- With reduced motion on, the sheet and toast appear without animation.
- The words "roster", "slot", "jersey run", "collected" and "responses" don't
  appear in captain-facing portal copy (admin pages may keep them).

## 9. Open questions (`needs_decision`)

**Q1. What locks the list? (blocks the build)**
Today the only lock is the order-form deadline passing, and no button locks or
unlocks. If captains can add items with no form (JCC's decision), that rule
leaves a form-less order never locking, and a form-backed order locking the
moment players stop signing up. That's often before the captain has fixed the
sizes.
- A. **The deadline closes the order form only. The list locks when JCC marks it
  confirmed** (e.g. the "Order Size Confirmed" stage in admin). The captain edits
  until then. *Recommended:* it matches how a real order is confirmed, and JCC
  keeps control of what goes to the factory.
- B. The deadline closes the form, and the captain taps "Send my list to
  Sidestep" to lock it. JCC can unlock.
- C. Keep today's rule: the deadline locks everything.

**Q2. Can a list be confirmed with `Needs size` items on it?**
- A. **No. Confirming asks you to size or remove them first**, and names them. *Recommended:* a jersey with no size can't be made.
- B. Yes, and JCC chases them.

**Q3. Tell the player when the captain changes or removes their item?**
- A. **Not in this initiative.** The item shows "Added by Riley" so the captain knows whose it is. *Recommended:* keeps scope tight. Resend is already wired (`convex/jerseyRunActions.ts` emails the captain and ops when a form closes), so B is a small follow-up if wanted.
- B. Email the player on change.

**Q4. Terminology (section 6): adopt "order list / item / order form / needs size"?**
- A. **Yes, captain-facing copy only.** Code names stay. *Recommended.*
- B. Yes, and rename the code too (architect to size it).
- C. Keep today's words.

**Q5. Locked-note contact route.** `Email us` or something else? **Decided: A, `mailto:info@sidestep.design`** (JCC, Discord, 2026-10-01).

### JCC decisions, 2026-09-29 (Discord, #general thread "Review add-to-order item workflow")

- Items are lines like "Sidestep #72 – M". Customers add them through jersey runs.
- A captain should add sized items themselves and manage the entire list.
- **Captain can edit items**, including player-submitted ones.
- **Captain can add items before starting a run.**
- **Hats: out of scope.** Brief the PM to log it as low priority.
- Terminology improvements are welcome in this doc (section 6).

## 10. Out of scope

- **Hats / non-jersey products.** Parked by JCC (low priority, PM to log).
  Choosing "item" as the UI word keeps the door open. The data model today ties
  every item to a design and one shared size catalog (`SIZE_OPTIONS`), and a hat
  probably breaks both. That's for a later initiative.
- Changes to the player-facing order form.
- Factory export format and validation rules (number uniqueness etc.) from the
  rest of 0004.
- Pricing on the list. The Responses page already shows an estimated total
  from `lib/pricing.ts`, and whether the list shows one is a later call.
