import { StaggerGroup, StaggerItem } from "@/components/motion/Stagger";
import { Card, CardContent } from "@/components/ui/card";

const steps = [
  {
    number: "01",
    title: "Design Template",
    description:
      "Drop your colors, logos, and ideas onto our jersey design template. Need a hand? Our design team can build it with you.",
  },
  {
    number: "02",
    title: "3D Mock-up",
    description:
      "We turn your design into a 3D mock-up so you can see exactly how it'll look on the jersey before anything gets stitched.",
  },
  {
    number: "03",
    title: "Production",
    description:
      "Once you're happy with the mock-up, production starts. Most orders arrive in around 4 weeks.",
  },
];

export function ProcessSection() {
  return (
    <section
      id="process"
      className="border-b border-border bg-muted/40 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
            Process
          </p>
          <h2 className="mt-3 font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            From design to delivery in three steps.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            We keep the loop tight: you describe what you want, we visualize it,
            and the kit lands in your hands.
          </p>
        </div>

        {/* This section stays a server component: the cards are handed to
            <StaggerItem> as children, so the only client code on the page is
            the wrapper that sequences them. */}
        <StaggerGroup as="ol" className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, idx) => (
            <StaggerItem key={step.number} as="li" className="relative">
              <Card className="h-full gap-3 py-6 shadow-sm">
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 font-mono text-sm font-bold text-white"
                    >
                      {step.number}
                    </span>
                    <h3 className="text-lg font-semibold text-foreground">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-muted-foreground">{step.description}</p>
                </CardContent>
              </Card>
              {/* Inside the item, not beside it: the connector is decoration
                  belonging to its card and must arrive on the same turn. */}
              {idx < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute right-4 top-1/2 hidden h-px w-8 -translate-y-1/2 bg-border md:block lg:w-12"
                  style={{ right: "-1.75rem" }}
                />
              )}
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
