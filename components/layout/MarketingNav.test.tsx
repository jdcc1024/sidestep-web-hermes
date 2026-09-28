// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

// Signed-out visitor: the marketing audience.
vi.mock("convex/react", () => ({
  Authenticated: () => null,
  Unauthenticated: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

import { MarketingNav } from "./MarketingNav";

/**
 * Acceptance test for F-01 (backlog/F-01-faq-answer-source.md), MarketingNav:
 * a "FAQ" link to /#faq after "Pricing", on desktop and in the mobile sheet.
 */
function sectionLinks(nav: HTMLElement) {
  return within(nav)
    .getAllByRole("link")
    .map((link) => ({ label: link.textContent?.trim(), href: link.getAttribute("href") }));
}

function expectFaqAfterPricing(nav: HTMLElement) {
  const links = sectionLinks(nav);
  const pricing = links.findIndex((l) => l.label === "Pricing");
  expect(pricing, "Pricing link").toBeGreaterThanOrEqual(0);
  expect(links[pricing + 1]).toEqual({ label: "FAQ", href: "/#faq" });
  expect(links.filter((l) => l.label === "FAQ")).toHaveLength(1);
}

describe("MarketingNav", () => {
  it('a "FAQ" link with href="/#faq" appears after "Pricing" in the desktop nav and in the mobile sheet', async () => {
    const user = userEvent.setup();
    render(<MarketingNav />);

    // Desktop bar: the only "Main" nav mounted while the sheet is closed.
    expectFaqAfterPricing(screen.getByRole("navigation", { name: "Main" }));

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const sheet = await screen.findByRole("dialog");
    expectFaqAfterPricing(within(sheet).getByRole("navigation", { name: "Main" }));
  });
});
