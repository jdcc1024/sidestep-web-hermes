import type { Id } from "@/convex/_generated/dataModel";
import { OrderList } from "@/components/orderList/OrderList";
import type { OrderListData } from "@/components/orderList/shared";
import type { OrderDesign } from "./shared";

// The order list's place on the order page (L-03): straight after the
// timeline, so it's the first thing a captain reaches. The page owns the one
// `listForOrder` read and passes it through; this section only adapts the
// page's data to the list's props, so L-04 and L-05 can change the list's
// surroundings here without touching the page.
export function OrderListSection({
  orderId,
  teamName,
  designs,
  list,
}: {
  orderId: Id<"orders">;
  teamName: string;
  designs: readonly OrderDesign[];
  list: OrderListData | null | undefined;
}) {
  return (
    <div className="mt-6">
      <OrderList
        orderId={orderId}
        teamName={teamName}
        designs={designs}
        list={list}
      />
    </div>
  );
}
