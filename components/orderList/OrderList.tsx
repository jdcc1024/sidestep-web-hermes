"use client";

import { useId } from "react";
import { AnimatePresence } from "motion/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { NamesMode } from "@/lib/orderForm";
import {
  jerseyCountText,
  playerCountText,
  sizeChip,
  type RosterSummary,
} from "@/lib/orderItem";
import { DesignThumbnail } from "@/components/design/DesignThumbnail";
import { RosterExportButton } from "@/components/portal/RosterExportButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyFromDesign } from "./CopyFromDesign";
import { PasteList } from "./PasteList";
import { PlayerRow } from "./PlayerRow";
import { PlayerSheet } from "./PlayerSheet";
import {
  CustomQuestionsProvider,
  type CustomQuestion,
  type OrderItem,
  type OrderListData,
  type OrderListDesign,
  type OrderPlayer,
} from "./shared";

// The order list (initiative 0004, L-03; players since R2-02): everything
// we'll make for the order, one group per design, one row per player with
// their sizes, editable in place. The captain-facing heart of the order page.
//
// No query of its own. The page reads `orderItems.listForOrder` once and hands
// it down, so every count here — a design's line, its size chips, the footer
// — comes from the same summary as the rows, and an edit moves all of them in
// one render. A jersey is a size line's qty; a named player with no sizes
// "needs sizes" and adds no jerseys, so every scope's jersey count is the sum
// of its chips.
export function OrderList({
  orderId,
  teamName,
  designs,
  list,
  customQuestions = [],
  namesMode,
}: {
  orderId: Id<"orders">;
  // Names the CSV download.
  teamName: string;
  // The order's linked designs, in the order the page shows them.
  designs: readonly OrderListDesign[];
  // `undefined` while loading (and `null` before auth attaches): nothing is
  // counted or offered until the real list is here.
  list: OrderListData | null | undefined;
  // The order form's custom questions, so a player's answers show under the
  // question's wording rather than its stored id. Empty with no form.
  customQuestions?: readonly CustomQuestion[];
  // The order form's names mode; absent with no form.
  namesMode?: NamesMode;
}) {
  const headingId = useId();
  const byDesign = new Map((list?.designs ?? []).map((d) => [d.designId, d]));

  return (
    <CustomQuestionsProvider value={customQuestions}>
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xl bg-card text-sm text-card-foreground ring-1 ring-foreground/10"
    >
      <div className="px-4 pt-5 pb-4 sm:px-6">
        <h2 id={headingId} className="text-lg font-semibold text-foreground">
          Order list
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything we&apos;ll make for this order. Add players yourself, or
          share the order form and let them add their own.
        </p>
      </div>

      {!list ? (
        <div className="space-y-3 border-t border-border px-4 py-5 sm:px-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : designs.length === 0 ? (
        <p className="border-t border-border px-4 py-5 text-sm text-muted-foreground sm:px-6">
          Attach a design to start the list.
        </p>
      ) : (
        <>
          {designs.map((design) => {
            const designList = byDesign.get(design._id);
            return (
              <DesignGroup
                key={design._id}
                orderId={orderId}
                teamName={teamName}
                design={design}
                players={designList?.players ?? []}
                items={designList?.items ?? []}
                summary={designList?.summary ?? EMPTY_SUMMARY}
                otherDesigns={designs.filter((d) => d._id !== design._id)}
                canEdit={list.canEdit}
                pickFromList={namesMode === "fixed"}
              />
            );
          })}
          <Footer summary={list.summary} />
        </>
      )}
    </section>
    </CustomQuestionsProvider>
  );
}

const EMPTY_SUMMARY: RosterSummary = {
  jerseyCount: 0,
  playerCount: 0,
  needsSizes: 0,
  bySize: [],
};

// `3 players · 10 jerseys · 1 needs sizes`; the last part only when someone
// does.
function countLine({ playerCount, jerseyCount, needsSizes }: RosterSummary): string {
  const parts = [playerCountText(playerCount), jerseyCountText(jerseyCount)];
  if (needsSizes > 0) parts.push(`${needsSizes} needs sizes`);
  return parts.join(" · ");
}

