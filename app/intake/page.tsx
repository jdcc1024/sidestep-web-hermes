import { Suspense } from "react";
import type { Metadata } from "next";
import { MarketingShell } from "@/components/layout/MarketingShell";
import { IntakeForm } from "@/components/intake/IntakeForm";

export const metadata: Metadata = {
  title: "Start your order — Sidestep",
  description:
    "Tell us about your team and we'll come back with ideas, mock-ups, and a quote.",
};

export default function IntakePage() {
  return (
    <MarketingShell>
      <section className="border-b border-border bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 pt-16 pb-10 sm:px-6 sm:pt-20 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            Start your order
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Let&apos;s outfit your team.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            A few quick details and we&apos;ll come back with ideas, mock-ups,
            and a quote — usually within one business day.
          </p>
        </div>
      </section>

      <section className="bg-background">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Suspense fallback={null}>
            <IntakeForm />
          </Suspense>
        </div>
      </section>
    </MarketingShell>
  );
}
