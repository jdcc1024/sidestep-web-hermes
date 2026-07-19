import Link from "next/link";

import { Button } from "@/components/ui/button";
import { JerseyCarousel } from "@/components/marketing/JerseyCarousel";

export function HeroSection() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-border bg-gradient-to-b from-teal-50/60 to-background dark:from-teal-950/30"
    >
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-28">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
            Your Team. Your Colors.
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Custom team jerseys, designed with you.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Sidestep is a Vancouver-based custom jersey studio. Backed by 20+
            years of industry experience, we help your team design and produce
            fully sublimated jerseys that reflect your story — from concept to
            delivery.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" className="h-11 bg-teal-600 px-5 text-sm text-white shadow-sm hover:bg-teal-700">
                <Link href="/intake">Start your order</Link>
              </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11 px-5 text-sm">
                <Link href="#process">See our process</Link>
              </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Serving the Greater Vancouver area. Most orders ship in around 4
            weeks.
          </p>
        </div>

        <JerseyCarousel />
      </div>
    </section>
  );
}