function DesignGroup({
  orderId,
  teamName,
  design,
  players,
  items,
  summary,
  otherDesigns,
  canEdit,
  pickFromList,
}: {
  orderId: Id<"orders">;
  teamName: string;
  design: OrderListDesign;
  players: readonly OrderPlayer[];
  // The players' size lines, one per jersey row in the CSV.
  items: readonly OrderItem[];
  summary: RosterSummary;
  otherDesigns: readonly OrderListDesign[];
  canEdit: boolean;
  pickFromList: boolean;
}) {
  // When players pick their name from the list (fixed mode, M-05), the public
  // form only offers the names already on the design, so a design with none
  // takes no orders.
  const unorderable = pickFromList && !players.some((player) => player.name);
  // The CSV is one row per jersey, plus one size-less row per player who
  // still needs sizes: the captain reads the file to see who owes one
  // (lib/rosterExport.ts). A player with no size lines has no `items`.
  const exportRows = [
    ...items,
    ...players
      .filter((player) => player.needsSizes)
      .map(({ name, number, designation }) => ({
        name,
        number,
        designation,
        qty: 1,
      })),
  ];

  return (
    <div
      role="group"
      aria-label={design.title}
      className="border-t border-border"
    >
      <div className="flex items-center gap-3 px-4 pt-4 pb-2 sm:px-6">
        <DesignThumbnail
          title={design.title}
          mainImage={design.mainImage}
          className="size-10 shrink-0 rounded-lg"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {design.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {players.length === 0 ? "No players yet" : countLine(summary)}
          </p>
        </div>
      </div>

      {summary.bySize.length > 0 && (
        <ul
          aria-label={`Size breakdown for ${design.title}`}
          className="flex flex-wrap gap-1 px-4 pb-3 sm:px-6"
        >
          {summary.bySize.map((entry) => (
            <li
              key={entry.size}
              className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground"
            >
              {sizeChip(entry)}
            </li>
          ))}
        </ul>
      )}

      {/* A warning, not a block: the captain is usually mid-way through
          adding names, and blocking would fight that. Disappears with the
          first named player. */}
      {unorderable && (
        <p
          role="note"
          aria-label={`Nobody can order ${design.title}`}
          className="mx-4 my-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-6 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
        >
          <span className="font-semibold">Nobody can order this design.</span>{" "}
          Players pick their name from your list, and this design has no
          names on it yet. Add some here, or let players type their own in
          Form settings.
        </p>
      )}

      {players.length === 0 && (
        <div className="mx-4 my-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-5 text-center sm:mx-6">
          <p className="font-medium text-foreground">Nobody on the list yet</p>
          {canEdit && (
            <p className="mt-1 text-sm text-muted-foreground">
              Add players one at a time, paste a list from a spreadsheet, or
              share the order form and let them add themselves.
            </p>
          )}
        </div>
      )}

      {/* The list stays mounted through the empty state, so the first player
          added is a row arriving into a list like every one after it. An
          empty `ul` takes no space; `relative` gives the row `popLayout` lifts
          out of the flow something to be positioned against while it fades.

          initial={false}: the items already there on load are not news, only
          rows that arrive while the captain watches animate. popLayout makes
          the gap close rather than snap: a leaving row left in the flow holds
          its space for the whole fade, and by the time it drops the survivors
          are re-rendered from cached elements, so they never measure where
          they were and arrive with nothing to animate from. No `layoutScroll`
          here: the rows scroll with the page, not inside a scrolling box,
          and Motion already accounts for window scroll. */}
      <ul aria-label={`Players on ${design.title}`} className="relative">
        <AnimatePresence initial={false} mode="popLayout">
          {players.map((player) => (
            <PlayerRow
              key={player.entryId}
              player={player}
              players={players}
              orderId={orderId}
              designTitle={design.title}
              canEdit={canEdit}
            />
          ))}
        </AnimatePresence>
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3 sm:px-6">
        {canEdit && (
          <>
            <PlayerSheet
              orderId={orderId}
              designId={design._id}
              designTitle={design.title}
              players={players}
              trigger={
                <Button
                  type="button"
                  className="h-10 bg-teal-600 px-3.5 font-semibold text-white hover:bg-teal-700"
                />
              }
            >
              + Add player
            </PlayerSheet>
            <PasteList
              orderId={orderId}
              designId={design._id}
              designTitle={design.title}
              players={players}
              className="h-10 px-3"
            />
            <CopyFromDesign
              orderId={orderId}
              designId={design._id}
              otherDesigns={otherDesigns}
              className="h-10 px-3"
            />
          </>
        )}
        <RosterExportButton
          teamName={teamName}
          designTitle={design.title}
          items={exportRows}
          className="h-10 px-3 sm:ml-auto"
        />
      </div>
    </div>
  );
}

// The whole order's line: `10 jerseys · S×1 M×5 …`, and how many players
// still need sizes beside it. Only the linked designs — a removed design's
// jerseys are out of the summary already (they keep their own section, O-08).
function Footer({ summary }: { summary: RosterSummary }) {
  const sizes = summary.bySize.map(sizeChip).join(" ");
  const jerseys = jerseyCountText(summary.jerseyCount);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-muted/50 px-4 py-3 sm:px-6">
      <p className="font-semibold tabular-nums text-foreground">
        {sizes ? `${jerseys} · ${sizes}` : jerseys}
      </p>
      {summary.needsSizes > 0 && (
        <p className="font-medium text-amber-800 dark:text-amber-200">
          {`${playerCountText(summary.needsSizes)} ${summary.needsSizes === 1 ? "needs" : "need"} sizes`}
        </p>
      )}
    </div>
  );
}
