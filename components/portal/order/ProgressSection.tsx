import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderTimeline } from "@/components/portal/OrderTimeline";
import type { CustomerStageName } from "@/lib/orderStages";

// Where the order stands. On a phone the card is one line (the timeline folds
// itself, L-03) so the order list starts within the first screen; from `sm`
// up it is the full card it always was.
export function ProgressSection({
  stage,
}: {
  stage: CustomerStageName | null;
}) {
  return (
    <Card
      aria-labelledby="timeline-heading"
      className="mt-6 py-3 sm:mt-10 sm:py-6"
    >
      <CardHeader className="hidden gap-1.5 sm:grid">
        <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase dark:text-teal-300">
          Progress
        </p>
        <CardTitle id="timeline-heading" className="text-base">
          Where your order stands
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Updates live as Sidestep moves your order forward.
        </p>
      </CardHeader>
      <CardContent>
        <OrderTimeline currentStage={stage} />
      </CardContent>
    </Card>
  );
}
