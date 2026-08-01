// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProcessSection } from "./ProcessSection";

/**
 * The three step cards enter in sequence, which is the one place a stagger can
 * go wrong in a way a visitor notices: a card that never arrives. Motion is
 * inert in jsdom, so this asserts the state a broken sequence would leave
 * behind — all three steps present, in order, and reachable. Nothing here
 * asserts animation state.
 */
describe("ProcessSection", () => {
  it("renders all three steps on first render", () => {
    render(<ProcessSection />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Design Template" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "3D Mock-up" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Production" }),
    ).toBeInTheDocument();
  });

  it("keeps the steps an ordered list of three items", () => {
    render(<ProcessSection />);

    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("renders each step's copy immediately, not after an entrance", () => {
    render(<ProcessSection />);

    expect(screen.getByText(/Drop your colors, logos, and ideas/)).toBeInTheDocument();
    expect(screen.getByText(/turn your design into a 3D mock-up/)).toBeInTheDocument();
    expect(screen.getByText(/production starts/)).toBeInTheDocument();
  });

  it("ships a scripting-off stylesheet so the sequence cannot strand a step", () => {
    const { container } = render(<ProcessSection />);

    const fallback = container.querySelector("noscript");
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toContain("[data-reveal]");
    expect(fallback?.textContent).toContain("opacity:1");
  });

  it("animates whole cards, never the connectors on their own", () => {
    const { container } = render(<ProcessSection />);

    // One marker per step card. The connector spans are absolutely positioned
    // decorations that must ride along with their card rather than take a turn
    // of their own in the sequence.
    expect(container.querySelectorAll("[data-reveal]")).toHaveLength(3);
    for (const marker of container.querySelectorAll("[data-reveal]")) {
      expect(marker.querySelector("[data-slot=card]")).not.toBeNull();
    }
  });
});
