// Public surface of the roster-entry lib. Re-exports the atomic rules
// (constants, RosterSource, check helpers, rosterMatchKey), the form
// adapter, and the bulk-paste parser so consumers import from
// "@/lib/rosterEntry" while the Convex side imports from
// "@/lib/rosterEntry/rules" and "/paste" directly.

export * from "./rules";
export * from "./form";
export * from "./paste";
