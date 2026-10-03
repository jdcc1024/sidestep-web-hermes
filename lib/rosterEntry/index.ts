// Public surface of the roster-entry lib. Re-exports the atomic rules
// (constants, RosterSource, check helpers, rosterMatchKey) and the mirror plan
// so consumers import from "@/lib/rosterEntry" while the Convex side imports
// from "@/lib/rosterEntry/rules" and "/mirror" directly. The paste parser
// lives in "@/lib/orderItem" (L-04).

export * from "./rules";
export * from "./mirror";
