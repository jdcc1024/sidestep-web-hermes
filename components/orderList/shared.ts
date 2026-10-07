import { createContext, useContext } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ItemView, PlayerView } from "@/lib/orderItem";

// What `orderItems.listForOrder` hands the page once it has loaded: every
// player on every design (with their size lines, flattened again as `items`
// for the CSV), the per-design and order-wide summaries, and the server's
// verdict on whether the captain may edit.
export type OrderListData = NonNullable<
  FunctionReturnType<typeof api.orderItems.listForOrder>
>;

export type OrderPlayer = PlayerView<
  Id<"orderItems">,
  Id<"designs">,
  Id<"rosterEntries">
>;
export type OrderItem = ItemView<
  Id<"orderItems">,
  Id<"designs">,
  Id<"rosterEntries">
>;

// The order form's custom questions. A player's answers are stored by question
// id; the edit sheet shows the question's label, falling back to the stored
// key when the form no longer has that question.
export type CustomQuestion = { id: string; label: string };
const CustomQuestionsContext = createContext<readonly CustomQuestion[]>([]);
export const CustomQuestionsProvider = CustomQuestionsContext.Provider;
export function useQuestionLabel(): (key: string) => string {
  const questions = useContext(CustomQuestionsContext);
  return (key) => questions.find((q) => q.id === key)?.label ?? key;
}

// The design a list group belongs to, as the order page already has it.
export type OrderListDesign = {
  _id: Id<"designs">;
  title: string;
  mainImage: {
    url: string | null;
    filename: string;
    contentType: string;
  } | null;
};

// The approved sentences (UX §4, "Errors"). Anything the server words for the
// captain arrives as a ConvexError and replaces these via `userMessage`.
export const SAVE_FAILED = "Could not save that player. Please try again.";
export const RESTORE_FAILED = "Could not restore that player. Please try again.";

// How long the Undo toast stays up (mockup frame 4: "about 8 seconds").
export const UNDO_TOAST_MS = 8000;

const TABBABLE = "a[href], button, input, textarea, select, [tabindex]";

// Keeps Tab cycling inside an open sheet by wrapping at either end. Base UI
// already traps focus with guard elements either side of the popup, but a
// guard hands focus back a frame later, so for that frame focus sits on an
// invisible element outside the sheet. Wrapping on the keydown means Tab
// never leaves the sheet at all.
export function wrapTabWithin(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const tabbable = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(TABBABLE),
  ].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el as HTMLButtonElement).disabled &&
      !el.closest("[aria-hidden='true'], [inert], [hidden]") &&
      el.getAttribute("type") !== "hidden",
  );
  if (tabbable.length === 0) return;
  const first = tabbable[0];
  const last = tabbable[tabbable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === event.currentTarget)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
