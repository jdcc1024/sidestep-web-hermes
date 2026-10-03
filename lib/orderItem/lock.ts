// When the order list locks (initiative 0004, L-06, Q1 = A): once JCC checks
// the internal stage "Order Size Confirmed". The order form's deadline plays no
// part; it only closes the public form. Pure, so the Convex write guard and
// any UI that wants to know agree by construction.

export const LIST_CONFIRMED_STAGE = "Order Size Confirmed";

export function isListConfirmed(order: {
  internalStages: { name: string; completedAt?: number }[];
}): boolean {
  return order.internalStages.some(
    (stage) =>
      stage.name === LIST_CONFIRMED_STAGE && stage.completedAt !== undefined,
  );
}
