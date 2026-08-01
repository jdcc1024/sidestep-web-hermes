// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Reveal } from "./Reveal";

/**
 * jsdom has no layout and no IntersectionObserver, so Motion never runs here —
 * which is exactly the environment worth testing. What these assert is the one
 * failure mode a reveal can have that matters: content that never becomes
 * visible. Animation state is deliberately not asserted anywhere.
 */
describe("Reveal", () => {
  it("renders its children", () => {
    render(
      <Reveal>
        <p>Sections still say what they said before.</p>
      </Reveal>,
    );

    expect(
      screen.getByText("Sections still say what they said before."),
    ).toBeInTheDocument();
  });

  it("keeps children in the accessibility tree", () => {
    render(
      <Reveal>
        <section aria-labelledby="pricing-heading">
          <h2 id="pricing-heading">Simple volume pricing</h2>
          <a href="/quote">Get a quote</a>
        </section>
      </Reveal>,
    );

    expect(
      screen.getByRole("heading", { name: "Simple volume pricing" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get a quote" })).toBeInTheDocument();
  });

  it("ships a scripting-off stylesheet so hidden content cannot get stuck", () => {
    const { container } = render(
      <Reveal>
        <p>Visible without JS</p>
      </Reveal>,
    );

    const fallback = container.querySelector("noscript");
    expect(fallback).not.toBeNull();
    // Browsers parse noscript content as text when scripting is on, so read it
    // as text rather than looking for a parsed <style> element.
    expect(fallback?.textContent).toContain("[data-reveal]");
    expect(fallback?.textContent).toContain("opacity:1");
  });

  it("marks the animated element so the fallback can target it", () => {
    const { container } = render(
      <Reveal>
        <p>Anything</p>
      </Reveal>,
    );

    expect(container.querySelector("[data-reveal]")).not.toBeNull();
  });

  it("accepts delay and offset overrides without dropping children", () => {
    render(
      <Reveal delay={0.2} offset={8} className="h-full">
        <p>Third card</p>
      </Reveal>,
    );

    expect(screen.getByText("Third card")).toBeInTheDocument();
  });
});
