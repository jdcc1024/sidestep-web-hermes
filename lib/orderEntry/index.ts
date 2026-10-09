// Public surface of the order-entry lib: the atomic rules (constants,
// OrderSource, check helpers) the public order form and `submitOrder` share,
// plus the form's jersey-card rules (R2-05) and its display derivations
// (0004 R3-01). Consumers import from "@/lib/orderEntry" while the Convex
// side imports from "@/lib/orderEntry/rules" directly.

export * from "./rules";
export * from "./form";
export * from "./publicForm";
