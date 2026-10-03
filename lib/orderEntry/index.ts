// Public surface of the order-entry lib: the atomic rules (constants,
// OrderSource, check helpers) the public order form and `submitOrder` share.
// Consumers import from "@/lib/orderEntry" while the Convex side imports from
// "@/lib/orderEntry/rules" directly.

export * from "./rules";
