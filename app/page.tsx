import { MarketingShell } from "@/components/layout/MarketingShell";
import { HeroSection } from "@/components/marketing/HeroSection";
import { CustomizeSection } from "@/components/marketing/CustomizeSection";
import { ProcessSection } from "@/components/marketing/ProcessSection";
import { PricingSection } from "@/components/marketing/PricingSection";
import { FaqSection } from "@/components/marketing/FaqSection";
import { QuoteCtaSection } from "@/components/marketing/QuoteCtaSection";

export default function Home() {
  return (
    <MarketingShell>
      <HeroSection />
      <ProcessSection />
      <CustomizeSection />
      <PricingSection />
      <FaqSection />
      <QuoteCtaSection />
    </MarketingShell>
  );
}
