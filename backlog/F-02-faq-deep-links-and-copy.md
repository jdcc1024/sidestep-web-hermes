# Issue: FAQ deep links + admin-only Copy answer / Copy link

## Phase: 2

## Type: feature

## Size: M (~10 files)

## Description

Initiative 0001, the "send an answer in under a minute" half. It makes
`/#faq-<id>` open one answer, and puts **Copy answer** and **Copy link**
buttons inside each open answer, **visible only to a signed-in admin (JCC,
D9 = B)**. The design is in `docs/architecture/0001-faq.md` (Deep links, Copy
action, Admin check). UX spec: `docs/ux/0001-faq.md` §4 (Journeys A' and B),
§5 and §7. The mockup shows the buttons to everyone and older copy; the spec
wins.

### Split `FaqSection` at the client boundary

`FaqSection` stays a server component. It computes, per published entry,
`{ id, question, answerNode, plainText }`, where `answerNode` is the rendered
blocks plus fine print (F-01) and `plainText` is
`toPlainText(parseAnswer(answer))`, which never includes `finePrint`. It passes
them to a new client component, **`FaqAccordion`**. Only the rendered node and
the plain-text string cross the boundary, and the client never parses Markdown.

### `FaqAccordion` ("use client")

- It controls the Base UI `Accordion` `value` (single-open, as today).
- On mount and on `hashchange`, it reads `location.hash`. If it matches
  `^#faq-([a-z0-9-]+)$` and the id is one of the rendered items:
  1. set `value` to `[id]` (that item alone is open)
  2. after the panel renders, scroll the item into view with
     `behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"`,
     `block: "start"`
  3. focus that item's trigger with `{ preventScroll: true }`
- Any other hash, or an unknown id, changes nothing and throws nothing.
- Each item gets `scroll-mt-20` so the item sits clear of the 64px sticky nav.
- Opening or closing items by hand does **not** rewrite the URL. Keep history clean.

### `useIsAdmin()` (`lib/useIsAdmin.ts`, "use client")

```ts
export function useIsAdmin(): boolean
```

`const { isAuthenticated } = useConvexAuth()`, then
`useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip")`, and return
`user?.isAdmin === true`. So: loading, signed out, no Convex row yet, or
`isAdmin: false` → `false`. It must carry a comment: *UI hint only; never use
it to authorise anything. Server code uses `requireAdmin` / the admin layout's
Clerk check.*

Why this path (full reasoning in the architecture note): Clerk private
metadata can't be read in the browser, and `users.isAdmin` is the existing
Convex cache of it, written only by `internal.users.applyClerkUser` from a
server-side Clerk fetch. `getCurrentUser` takes no args and returns only the
caller's own row, and `UserSync` already subscribes to it on every page. No
new Convex function, no public-metadata path, no Clerk call per page view, and
the page stays static.

**Do not** read Clerk `publicMetadata`, `unsafeMetadata`, session claims or
`is_admin` anywhere, and do not add or change any function under `convex/`.

### `CopyAnswerButtons` ("use client")

Props: `{ id: string; plainText: string }`. Rendered at the bottom of each
`AccordionContent` (after the fine print), so it exists only while that item
is open. **If `useIsAdmin()` is false it returns `null`**: no wrapper, no
spacer, no placeholder. It owns its own top margin, so for a non-admin the
panel ends where the answer (or fine print) ends, and when the buttons appear
for an admin they only add height below the text (the text doesn't move).

Two outline `Button`s, `size="sm"` plus a class for a 40px minimum height:
- **Copy answer** (Copy icon) → `navigator.clipboard.writeText(faqCopyText(plainText, siteOrigin(), id))`
- **Copy link** (Link icon) → `writeText(faqUrl(siteOrigin(), id))`

`siteOrigin()` returns `process.env.NEXT_PUBLIC_SITE_URL` (trailing `/`
stripped) when set and non-empty, else `window.location.origin`. There is no
production site yet (JCC, A1): JCC may copy from `localhost:8080`, and the link
must still point at the public preview URL (Tailscale Funnel today, the real
domain later). Put it in `lib/faq.ts` next to `faqUrl`, and add
`NEXT_PUBLIC_SITE_URL` (commented out, no value) to `.env.example` if that file
exists, otherwise note it in the handoff.

Feedback follows `components/admin/CopyInviteLinkButton.tsx`: the icon becomes
a check and the label "Copied!" for 2 s on the button that was pressed, plus a
sonner success toast ("Answer copied. Paste it into your message." / "Link
copied."). On a rejected `writeText`, show an error toast containing the text
that would have been copied. Origin is read at click time, not render time.

### Remove `<Reveal>` from the FAQ

In `app/page.tsx`, render `<FaqSection />` without `<Reveal>`. A deep link lands
mid-page, and the fade-and-rise would play on the content the visitor asked for,
then shift it under the nav. Add a one-line comment saying why, next to the
existing comment about the hero exception. In `scripts/check-reduced-motion.mjs`,
change `REVEALED_SECTION` from `'#faq'` to `'#quote'` and update its comment.

## Acceptance Criteria

Deep link (`FaqAccordion.test.tsx`, jsdom; stub `scrollIntoView` and `matchMedia`)
- [ ] With `location.hash = "#faq-timeline"` at mount, only the "timeline" item is open (its trigger has `aria-expanded="true"`, all others `"false"`)
- [ ] …and its trigger is `document.activeElement`
- [ ] …and `scrollIntoView` was called on the timeline item with `behavior: "smooth"`, or with `"auto"` when `matchMedia` reports reduced motion
- [ ] Dispatching `hashchange` after setting `location.hash = "#faq-shipping"` opens shipping and closes timeline
- [ ] `#faq-nope`, `#faq`, `#pricing` and an empty hash leave all items closed, don't call `scrollIntoView`, and throw nothing
- [ ] A hash naming an id that isn't rendered (for example the unpublished `design-tips`) behaves like an unknown id
- [ ] Clicking a trigger doesn't change `location.hash`
- [ ] Keyboard: Tab reaches each trigger, and Enter/Space toggles it (unchanged from today)

Admin gate (`useIsAdmin.test.tsx` + `CopyAnswerButtons.test.tsx`; mock `convex/react` `useConvexAuth`/`useQuery` as in `components/layout/UserSync.test.tsx`)
- [ ] `useIsAdmin` is `true` only when authenticated and `getCurrentUser` returns `{ isAdmin: true }`
- [ ] `useIsAdmin` is `false` while auth is loading, when not authenticated (and then `useQuery` is called with `"skip"`), when the query is `undefined` (loading) or `null` (no row), and when `isAdmin` is `false`
- [ ] Non-admin (each of the false cases above): an open item renders no "Copy answer"/"Copy link" and `CopyAnswerButtons` renders nothing at all (its container is empty: `container.firstChild === null`)
- [ ] Admin: an open item renders exactly one "Copy answer" and one "Copy link"; collapsed items render neither
- [ ] Switching the mocked query from `undefined` to `{ isAdmin: true }` (re-render) makes the buttons appear without throwing
- [ ] Static guard (grep test or review): `lib/useIsAdmin.ts` and `components/marketing/*` contain no `publicMetadata`, `unsafeMetadata`, `sessionClaims` or `is_admin`; the F-02 diff touches nothing under `convex/`
- [ ] `lib/useIsAdmin.ts` has the "UI hint only, never authorise with it" comment

Copy (`CopyAnswerButtons.test.tsx`, jsdom, admin mocked true; stub `navigator.clipboard`, mock `sonner` as in `CopyInviteLinkButton.test.tsx`)
- [ ] Copy answer writes `plainText + "\n\n" + window.location.origin + "/#faq-" + id`, exactly (with `NEXT_PUBLIC_SITE_URL` unset)
- [ ] Copy link writes `window.location.origin + "/#faq-" + id`, exactly (with `NEXT_PUBLIC_SITE_URL` unset)
- [ ] With `NEXT_PUBLIC_SITE_URL="https://box.tail1234.ts.net/"` (`vi.stubEnv`), both buttons use `https://box.tail1234.ts.net/#faq-<id>` regardless of `window.location.origin`
- [ ] After a successful copy, the pressed button's accessible name contains "Copied!" and a success toast fires. The label reverts after 2 s (fake timers)
- [ ] When `writeText` rejects, an error toast fires whose message contains the exact text or URL, and the button doesn't show "Copied!"

End to end through `FaqSection` (fixtures, admin mocked true)
- [ ] Fixture with a list and a same-site link: the copied text has `• ` or `1. ` markers, the link's words with no URL inline, and exactly one URL, the deep link, on the last line
- [ ] Fixture with `finePrint: "Small print."`: the fine print is visible in the open panel, and the copied text does not contain "Small print."
- [ ] Fixture with a `**Heading**` line and an `https://x.test/article` link: the copied text contains the heading text without `**`, contains `https://x.test/article` on a line of its own, and exactly two URLs, with the deep link last

Page
- [ ] `app/page.tsx` no longer wraps `FaqSection` in `<Reveal>`, and every other section keeps its `<Reveal>`
- [ ] `check-reduced-motion.mjs` targets `#quote`
- [ ] `npm run verify` passes

Manual / screenshot (SDET at review, and JCC at Gate 2)
- [ ] `node scripts/snap.mjs F-02 "/#faq-timeline"` at 375px, signed out: the timeline answer is open, fully opaque, its question sits below the sticky nav, no copy buttons, and the panel's bottom padding matches a closed item's rhythm (no empty gap). No horizontal scroll
- [ ] Same, signed in as admin: the buttons appear under the answer; the answer text doesn't move when they appear
- [ ] Every question row and Copy button is at least 40px tall at 375px
- [ ] Journey B on JCC's phone, signed in as admin: three questions, each under 60 s from reading the DM to sending (done_when check)

## Dependencies
- Blocked by: F-01-faq-answer-source

## Notes
- Files likely touched: `components/marketing/FaqSection.tsx` (+ test),
  `components/marketing/FaqAccordion.tsx` (+ test),
  `components/marketing/CopyAnswerButtons.tsx` (+ test), `lib/useIsAdmin.ts`
  (+ test), `lib/faq.ts` (`siteOrigin`), `app/page.tsx`,
  `scripts/check-reduced-motion.mjs`, `.env.example` if it exists.
- Nothing under `convex/` changes. `getCurrentUser` already exists
  (`convex/users.ts`); only call it.
- Test behaviour, not animation (CLAUDE.md). Motion is inert in jsdom anyway.
- Focus plus scroll timing: the panel must be mounted before `scrollIntoView`.
  Do it in an effect keyed on the opened value (or `requestAnimationFrame`
  after the state update), not synchronously in the hash handler.
- Don't add `hiddenUntilFound` here (it changes panel mounting and the "no
  buttons when collapsed" behaviour). It's a separate SEO follow-up.
- Client-side hash navigation from the nav (`/#faq` while already on `/`) is
  Next's default. Don't intercept it.
- Branching: this branch starts from the F-01 build branch (stacked, merged
  once at Gate 2).
