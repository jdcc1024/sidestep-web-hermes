// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { HeroSection } from "./HeroSection";

/**
 * The hero is the largest contentful paint on the site and the first thing a
 * visitor reads, so the entrance animation has exactly one way to fail that
 * matters: content that is not there, or not reachable, the moment the section
 * renders. Motion is inert in jsdom, which makes this the right place to lock
 * that in. Nothing here asserts animation state.
 */
describe("HeroSection", () => {
  it("exposes the headline and both CTAs by role on first render", () => {
    render(<HeroSection />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Custom team jerseys, designed with you.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start your order" })).toHaveAttribute(
      "href",
      "/intake",
    );
    expect(screen.getByRole("link", { name: "See our process" })).toHaveAttribute(
      "href",
      "#process",
    );
  });

  it("renders its supporting copy immediately, not after an entrance", () => {
    render(<HeroSection />);

    expect(screen.getByText("Your Team. Your Colors.")).toBeInTheDocument();
    expect(screen.getByText(/Vancouver-based custom jersey studio/)).toBeInTheDocument();
    expect(screen.getByText(/Most orders ship in around 4/)).toBeInTheDocument();
  });

  it("ships a scripting-off stylesheet so the entrance cannot strand the hero", () => {
    const { container } = render(<HeroSection />);

    const fallback = container.querySelector("noscript");
    expect(fallback).not.toBeNull();
    // Browsers parse noscript content as text when scripting is on, so read it
    // as text rather than looking for a parsed <style> element.
    expect(fallback?.textContent).toContain("[data-reveal]");
    expect(fallback?.textContent).toContain("opacity:1");
  });

  it("marks every entering element so the fallback can target it", () => {
    const { container } = render(<HeroSection />);

    // Eyebrow, headline, subcopy, CTA row, footnote, carousel.
    expect(container.querySelectorAll("[data-reveal]")).toHaveLength(6);
  });
});
