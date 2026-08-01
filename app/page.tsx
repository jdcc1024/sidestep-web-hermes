import { MarketingShell } from "@/components/layout/MarketingShell";
import { Reveal } from "@/components/motion/Reveal";
import { HeroSection } from "@/components/marketing/HeroSection";
import { CustomizeSection } from "@/components/marketing/CustomizeSection";
import { ProcessSection } from "@/components/marketing/ProcessSection";
import { PricingSection } from "@/components/marketing/PricingSection";
import { FaqSection } from "@/components/marketing/FaqSection";
import { QuoteCtaSection } from "@/components/marketing/QuoteCtaSection";

// Each section is wrapped rather than animating itself: <Reveal> is a client
// component that renders `children` handed to it, so every section below stays
// a server component.
export default function Home() {
  return (
    <MarketingShell>
      <Reveal>
        <HeroSection />
      </Reveal>
      <Reveal>
        <ProcessSection />
      </Reveal>
      <Reveal>
        <CustomizeSection />
      </Reveal>
      <Reveal>
        <PricingSection />
      </Reveal>
      <Reveal>
        <FaqSection />
      </Reveal>
      <Reveal>
        <QuoteCtaSection />
      </Reveal>
    </MarketingShell>
  );
}
