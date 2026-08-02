"use client";

import { ThemeToggle } from "@/components/theme-toggle";

/**
 * TEMPORARY — two theme toggles side by side, one per candidate transition, so
 * the swap can be judged in the running app instead of from a description.
 * Tracked as N-10; N-11 is the decision that deletes this file.
 *
 * To remove: delete this file and change the six `<ThemeToggleCompare />` call
 * sites back to `<ThemeToggle />` (MarketingNav, PortalShell and AdminShell,
 * ×2 each — desktop bar and mobile sheet). `ThemeToggle`'s `variant` prop then
 * wants whichever one won as its default.
 *
 * The labels are what make this usable — two identical sun icons that behave
 * differently would be a guessing game — and they are also the most obvious
 * signal that this control is scaffolding rather than shipped UI.
 */
export function ThemeToggleCompare() {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-dashed border-muted-foreground/40 px-0.5"
      role="group"
      aria-label="Theme transition comparison"
    >
      <ThemeToggle variant="crossfade" label="Toggle theme with a crossfade" />
      <span className="pointer-events-none -ml-1 text-[10px] tracking-tight text-muted-foreground">
        fade
      </span>
      <ThemeToggle variant="circle" label="Toggle theme with a circular reveal" />
      <span className="pointer-events-none -ml-1 pr-1 text-[10px] tracking-tight text-muted-foreground">
        circle
      </span>
    </div>
  );
}
