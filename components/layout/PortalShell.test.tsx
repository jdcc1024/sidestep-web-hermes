// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let mockPathname = "/portal";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

import { PortalShell } from "./PortalShell";

/**
 * The sliding indicator is decoration on top of the one thing that actually has
 * to be right: which link the shell calls the current page. So that is what is
 * asserted here — `aria-current`, on exactly one link, on the right one — plus
 * the indicator's structural contract (it lives in the current link and is
 * hidden from assistive tech). The slide itself is never asserted: jsdom has no
 * layout, so Motion is inert here by design.
 */
function renderAt(pathname: string) {
  mockPathname = pathname;
  const view = render(
    <PortalShell>
      <p>Portal content</p>
    </PortalShell>,
  );
  // Only the desktop sidebar's nav is mounted with the sheet closed, which is
  // also the only copy that carries the indicator.
  return { ...view, nav: screen.getByRole("navigation", { name: "Portal navigation" }) };
}

function currentLinks(nav: HTMLElement) {
  return within(nav)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page");
}

describe("PortalShell navigation", () => {
  it("renders its children", () => {
    renderAt("/portal");
    expect(screen.getByText("Portal content")).toBeInTheDocument();
  });

  it("marks exactly one link as the current page", () => {
    const { nav } = renderAt("/portal/designs");

    const current = currentLinks(nav);
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("My Designs");
  });

  it("treats the orders root as an exact match so it does not claim siblings", () => {
    const { nav } = renderAt("/portal/designs");

    expect(
      within(nav).getByRole("link", { name: "My Orders" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("keeps a section current on its nested routes", () => {
    const { nav } = renderAt("/portal/designs/abc123");

    const current = currentLinks(nav);
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("My Designs");
  });

  it("marks My Orders current on the portal root", () => {
    const { nav } = renderAt("/portal");

    const current = currentLinks(nav);
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("My Orders");
  });

  it("claims no link on a route no section owns", () => {
    const { nav } = renderAt("/portal/orders/new");

    expect(currentLinks(nav)).toHaveLength(0);
    expect(screen.queryByTestId("portal-nav-indicator")).toBeNull();
  });

  it("puts a single indicator inside the current link, hidden from assistive tech", () => {
    const { nav } = renderAt("/portal/designs");

    const indicators = screen.getAllByTestId("portal-nav-indicator");
    expect(indicators).toHaveLength(1);
    expect(indicators[0]).toHaveAttribute("aria-hidden", "true");
    expect(currentLinks(nav)[0]).toContainElement(indicators[0]);
  });

  // Two elements sharing one `layoutId` would have Motion animating between two
  // copies of the same nav, so the sheet's copy marks its current link without
  // an indicator — while still marking it.
  it("marks the current link in the mobile menu without a second indicator", async () => {
    const user = userEvent.setup();
    renderAt("/portal/designs");

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const sheet = await screen.findByRole("dialog");
    const sheetNav = within(sheet).getByRole("navigation", {
      name: "Portal navigation",
    });

    const current = currentLinks(sheetNav);
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("My Designs");
    expect(within(sheet).queryByTestId("portal-nav-indicator")).toBeNull();
    // The sidebar's indicator is still the only one on the page.
    expect(screen.getAllByTestId("portal-nav-indicator")).toHaveLength(1);
  });
});
