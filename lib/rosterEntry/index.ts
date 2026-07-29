// Public surface of the roster-entry lib. Re-exports the atomic rules
// (constants, RosterSource, check helpers, rosterMatchKey), the form
// adapter, the bulk-paste parser, and the mirror plan so consumers import
// from "@/lib/rosterEntry" while the Convex side imports from
// "@/lib/rosterEntry/rules", "/paste", and "/mirror" directly.

export * from "./rules";
export * from "./form";
export * from "./paste";
export * from "./mirror";
